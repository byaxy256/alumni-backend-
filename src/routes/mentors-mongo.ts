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
 * GET /api/mentors/debug-token
 * Debug endpoint to check what's in the JWT token
 */
router.get('/debug-token', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    console.log('DEBUG TOKEN - Full req.user:', JSON.stringify(user, null, 2));
    
    res.json({
      message: 'Token decoded successfully',
      user: user,
      hasUid: !!user?.uid,
      hasRole: !!user?.role,
      hasId: !!user?.id
    });
  } catch (err) {
    console.error('DEBUG TOKEN error:', err);
    res.status(500).json({ error: 'Failed to debug token' });
  }
});

/**
 * GET /api/mentors/my-mentors
 * Student → assigned mentors via MentorAssignment
 */
router.get('/my-mentors', authenticate, async (req, res) => {
  try {
    // Comprehensive auth check
    if (!(req as any).user) {
      console.error('GET /my-mentors - req.user is undefined!');
      return res.status(401).json({ error: 'Not authenticated - middleware failed' });
    }

    const userUid = (req as any).user?.uid;
    const userRole = (req as any).user?.role;
    const userId = (req as any).user?.id;

    console.log('GET /my-mentors - Full user object:', JSON.stringify((req as any).user, null, 2));
    console.log('GET /my-mentors - Extracted:', { uid: userUid, role: userRole, id: userId });

    if (!userUid) {
      console.error('GET /my-mentors - UID is missing from token');
      return res.status(401).json({ error: 'Invalid user - missing UID in token' });
    }

    if (userRole !== 'student') {
      console.log('GET /my-mentors - Access denied: User role is', userRole, 'but endpoint requires student');
      return res.status(403).json({ error: `Only students can view their mentors. Your role: ${userRole}` });
    }

    // Get active mentor assignments for this student
    console.log('GET /my-mentors - Querying MentorAssignment with:', { student_uid: userUid, status: 'active' });
    const assignments = await MentorAssignment.find({
      student_uid: userUid,
      status: 'active'
    }).lean();

    console.log('GET /my-mentors - Found', assignments.length, 'assignments');

    if (assignments.length === 0) {
      console.log('GET /my-mentors - No mentors found, returning empty array');
      return res.json([]);
    }

    // Get mentor user information
    console.log('GET /my-mentors - Fetching mentor details for', assignments.length, 'assignments');
    const mentors = await Promise.all(
      assignments.map(async (assignment, index) => {
        try {
          console.log(`GET /my-mentors - Fetching mentor ${index + 1}:`, assignment.mentor_uid);
          const mentor = await User.findOne({ uid: assignment.mentor_uid })
            .select('-password')
            .lean();
          
          if (!mentor) {
            console.warn(`GET /my-mentors - Mentor not found for UID:`, assignment.mentor_uid);
            return null;
          }
          
          return mapMentor(mentor);
        } catch (mentorErr) {
          console.error(`GET /my-mentors - Error fetching mentor ${assignment.mentor_uid}:`, mentorErr);
          return null;
        }
      })
    );

    const validMentors = mentors.filter(Boolean);
    console.log('GET /my-mentors - Returning', validMentors.length, 'valid mentors');
    res.json(validMentors);
  } catch (err) {
    console.error('GET /my-mentors FATAL error:', err);
    console.error('Error stack:', (err as Error).stack);
    res.status(500).json({ 
      error: 'Failed to fetch mentors',
      details: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined
    });
  }
});

/**
 * GET /api/mentors/my-approved-mentees
 * Alumni → assigned mentees via MentorAssignment
 */
router.get('/my-approved-mentees', authenticate, async (req, res) => {
  try {
    // Comprehensive auth check
    if (!(req as any).user) {
      console.error('GET /my-approved-mentees - req.user is undefined!');
      return res.status(401).json({ error: 'Not authenticated - middleware failed' });
    }

    const userUid = (req as any).user?.uid;
    const userRole = (req as any).user?.role;
    const userId = (req as any).user?.id;

    console.log('GET /my-approved-mentees - Full user object:', JSON.stringify((req as any).user, null, 2));
    console.log('GET /my-approved-mentees - Extracted:', { uid: userUid, role: userRole, id: userId });

    if (!userUid) {
      console.error('GET /my-approved-mentees - UID is missing from token');
      return res.status(401).json({ error: 'Invalid user - missing UID in token' });
    }

    if (userRole !== 'alumni') {
      console.log('GET /my-approved-mentees - Access denied: User role is', userRole, 'but endpoint requires alumni');
      return res.status(403).json({ error: `Only alumni can view their mentees. Your role: ${userRole}` });
    }

    // Get active mentor assignments where user is the mentor
    console.log('GET /my-approved-mentees - Querying MentorAssignment with:', { mentor_uid: userUid, status: 'active' });
    const assignments = await MentorAssignment.find({
      mentor_uid: userUid,
      status: 'active'
    }).lean();

    console.log('GET /my-approved-mentees - Found', assignments.length, 'assignments');

    if (assignments.length === 0) {
      console.log('GET /my-approved-mentees - No active mentees found, returning empty array');
      return res.json([]);
    }

    // Get student user information
    console.log('GET /my-approved-mentees - Fetching student details for', assignments.length, 'assignments');
    const students = await Promise.all(
      assignments.map(async (assignment, index) => {
        try {
          console.log(`GET /my-approved-mentees - Fetching student ${index + 1}:`, assignment.student_uid);
          const student = await User.findOne({ uid: assignment.student_uid })
            .select('-password')
            .lean();
          
          if (!student) {
            console.warn(`GET /my-approved-mentees - Student not found for UID:`, assignment.student_uid);
            return null;
          }
          
          return { ...mapMentor(student), course: assignment.field };
        } catch (studentErr) {
          console.error(`GET /my-approved-mentees - Error fetching student ${assignment.student_uid}:`, studentErr);
          return null;
        }
      })
    );

    const validStudents = students.filter(Boolean);
    console.log('GET /my-approved-mentees - Returning', validStudents.length, 'valid students');
    res.json(validStudents);
  } catch (err) {
    console.error('GET /my-approved-mentees FATAL error:', err);
    console.error('Error stack:', (err as Error).stack);
    res.status(500).json({ 
      error: 'Failed to fetch mentees',
      details: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined
    });
  }
});

/**
 * GET /api/mentors/pending-requests
 * Alumni → view pending student mentor requests
 */
router.get('/pending-requests', authenticate, async (req, res) => {
  try {
    if (!(req as any).user) {
      console.error('GET /pending-requests - req.user is undefined!');
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userUid = (req as any).user?.uid;
    const userRole = (req as any).user?.role;

    console.log('GET /pending-requests - User:', { uid: userUid, role: userRole });

    if (!userUid) {
      return res.status(401).json({ error: 'Invalid user - missing UID in token' });
    }

    if (userRole !== 'alumni') {
      return res.status(403).json({ error: `Only alumni can view pending requests. Your role: ${userRole}` });
    }

    // Get pending mentor assignments where user is the mentor
    console.log('GET /pending-requests - Querying MentorAssignment with:', { mentor_uid: userUid, status: 'pending' });
    const assignments = await MentorAssignment.find({
      mentor_uid: userUid,
      status: 'pending'
    }).lean();

    console.log('GET /pending-requests - Found', assignments.length, 'pending assignments');

    if (assignments.length === 0) {
      console.log('GET /pending-requests - No pending requests found, returning empty array');
      return res.json([]);
    }

    // Get student user information
    const students = await Promise.all(
      assignments.map(async (assignment) => {
        try {
          const student = await User.findOne({ uid: assignment.student_uid })
            .select('-password')
            .lean();
          
          if (!student) {
            console.warn('GET /pending-requests - Student not found for UID:', assignment.student_uid);
            return null;
          }
          
          return {
            ...mapMentor(student),
            assignmentId: assignment._id,
            field: assignment.field,
            requested_at: assignment.requested_at,
            course: assignment.field
          };
        } catch (err) {
          console.error('GET /pending-requests - Error fetching student:', err);
          return null;
        }
      })
    );

    const validStudents = students.filter(Boolean);
    console.log('GET /pending-requests - Returning', validStudents.length, 'valid pending requests');
    res.json(validStudents);
  } catch (err) {
    console.error('GET /pending-requests error:', err);
    res.status(500).json({ 
      error: 'Failed to fetch pending requests',
      details: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined
    });
  }
});

/**
 * POST /api/mentors/request
 * Student requests a mentor
 */
router.post('/request', authenticate, async (req, res) => {
  try {
    if (!(req as any).user) {
      console.error('POST /request - req.user is undefined!');
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userUid = (req as any).user?.uid;
    const userRole = (req as any).user?.role;
    const { mentorUid } = req.body;

    console.log('POST /request - User:', { uid: userUid, role: userRole }, 'mentorUid:', mentorUid);

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
    if (!(req as any).user) {
      console.error('POST /approve - req.user is undefined!');
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userUid = (req as any).user?.uid;
    const userRole = (req as any).user?.role;
    const { assignmentId } = req.body;

    console.log('POST /approve - User:', { uid: userUid, role: userRole }, 'assignmentId:', assignmentId);

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
    (assignment as any).approved_at = new Date();
    await assignment.save();

    res.json({ message: 'Mentee approved', assignment });
  } catch (err) {
    console.error('POST /approve error:', err);
    res.status(500).json({ error: 'Failed to approve mentee' });
  }
});

/**
 * GET /api/mentors/students-by-field?field=xxx
 * Alumni → browse students in their field
 */
router.get('/students-by-field', authenticate, async (req, res) => {
  try {
    if (!(req as any).user) {
      console.error('GET /students-by-field - req.user is undefined!');
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userRole = (req as any).user?.role;
    const field = req.query.field as string;

    console.log('GET /students-by-field - User role:', userRole, 'Field:', field);

    if (userRole !== 'alumni') {
      return res.status(403).json({ error: 'Only alumni can browse students' });
    }

    if (!field) {
      return res.status(400).json({ error: 'Field parameter is required' });
    }

    // Find students with matching field/course
    const students = await User.find({
      role: 'student',
      $or: [
        { 'meta.field': new RegExp(field, 'i') },
        { 'meta.course': new RegExp(field, 'i') },
        { 'meta.program': new RegExp(field, 'i') }
      ]
    })
      .select('-password')
      .limit(50)
      .lean();

    console.log('GET /students-by-field - Found', students.length, 'students');

    const mapped = students.map(student => ({
      id: student._id.toString(),
      uid: student.uid,
      name: student.full_name || '',
      field: student.meta?.field || student.meta?.course || student.meta?.program || '',
      year: student.meta?.semester || student.meta?.year || '',
      graduationYear: student.meta?.graduationYear || student.meta?.grad_year || ''
    }));

    res.json(mapped);
  } catch (err) {
    console.error('GET /students-by-field error:', err);
    res.status(500).json({ error: 'Failed to fetch students' });
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
