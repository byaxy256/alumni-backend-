// src/routes/mentors-mongo.ts - MongoDB-based mentorship
import express from 'express';
import { User } from '../models/User.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// GET /api/mentors - Get all alumni (mentors)
router.get('/', authenticate, async (req, res) => {
  try {
    const mentors = await User.find({ role: 'alumni' }).select('-password').lean();

    // Map User documents to frontend-friendly Mentor shape
    const mapped = mentors.map((u: any) => ({
      id: u._id?.toString(),
      name: u.full_name || '',
      title: u.meta?.title || '',
      company: u.meta?.company || '',
      location: u.meta?.location || '',
      rating: u.meta?.rating || 4.5,
      mentees: Array.isArray(u.meta?.approved_mentees) ? u.meta.approved_mentees.length : 0,
      classOf: u.meta?.classOf || (u.meta?.graduationYear || null),
      bio: u.meta?.bio || '',
      tags: u.meta?.tags || [],
      status: u.meta?.status || 'available',
      field: u.meta?.field || u.meta?.course || '',
      expertise: Array.isArray(u.meta?.expertise) ? u.meta.expertise : (u.meta?.expertise ? [u.meta.expertise] : []),
      experience: u.meta?.experience || 0,
      maxMentees: u.meta?.maxMentees || 10,
    }));

    res.json(mapped);
  } catch (err) {
    console.error('GET /mentors error:', err);
    res.status(500).json({ error: 'Failed to fetch mentors' });
  }
});

// GET /api/mentors/my-mentors - Get mentors for current student
router.get('/my-mentors', authenticate, authorize(['student']), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const approvedMentorIds = Array.isArray(user?.meta?.approved_mentors) ? user.meta.approved_mentors : [];
    if (approvedMentorIds.length === 0) return res.json([]);

    // Normalize possible id shapes to string ids that Mongo can use
    const ids = approvedMentorIds.map((id: any) => {
      try {
        if (!id) return null;
        if (typeof id === 'string') return id;
        if (typeof id === 'object') {
          if (id._id) return id._id.toString();
          if (id.id) return id.id.toString();
          if (id.uid) return id.uid; // maybe stored as uid
          return id.toString();
        }
        return String(id);
      } catch (e) {
        return null;
      }
    }).filter(Boolean as any);

    if (ids.length === 0) return res.json([]);

    let mentors;
    try {
      // ids may contain Mongo _id strings (24 hex) or UIDs like 'u12345'.
      const objectIds = ids.filter((s: string) => /^[a-fA-F0-9]{24}$/.test(s));
      const uidIds = ids; // match against uid field as well
      const query: any = { $or: [] };
      if (objectIds.length) query.$or.push({ _id: { $in: objectIds } });
      if (uidIds.length) query.$or.push({ uid: { $in: uidIds } });
      if (query.$or.length === 0) return res.json([]);
      mentors = await User.find(query).select('-password').lean();
    } catch (dbErr) {
      console.error('DB error fetching mentors for ids:', ids, dbErr);
      return res.status(500).json({ error: 'Failed to fetch mentors' });
    }

    // Map to frontend Mentor shape (same mapping as GET /api/mentors)
    const mapped = mentors.map((u: any) => ({
      id: u._id?.toString(),
      name: u.full_name || '',
      title: u.meta?.title || '',
      company: u.meta?.company || '',
      location: u.meta?.location || '',
      rating: (u.meta && typeof u.meta.rating === 'number') ? u.meta.rating : 4.5,
      mentees: Array.isArray(u.meta?.approved_mentees) ? u.meta.approved_mentees.length : 0,
      classOf: u.meta?.classOf || (u.meta?.graduationYear || null),
      bio: u.meta?.bio || '',
      tags: Array.isArray(u.meta?.tags) ? u.meta.tags : [],
      status: u.meta?.status || 'available',
      field: u.meta?.field || u.meta?.course || '',
      expertise: Array.isArray(u.meta?.expertise) ? u.meta.expertise : (u.meta?.expertise ? [u.meta.expertise] : []),
      experience: u.meta?.experience || 0,
      maxMentees: u.meta?.maxMentees || 10,
    }));

    res.json(mapped);
  } catch (err) {
    console.error('GET /my-mentors error:', err);
    res.status(500).json({ error: 'Failed to fetch mentors' });
  }
});

// POST /api/mentors/request - Request a mentor
router.post('/request', authenticate, authorize(['student']), async (req, res) => {
  try {
    const { mentorId } = req.body;
    const userId = (req as any).user.id;
    const student = await User.findById(userId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const mentor = await User.findById(mentorId);
    if (!mentor || mentor.role !== 'alumni') return res.status(404).json({ error: 'Mentor not found' });

    // Add to student's pending_mentors (store ids as strings)
    if (!student.meta) student.meta = {};
    if (!Array.isArray(student.meta.pending_mentors)) student.meta.pending_mentors = [];
    const pendingMentors = student.meta.pending_mentors.map((id: any) => id.toString());
    if (!pendingMentors.includes(mentor._id.toString())) {
      student.meta.pending_mentors.push(mentor._id.toString());
      await student.save();
    }

    // Add to mentor's pending_requests
    if (!mentor.meta) mentor.meta = {};
    if (!Array.isArray(mentor.meta.pending_requests)) mentor.meta.pending_requests = [];
    const pendingReqs = mentor.meta.pending_requests.map((id: any) => id.toString());
    if (!pendingReqs.includes(student._id.toString())) {
      mentor.meta.pending_requests.push(student._id.toString());
      await mentor.save();
    }

    res.json({ message: 'Mentor request sent' });
  } catch (err) {
    console.error('POST /request error:', err);
    res.status(500).json({ error: 'Failed to request mentor' });
  }
});

// POST /api/mentors/approve - Approve a mentee request
router.post('/approve', authenticate, authorize(['alumni']), async (req, res) => {
  try {
    const { studentId } = req.body;
    const mentorId = (req as any).user.id;
    const mentor = await User.findById(mentorId);
    const student = await User.findById(studentId);
    if (!mentor) return res.status(404).json({ error: 'Mentor not found' });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Move from pending to approved for mentor
    if (!mentor.meta) mentor.meta = {};
    if (!Array.isArray(mentor.meta.approved_mentees)) mentor.meta.approved_mentees = [];
    mentor.meta.pending_requests = (mentor.meta.pending_requests || []).filter((id: any) => id.toString() !== studentId);
    if (!mentor.meta.approved_mentees.map((id: any) => id.toString()).includes(student._id.toString())) {
      mentor.meta.approved_mentees.push(student._id.toString());
    }
    await mentor.save();

    // Move from pending to approved for student
    if (!student.meta) student.meta = {};
    if (!Array.isArray(student.meta.approved_mentors)) student.meta.approved_mentors = [];
    student.meta.pending_mentors = (student.meta.pending_mentors || []).filter((id: any) => id.toString() !== mentorId);
    if (!student.meta.approved_mentors.map((id: any) => id.toString()).includes(mentor._id.toString())) {
      student.meta.approved_mentors.push(mentor._id.toString());
    }
    await student.save();

    res.json({ message: 'Mentee approved' });
  } catch (err) {
    console.error('POST /approve error:', err);
    res.status(500).json({ error: 'Failed to approve mentee' });
  }
});

// POST /api/mentors/reject - Reject a mentee request
router.post('/reject', authenticate, authorize(['alumni']), async (req, res) => {
  try {
    const { studentId } = req.body;
    const mentorId = (req as any).user.id;

    const mentor = await User.findById(mentorId);
    if (!mentor) return res.status(404).json({ error: 'Mentor not found' });

    if (!mentor.meta) mentor.meta = {};
    mentor.meta.pending_requests = (mentor.meta.pending_requests || []).filter((id: any) => id.toString() !== studentId);
    await mentor.save();

    res.json({ message: 'Mentee request rejected' });
  } catch (err) {
    console.error('POST /reject error:', err);
    res.status(500).json({ error: 'Failed to reject mentee' });
  }
});

// GET /api/mentors/my-approved-mentees - Get mentor's approved mentees
router.get('/my-approved-mentees', authenticate, authorize(['alumni']), async (req, res) => {
  try {
    const mentorId = (req as any).user.id;
    const mentor = await User.findById(mentorId).lean();
    if (!mentor) return res.status(404).json({ error: 'Mentor not found' });

    const approvedMenteeIds = (mentor.meta && mentor.meta.approved_mentees) || [];
    if (!Array.isArray(approvedMenteeIds) || approvedMenteeIds.length === 0) return res.json([]);

    const ids = approvedMenteeIds.map((id: any) => id.toString());
    const mentees = await User.find({ _id: { $in: ids } }).select('-password').lean();
    res.json(mentees);
  } catch (err) {
    console.error('GET /my-approved-mentees error:', err);
    res.status(500).json({ error: 'Failed to fetch mentees' });
  }
});

// POST /api/mentors/remove-approved - Remove an approved mentee
router.post('/remove-approved', authenticate, authorize(['alumni']), async (req, res) => {
  try {
    const { studentId } = req.body;
    const mentorId = (req as any).user.id;

    const mentor = await User.findById(mentorId);
    if (!mentor) return res.status(404).json({ error: 'Mentor not found' });

    if (!mentor.meta) mentor.meta = {};
    mentor.meta.approved_mentees = (mentor.meta.approved_mentees || []).filter((id: any) => id.toString() !== studentId);
    await mentor.save();

    const student = await User.findById(studentId);
    if (student) {
      if (!student.meta) student.meta = {};
      student.meta.approved_mentors = (student.meta.approved_mentors || []).filter((id: any) => id.toString() !== mentorId);
      await student.save();
    }

    res.json({ message: 'Mentee removed' });
  } catch (err) {
    console.error('POST /remove-approved error:', err);
    res.status(500).json({ error: 'Failed to remove mentee' });
  }
});

// GET /api/mentors/students-by-field - Get students by field (for alumni finding mentees)
router.get('/students-by-field', authenticate, async (req, res) => {
  try {
    const { field } = req.query;
    const query: any = { role: 'student' };
    if (field) {
      query.$or = [
        { 'meta.field': new RegExp(field as string, 'i') },
        { 'meta.course': new RegExp(field as string, 'i') },
      ];
    }
    
    const students = await User.find(query).select('-password').lean();
    res.json(students);
  } catch (err) {
    console.error('GET /students-by-field error:', err);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

export default router;
