// src/routes/mentors-mongo.ts
import express from 'express';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { MentorAssignment } from '../models/MentorAssignment.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

/**
 * Helper: ensure valid ObjectId
 */
const isObjectId = (id: any) =>
  typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);

/**
 * Map User → Mentor (frontend shape)
 */
const mapMentor = (u: any) => ({
  id: u._id?.toString() || u.id,
  uid: u.uid,
  name: u.full_name || '',
  title: u.meta?.title || '',
  company: u.meta?.company || '',
  location: u.meta?.location || '',
  rating: typeof u.meta?.rating === 'number' ? u.meta.rating : 4.5,
  mentees: Array.isArray(u.meta?.approved_mentees) ? u.meta.approved_mentees.length : 0,
  classOf: u.meta?.classOf || u.meta?.graduationYear || null,
  bio: u.meta?.bio || '',
  tags: Array.isArray(u.meta?.tags) ? u.meta.tags : [],
  status: u.meta?.status || 'available',
  field: u.meta?.field || u.meta?.course || '',
  expertise: Array.isArray(u.meta?.expertise)
    ? u.meta.expertise
    : u.meta?.expertise
    ? [u.meta.expertise]
    : [],
  experience: u.meta?.experience || 0,
  maxMentees: u.meta?.maxMentees || 10,
});

/**
 * IMPORTANT: Specific routes MUST come BEFORE generic routes
 * This ensures /my-mentors and /my-approved-mentees are matched before / catch-all
 */

/**
 * GET /api/mentors/my-mentors
 * Student → assigned mentors via MentorAssignment
 */
router.get('/my-mentors', authenticate, async (req, res) => {
  try {
    const userUid = (req as any).user?.uid;
    const userRole = (req as any).user?.role;

    console.log('GET /my-mentors - User:', { uid: userUid, role: userRole });

    if (!userUid) {
      return res.status(401).json({ error: 'Invalid user - missing UID' });
    }

    if (userRole !== 'student') {
      console.log('Access denied: User role is', userRole, 'but endpoint requires student');
      return res.status(403).json({ error: `Only students can view their mentors. Your role: ${userRole}` });
    }

    // Get active mentor assignments for this student
    const assignments = await MentorAssignment.find({
      student_uid: userUid,
      status: 'active'
    }).lean();

    if (assignments.length === 0) {
      return res.json([]);
    }

    // Get mentor user information
    const mentors = await Promise.all(
      assignments.map(async (assignment) => {
        const mentor = await User.findOne({ uid: assignment.mentor_uid })
          .select('-password')
          .lean();
        return mentor ? mapMentor(mentor) : null;
      })
    );

    res.json(mentors.filter(Boolean));
  } catch (err) {
    console.error('GET /my-mentors error:', err);
    res.status(500).json({ error: 'Failed to fetch mentors' });
  }
});

/**
 * GET /api/mentors/my-approved-mentees
 * Alumni → assigned mentees via MentorAssignment
 */
router.get('/my-approved-mentees', authenticate, async (req, res) => {
  try {
    const userUid = (req as any).user?.uid;
    const userRole = (req as any).user?.role;

    console.log('GET /my-approved-mentees - User:', { uid: userUid, role: userRole });

    if (!userUid) {
      return res.status(401).json({ error: 'Invalid user - missing UID' });
    }

    if (userRole !== 'alumni') {
      console.log('Access denied: User role is', userRole, 'but endpoint requires alumni');
      return res.status(403).json({ error: `Only alumni can view their mentees. Your role: ${userRole}` });
    }

    // Get active mentor assignments where user is the mentor
    const assignments = await MentorAssignment.find({
      mentor_uid: userUid,
      status: 'active'
    }).lean();

    if (assignments.length === 0) {
      return res.json([]);
    }

    // Get student user information
    const students = await Promise.all(
      assignments.map(async (assignment) => {
        const student = await User.findOne({ uid: assignment.student_uid })
          .select('-password')
          .lean();
        return student ? { ...mapMentor(student), course: assignment.field } : null;
      })
    );

    res.json(students.filter(Boolean));
  } catch (err) {
    console.error('GET /my-approved-mentees error:', err);
    res.status(500).json({ error: 'Failed to fetch mentees' });
  }
});

/**
 * POST /api/mentors/request
 * Student requests a mentor
 */
router.post('/request', authenticate, async (req, res) => {
  try {
    const userUid = (req as any).user?.uid;
    const userRole = (req as any).user?.role;
    const { mentorUid } = req.body;

    if (userRole !== 'student') {
      return res.status(403).json({ error: 'Only students can request mentors' });
    }

    if (!userUid || !mentorUid) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    // Check if assignment already exists
    const existing = await MentorAssignment.findOne({
      student_uid: userUid,
      mentor_uid: mentorUid
    });

    if (existing) {
      return res.status(400).json({ error: 'Mentor request already exists' });
    }

    // Create new pending assignment
    const assignment = new MentorAssignment({
      student_uid: userUid,
      mentor_uid: mentorUid,
      status: 'pending',
      requested_at: new Date(),
      field: req.body.field || ''
    });

    await assignment.save();
    res.json({ message: 'Mentor request sent', assignmentId: assignment._id });
  } catch (err) {
    console.error('POST /request error:', err);
    res.status(500).json({ error: 'Failed to request mentor' });
  }
});

/**
 * POST /api/mentors/approve
 * Alumni approves a mentor request
 */
router.post('/approve', authenticate, async (req, res) => {
  try {
    const userUid = (req as any).user?.uid;
    const userRole = (req as any).user?.role;
    const { assignmentId } = req.body;

    if (userRole !== 'alumni') {
      return res.status(403).json({ error: 'Only alumni can approve requests' });
    }

    if (!assignmentId) {
      return res.status(400).json({ error: 'Missing assignmentId' });
    }

    const assignment = await MentorAssignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    if (assignment.mentor_uid !== userUid) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    assignment.status = 'active';
    assignment.  
    
    const mentorAssignmentSchema = new mongoose.Schema({
      student_uid: { type: String, required: true },
      mentor_uid: { type: String, required: true },
      status: { type: String, enum: ['pending', 'active', 'rejected'], default: 'pending' },
      requested_at: { type: Date, default: Date.now },
      approved_at: { type: Date, default: null },
      field: { type: String, default: '' }
    }); = new Date();
    await assignment.save();

    res.json({ message: 'Mentee approved', assignment });
  } catch (err) {
    console.error('POST /approve error:', err);
    res.status(500).json({ error: 'Failed to approve mentee' });
  }
});

/**
 * GET /api/mentors
 * All alumni mentors (generic, must come AFTER specific routes)
 */
router.get('/', authenticate, async (_req, res) => {
  try {
    const mentors = await User.find({ role: 'alumni' })
      .select('-password')
      .lean();

    res.json(mentors.map(mapMentor));
  } catch (err) {
    console.error('GET /mentors error:', err);
    res.status(500).json({ error: 'Failed to fetch mentors' });
  }
});

export default router;
