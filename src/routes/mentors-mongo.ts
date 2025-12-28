// src/routes/mentors-mongo.ts - MongoDB-based mentorship
import express from 'express';
import { User } from '../models/User.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// GET /api/mentors - Get all alumni (mentors)
router.get('/', authenticate, async (req, res) => {
  try {
    const mentors = await User.find({ role: 'alumni' }).select('-password').lean();
    res.json(mentors);
  } catch (err) {
    console.error('GET /mentors error:', err);
    res.status(500).json({ error: 'Failed to fetch mentors' });
  }
});

// GET /api/mentors/my-mentors - Get mentors for current student
router.get('/my-mentors', authenticate, async (req, res) => {
  try {
    const user = await User.findById((req as any).user.id).lean();
    const approvedMentorIds = user?.meta?.approved_mentors || [];
    
    if (approvedMentorIds.length === 0) {
      return res.json([]);
    }

    const mentors = await User.find({ _id: { $in: approvedMentorIds } }).select('-password').lean();
    res.json(mentors);
  } catch (err) {
    console.error('GET /my-mentors error:', err);
    res.status(500).json({ error: 'Failed to fetch mentors' });
  }
});

// POST /api/mentors/request - Request a mentor
router.post('/request', authenticate, async (req, res) => {
  try {
    const { mentorId } = req.body;
    const userId = (req as any).user.id;

    const student = await User.findById(userId);
    const mentor = await User.findById(mentorId);

    if (!mentor || mentor.role !== 'alumni') {
      return res.status(404).json({ error: 'Mentor not found' });
    }

    // Add to student's pending_mentors
    if (!student!.meta) student!.meta = {};
    if (!student!.meta.pending_mentors) student!.meta.pending_mentors = [];
    if (!student!.meta.pending_mentors.includes(mentorId)) {
      student!.meta.pending_mentors.push(mentorId);
    }
    await student!.save();

    // Add to mentor's pending_requests
    if (!mentor.meta) mentor.meta = {};
    if (!mentor.meta.pending_requests) mentor.meta.pending_requests = [];
    if (!mentor.meta.pending_requests.includes(userId)) {
      mentor.meta.pending_requests.push(userId);
    }
    await mentor.save();

    res.json({ message: 'Mentor request sent' });
  } catch (err) {
    console.error('POST /request error:', err);
    res.status(500).json({ error: 'Failed to request mentor' });
  }
});

// POST /api/mentors/approve - Approve a mentee request
router.post('/approve', authenticate, async (req, res) => {
  try {
    const { studentId } = req.body;
    const mentorId = (req as any).user.id;

    const mentor = await User.findById(mentorId);
    const student = await User.findById(studentId);

    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Move from pending to approved for mentor
    if (!mentor!.meta) mentor!.meta = {};
    if (!mentor!.meta.approved_mentees) mentor!.meta.approved_mentees = [];
    mentor!.meta.pending_requests = mentor!.meta.pending_requests?.filter((id: any) => id.toString() !== studentId) || [];
    if (!mentor!.meta.approved_mentees.includes(studentId)) {
      mentor!.meta.approved_mentees.push(studentId);
    }
    await mentor!.save();

    // Move from pending to approved for student
    if (!student.meta) student.meta = {};
    if (!student.meta.approved_mentors) student.meta.approved_mentors = [];
    student.meta.pending_mentors = student.meta.pending_mentors?.filter((id: any) => id.toString() !== mentorId) || [];
    if (!student.meta.approved_mentors.includes(mentorId)) {
      student.meta.approved_mentors.push(mentorId);
    }
    await student.save();

    res.json({ message: 'Mentee approved' });
  } catch (err) {
    console.error('POST /approve error:', err);
    res.status(500).json({ error: 'Failed to approve mentee' });
  }
});

// POST /api/mentors/reject - Reject a mentee request
router.post('/reject', authenticate, async (req, res) => {
  try {
    const { studentId } = req.body;
    const mentorId = (req as any).user.id;

    const mentor = await User.findById(mentorId);
    if (!mentor) return res.status(404).json({ error: 'Mentor not found' });

    if (!mentor.meta) mentor.meta = {};
    mentor.meta.pending_requests = mentor.meta.pending_requests?.filter((id: any) => id.toString() !== studentId) || [];
    await mentor.save();

    res.json({ message: 'Mentee request rejected' });
  } catch (err) {
    console.error('POST /reject error:', err);
    res.status(500).json({ error: 'Failed to reject mentee' });
  }
});

// GET /api/mentors/my-approved-mentees - Get mentor's approved mentees
router.get('/my-approved-mentees', authenticate, async (req, res) => {
  try {
    const mentor = await User.findById((req as any).user.id).lean();
    const approvedMenteeIds = mentor?.meta?.approved_mentees || [];
    
    if (approvedMenteeIds.length === 0) {
      return res.json([]);
    }

    const mentees = await User.find({ _id: { $in: approvedMenteeIds } }).select('-password').lean();
    res.json(mentees);
  } catch (err) {
    console.error('GET /my-approved-mentees error:', err);
    res.status(500).json({ error: 'Failed to fetch mentees' });
  }
});

// POST /api/mentors/remove-approved - Remove an approved mentee
router.post('/remove-approved', authenticate, async (req, res) => {
  try {
    const { studentId } = req.body;
    const mentorId = (req as any).user.id;

    const mentor = await User.findById(mentorId);
    if (!mentor) return res.status(404).json({ error: 'Mentor not found' });

    if (!mentor.meta) mentor.meta = {};
    mentor.meta.approved_mentees = mentor.meta.approved_mentees?.filter((id: any) => id.toString() !== studentId) || [];
    await mentor.save();

    const student = await User.findById(studentId);
    if (student) {
      if (!student.meta) student.meta = {};
      student.meta.approved_mentors = student.meta.approved_mentors?.filter((id: any) => id.toString() !== mentorId) || [];
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
