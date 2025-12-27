import express from 'express';
import db from '../db.js';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
dotenv.config();
const router = express.Router();
const MAX_MENTEES_PER_MENTOR = 15;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const parseMeta = (raw) => {
    try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
    }
    catch {
        return {};
    }
};
// Get all available mentors
router.get('/', async (req, res) => {
    try {
        const { field, search } = req.query;
        const auth = req.headers.authorization;
        let requesterUid = null;
        let requesterRole = null;
        if (auth) {
            const token = auth.replace('Bearer ', '');
            try {
                const payload = jwt.verify(token, JWT_SECRET);
                requesterUid = payload?.uid || null;
                requesterRole = payload?.role || null;
            }
            catch {
                // ignore invalid token for public browsing
            }
        }
        let query = `
      SELECT 
        u.uid,
        u.full_name,
        u.email,
        u.meta,
        CASE 
          WHEN u.role = 'alumni' THEN 'Available'
          ELSE 'Unavailable'
        END as status
      FROM users u 
      WHERE u.role = 'alumni'
    `;
        const params = [];
        if (field) {
            query += ` AND JSON_EXTRACT(u.meta, '$.field') = ?`;
            params.push(field);
        }
        if (search) {
            query += ` AND (u.full_name LIKE ? OR JSON_EXTRACT(u.meta, '$.title') LIKE ? OR JSON_EXTRACT(u.meta, '$.company') LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }
        query += ` ORDER BY u.full_name ASC`;
        const [rows] = await db.execute(query, params);
        const mentors = [];
        for (const row of rows) {
            const meta = parseMeta(row.meta);
            const pendingRequests = Array.isArray(meta.pending_requests) ? meta.pending_requests : [];
            const approvedMentees = Array.isArray(meta.approved_mentees) ? meta.approved_mentees : [];
            const currentMentees = Math.max(Number(meta.mentees) || 0, pendingRequests.length);
            const isAvailable = currentMentees < MAX_MENTEES_PER_MENTOR;
            // If student already requested or is approved, hide this mentor from their available list
            if (requesterRole === 'student' && requesterUid) {
                if (pendingRequests.includes(requesterUid) || approvedMentees.includes(requesterUid)) {
                    continue;
                }
            }
            mentors.push({
                id: row.uid,
                name: row.full_name,
                title: meta.title || 'Alumni',
                company: meta.company || meta.workplace || meta.currentWorkplace || 'Not specified',
                location: meta.location || 'Not specified',
                rating: meta.rating || 4.5,
                mentees: currentMentees,
                classOf: meta.graduation_year || meta.graduationYear || 'N/A',
                bio: meta.bio || meta.about || 'Alumni mentor',
                status: isAvailable ? 'available' : 'unavailable',
                field: meta.field || 'General',
                expertise: meta.expertise || [],
                experience: meta.experience_years || meta.experienceYears || 0,
                maxMentees: MAX_MENTEES_PER_MENTOR
            });
        }
        res.json(mentors);
    }
    catch (error) {
        console.error('Error fetching mentors:', error);
        res.status(500).json({ error: 'Failed to fetch mentors' });
    }
});
// Get students by field (for alumni dashboard)
router.get('/students-by-field', async (req, res) => {
    try {
        const { field } = req.query;
        if (!field) {
            return res.status(400).json({ error: 'Field parameter is required' });
        }
        let query = `
      SELECT 
        u.uid,
        u.full_name,
        u.email,
        u.phone,
        u.meta
      FROM users u 
      WHERE u.role = 'student'
    `;
        const params = [];
        // Match student's field with mentor's field
        query += ` AND JSON_EXTRACT(u.meta, '$.field') = ?`;
        params.push(field);
        query += ` ORDER BY u.full_name ASC`;
        const [rows] = await db.execute(query, params);
        const students = rows.map(row => {
            const meta = parseMeta(row.meta);
            return {
                id: row.uid,
                name: row.full_name,
                email: row.email,
                phone: row.phone || 'Not provided',
                course: meta.field || 'General',
                year: meta.year || 'N/A',
                graduationYear: meta.graduation_year || 'N/A',
                bio: meta.bio || 'UCU Student looking for mentorship.',
                interests: meta.interests || [],
                needsGuidance: meta.needs_guidance || 'Academic and Career Guidance'
            };
        });
        res.json(students);
    }
    catch (error) {
        console.error('Error fetching students by field:', error);
        res.status(500).json({ error: 'Failed to fetch students' });
    }
});
// Get my mentors (for students) or pending requests (for alumni)
router.get('/my-mentors', async (req, res) => {
    try {
        const auth = req.headers.authorization;
        if (!auth)
            return res.status(401).json({ error: 'No token' });
        const token = auth.replace('Bearer ', '');
        let payload;
        try {
            payload = jwt.verify(token, JWT_SECRET);
        }
        catch {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        if (!payload?.uid)
            return res.status(401).json({ error: 'Invalid token payload' });
        // For students: get their approved mentors
        if (payload.role === 'student') {
            const [userRows] = await db.execute('SELECT meta FROM users WHERE uid = ? LIMIT 1', [payload.uid]);
            if (!Array.isArray(userRows) || userRows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            const userMeta = parseMeta(userRows[0].meta);
            const approvedMentors = Array.isArray(userMeta.approved_mentors) ? userMeta.approved_mentors : [];
            if (approvedMentors.length === 0) {
                return res.json([]);
            }
            const placeholders = approvedMentors.map(() => '?').join(',');
            const [mentorRows] = await db.execute(`SELECT uid, full_name, meta FROM users WHERE uid IN (${placeholders})`, approvedMentors);
            const mentors = mentorRows.map(row => {
                const meta = parseMeta(row.meta);
                return {
                    id: row.uid,
                    name: row.full_name,
                    field: meta.field || 'General',
                    course: meta.field || 'General',
                    lastMessage: meta.lastMessage || '',
                    unread: meta.unread || 0,
                    isOnline: meta.isOnline || false,
                    lastSeen: meta.lastSeen || 'Recently'
                };
            });
            return res.json(mentors);
        }
        // For alumni: get their pending requests
        const [mentorRows] = await db.execute('SELECT meta FROM users WHERE uid = ? LIMIT 1', [payload.uid]);
        if (!Array.isArray(mentorRows) || mentorRows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const mentorMeta = parseMeta(mentorRows[0].meta);
        const pendingRequests = Array.isArray(mentorMeta.pending_requests) ? mentorMeta.pending_requests : [];
        if (pendingRequests.length === 0) {
            return res.json([]);
        }
        const placeholders = pendingRequests.map(() => '?').join(',');
        const [studentRows] = await db.execute(`SELECT uid, full_name, meta FROM users WHERE uid IN (${placeholders})`, pendingRequests);
        const mentees = studentRows.map(row => {
            const meta = parseMeta(row.meta);
            return {
                id: row.uid,
                name: row.full_name,
                field: meta.field || 'General',
                course: meta.field || 'General',
                lastMessage: meta.lastMessage || '',
                unread: meta.unread || 0,
                isOnline: meta.isOnline || false,
                lastSeen: meta.lastSeen || 'Recently'
            };
        });
        res.json(mentees);
    }
    catch (error) {
        console.error('Error fetching my mentors:', error);
        res.status(500).json({ error: 'Failed to fetch my mentors' });
    }
});
// Request a mentor
router.post('/request', async (req, res) => {
    try {
        const auth = req.headers.authorization;
        if (!auth)
            return res.status(401).json({ error: 'No token' });
        const { mentorId } = req.body;
        if (!mentorId)
            return res.status(400).json({ error: 'Mentor ID is required' });
        const token = auth.replace('Bearer ', '');
        let payload;
        try {
            payload = jwt.verify(token, JWT_SECRET);
        }
        catch {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        const studentUid = payload?.uid;
        const role = payload?.role;
        if (!studentUid)
            return res.status(401).json({ error: 'Invalid token payload' });
        if (role !== 'student')
            return res.status(403).json({ error: 'Only students can request mentors' });
        // Get mentor data
        const [mentorRows] = await db.execute('SELECT meta FROM users WHERE uid = ? LIMIT 1', [mentorId]);
        if (!Array.isArray(mentorRows) || mentorRows.length === 0) {
            return res.status(404).json({ error: 'Mentor not found' });
        }
        const mentorMeta = parseMeta(mentorRows[0].meta);
        const pendingRequests = Array.isArray(mentorMeta.pending_requests) ? mentorMeta.pending_requests : [];
        const menteeCount = Number(mentorMeta.mentees) || 0;
        const currentCount = Math.max(menteeCount, pendingRequests.length);
        if (pendingRequests.includes(studentUid)) {
            return res.status(400).json({ error: 'You already requested this mentor' });
        }
        if (currentCount >= MAX_MENTEES_PER_MENTOR) {
            return res.status(400).json({ error: 'Mentor has reached maximum mentees' });
        }
        pendingRequests.push(studentUid);
        const updatedMentorMeta = {
            ...mentorMeta,
            pending_requests: pendingRequests,
            mentees: Math.max(currentCount + 1, pendingRequests.length)
        };
        await db.execute('UPDATE users SET meta = ? WHERE uid = ?', [JSON.stringify(updatedMentorMeta), mentorId]);
        // Also store on student's side - add to pending_mentors
        const [studentRows] = await db.execute('SELECT meta FROM users WHERE uid = ? LIMIT 1', [studentUid]);
        if (Array.isArray(studentRows) && studentRows.length > 0) {
            const studentMeta = parseMeta(studentRows[0].meta);
            const pendingMentors = Array.isArray(studentMeta.pending_mentors) ? studentMeta.pending_mentors : [];
            if (!pendingMentors.includes(mentorId)) {
                pendingMentors.push(mentorId);
            }
            const updatedStudentMeta = {
                ...studentMeta,
                pending_mentors: pendingMentors
            };
            await db.execute('UPDATE users SET meta = ? WHERE uid = ?', [JSON.stringify(updatedStudentMeta), studentUid]);
        }
        res.json({ message: 'Mentor request sent successfully!', pendingCount: pendingRequests.length });
    }
    catch (error) {
        console.error('Error requesting mentor:', error);
        res.status(500).json({ error: 'Failed to request mentor' });
    }
});
// Approve mentor request
router.post('/approve', async (req, res) => {
    try {
        const auth = req.headers.authorization;
        if (!auth)
            return res.status(401).json({ error: 'No token' });
        const { studentId } = req.body;
        if (!studentId)
            return res.status(400).json({ error: 'Student ID is required' });
        const token = auth.replace('Bearer ', '');
        let payload;
        try {
            payload = jwt.verify(token, JWT_SECRET);
        }
        catch {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        const mentorUid = payload?.uid;
        const role = payload?.role;
        if (!mentorUid)
            return res.status(401).json({ error: 'Invalid token payload' });
        if (role !== 'alumni')
            return res.status(403).json({ error: 'Only alumni can approve requests' });
        const [rows] = await db.execute('SELECT full_name, meta FROM users WHERE uid = ? LIMIT 1', [mentorUid]);
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(404).json({ error: 'Mentor not found' });
        }
        const meta = parseMeta(rows[0].meta);
        const pendingRequests = Array.isArray(meta.pending_requests) ? meta.pending_requests : [];
        const approvedMentees = Array.isArray(meta.approved_mentees) ? meta.approved_mentees : [];
        if (!pendingRequests.includes(studentId)) {
            return res.status(400).json({ error: 'No pending request from this student' });
        }
        // Remove from pending and add to approved
        const updatedPending = pendingRequests.filter(id => id !== studentId);
        const updatedApproved = [...approvedMentees, studentId];
        const updatedMeta = {
            ...meta,
            pending_requests: updatedPending,
            approved_mentees: updatedApproved,
            mentees: updatedApproved.length
        };
        await db.execute('UPDATE users SET meta = ? WHERE uid = ?', [JSON.stringify(updatedMeta), mentorUid]);
        // Also update student's metadata - move from pending_mentors to approved_mentors
        const [studentRows] = await db.execute('SELECT meta FROM users WHERE uid = ? LIMIT 1', [studentId]);
        if (Array.isArray(studentRows) && studentRows.length > 0) {
            const studentMeta = parseMeta(studentRows[0].meta);
            const pendingMentors = Array.isArray(studentMeta.pending_mentors) ? studentMeta.pending_mentors : [];
            const approvedMentors = Array.isArray(studentMeta.approved_mentors) ? studentMeta.approved_mentors : [];
            // Remove from pending and add to approved (ensure mentor isn't already in approved)
            const updatedStudentPending = pendingMentors.filter(id => id !== mentorUid);
            const updatedStudentApproved = approvedMentors.includes(mentorUid)
                ? approvedMentors
                : [...approvedMentors, mentorUid];
            const updatedStudentMeta = {
                ...studentMeta,
                pending_mentors: updatedStudentPending,
                approved_mentors: updatedStudentApproved
            };
            await db.execute('UPDATE users SET meta = ? WHERE uid = ?', [JSON.stringify(updatedStudentMeta), studentId]);
        }
        // Notify the student
        const mentorName = rows[0].full_name || 'Your mentor';
        await db.execute('INSERT INTO notifications (target_uid, title, message) VALUES (?, ?, ?)', [studentId, 'Mentor request approved', `${mentorName} approved your mentorship request.`]);
        res.json({ message: 'Request approved successfully!' });
    }
    catch (error) {
        console.error('Error approving request:', error);
        res.status(500).json({ error: 'Failed to approve request' });
    }
});
// Reject mentor request
router.post('/reject', async (req, res) => {
    try {
        const auth = req.headers.authorization;
        if (!auth)
            return res.status(401).json({ error: 'No token' });
        const { studentId } = req.body;
        if (!studentId)
            return res.status(400).json({ error: 'Student ID is required' });
        const token = auth.replace('Bearer ', '');
        let payload;
        try {
            payload = jwt.verify(token, JWT_SECRET);
        }
        catch {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        const mentorUid = payload?.uid;
        const role = payload?.role;
        if (!mentorUid)
            return res.status(401).json({ error: 'Invalid token payload' });
        if (role !== 'alumni')
            return res.status(403).json({ error: 'Only alumni can reject requests' });
        const [rows] = await db.execute('SELECT full_name, meta FROM users WHERE uid = ? LIMIT 1', [mentorUid]);
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(404).json({ error: 'Mentor not found' });
        }
        const meta = parseMeta(rows[0].meta);
        const pendingRequests = Array.isArray(meta.pending_requests) ? meta.pending_requests : [];
        if (!pendingRequests.includes(studentId)) {
            return res.status(400).json({ error: 'No pending request from this student' });
        }
        // Remove from pending
        const updatedPending = pendingRequests.filter(id => id !== studentId);
        const updatedMeta = {
            ...meta,
            pending_requests: updatedPending,
            mentees: Math.max((meta.approved_mentees?.length || 0), updatedPending.length)
        };
        await db.execute('UPDATE users SET meta = ? WHERE uid = ?', [JSON.stringify(updatedMeta), mentorUid]);
        // Also update student's metadata - remove from pending_mentors
        const [studentRows] = await db.execute('SELECT meta FROM users WHERE uid = ? LIMIT 1', [studentId]);
        if (Array.isArray(studentRows) && studentRows.length > 0) {
            const studentMeta = parseMeta(studentRows[0].meta);
            const pendingMentors = Array.isArray(studentMeta.pending_mentors) ? studentMeta.pending_mentors : [];
            // Remove from pending
            const updatedStudentPending = pendingMentors.filter(id => id !== mentorUid);
            const updatedStudentMeta = {
                ...studentMeta,
                pending_mentors: updatedStudentPending
            };
            await db.execute('UPDATE users SET meta = ? WHERE uid = ?', [JSON.stringify(updatedStudentMeta), studentId]);
        }
        // Notify the student
        const mentorName = rows[0].full_name || 'Your mentor';
        await db.execute('INSERT INTO notifications (target_uid, title, message) VALUES (?, ?, ?)', [studentId, 'Mentor request declined', `${mentorName} declined your mentorship request.`]);
        res.json({ message: 'Request rejected successfully!' });
    }
    catch (error) {
        console.error('Error rejecting request:', error);
        res.status(500).json({ error: 'Failed to reject request' });
    }
});
// Remove an approved mentee
router.post('/remove-approved', async (req, res) => {
    try {
        const auth = req.headers.authorization;
        if (!auth)
            return res.status(401).json({ error: 'No token' });
        const { studentId } = req.body;
        if (!studentId)
            return res.status(400).json({ error: 'Student ID is required' });
        const token = auth.replace('Bearer ', '');
        let payload;
        try {
            payload = jwt.verify(token, JWT_SECRET);
        }
        catch {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        const mentorUid = payload?.uid;
        const role = payload?.role;
        if (!mentorUid)
            return res.status(401).json({ error: 'Invalid token payload' });
        if (role !== 'alumni')
            return res.status(403).json({ error: 'Only alumni can remove mentees' });
        const [rows] = await db.execute('SELECT meta FROM users WHERE uid = ? LIMIT 1', [mentorUid]);
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(404).json({ error: 'Mentor not found' });
        }
        const meta = parseMeta(rows[0].meta);
        const approvedMentees = Array.isArray(meta.approved_mentees) ? meta.approved_mentees : [];
        if (!approvedMentees.includes(studentId)) {
            return res.status(400).json({ error: 'Student is not an approved mentee' });
        }
        const updatedApproved = approvedMentees.filter(id => id !== studentId);
        const updatedMeta = {
            ...meta,
            approved_mentees: updatedApproved,
            mentees: updatedApproved.length
        };
        await db.execute('UPDATE users SET meta = ? WHERE uid = ?', [JSON.stringify(updatedMeta), mentorUid]);
        // Also update student's metadata - remove from approved_mentors
        const [studentRows] = await db.execute('SELECT meta FROM users WHERE uid = ? LIMIT 1', [studentId]);
        if (Array.isArray(studentRows) && studentRows.length > 0) {
            const studentMeta = parseMeta(studentRows[0].meta);
            const approvedMentors = Array.isArray(studentMeta.approved_mentors) ? studentMeta.approved_mentors : [];
            // Remove from approved
            const updatedStudentApproved = approvedMentors.filter(id => id !== mentorUid);
            const updatedStudentMeta = {
                ...studentMeta,
                approved_mentors: updatedStudentApproved
            };
            await db.execute('UPDATE users SET meta = ? WHERE uid = ?', [JSON.stringify(updatedStudentMeta), studentId]);
        }
        res.json({ message: 'Mentee removed successfully' });
    }
    catch (error) {
        console.error('Error removing mentee:', error);
        res.status(500).json({ error: 'Failed to remove mentee' });
    }
});
// Get approved mentees (for chatting)
router.get('/my-approved-mentees', async (req, res) => {
    try {
        const auth = req.headers.authorization;
        if (!auth)
            return res.status(401).json({ error: 'No token' });
        const token = auth.replace('Bearer ', '');
        let payload;
        try {
            payload = jwt.verify(token, JWT_SECRET);
        }
        catch {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        if (!payload?.uid)
            return res.status(401).json({ error: 'Invalid token payload' });
        if (payload.role !== 'alumni') {
            return res.json([]);
        }
        const [mentorRows] = await db.execute('SELECT meta FROM users WHERE uid = ? LIMIT 1', [payload.uid]);
        if (!Array.isArray(mentorRows) || mentorRows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const mentorMeta = parseMeta(mentorRows[0].meta);
        const approvedMentees = Array.isArray(mentorMeta.approved_mentees) ? mentorMeta.approved_mentees : [];
        if (approvedMentees.length === 0) {
            return res.json([]);
        }
        const placeholders = approvedMentees.map(() => '?').join(',');
        const [studentRows] = await db.execute(`SELECT uid, full_name, meta FROM users WHERE uid IN (${placeholders})`, approvedMentees);
        const mentees = studentRows.map(row => {
            const meta = parseMeta(row.meta);
            return {
                id: row.uid,
                name: row.full_name,
                field: meta.field || 'General',
                course: meta.field || 'General',
                lastMessage: meta.lastMessage || '',
                unread: meta.unread || 0,
                isOnline: meta.isOnline || false,
                lastSeen: meta.lastSeen || 'Recently'
            };
        });
        res.json(mentees);
    }
    catch (error) {
        console.error('Error fetching approved mentees:', error);
        res.status(500).json({ error: 'Failed to fetch approved mentees' });
    }
});
export default router;
