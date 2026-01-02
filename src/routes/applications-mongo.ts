// src/routes/applications-mongo.ts - MongoDB-based applications
import express from 'express';
import { Application } from '../models/Application.js';
import { User } from '../models/User.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// GET /api/applications - Get applications (students see own, admin/office see all)
router.get('/', async (_req, res) => {
  try {
    const applications = await Application.find();
    res.json(applications);
  } catch (err) {
    console.error('APPLICATIONS ERROR:', err);
    res.status(500).json({ error: 'Failed to load applications' });
  }
});

// GET /api/applications/mine - Get current student's applications
router.get('/mine', authenticate, async (req, res) => {
  try {
    const studentUid = (req as any).user.uid;
    const applications = await Application.find({ student_uid: studentUid }).sort({ created_at: -1 }).lean();
    res.json(applications);
  } catch (err) {
    console.error('GET /mine error:', err);
    res.status(500).json({ error: 'Failed to fetch your applications' });
  }
});

// POST /api/applications - Create new application
router.post('/', authenticate, async (req, res) => {
  try {
    const { type, payload } = req.body;
    const studentUid = (req as any).user.uid;

    if (!type) {
      return res.status(400).json({ error: 'Application type is required' });
    }

    const application = new Application({
      student_uid: studentUid,
      type,
      payload: payload || {},
      status: 'pending',
    });

    await application.save();
    res.status(201).json({
      id: application._id.toString(),
      student_uid: application.student_uid,
      type: application.type,
      payload: application.payload,
      status: application.status,
      created_at: application.created_at,
      updated_at: application.updated_at,
    });
  } catch (err) {
    console.error('POST /applications error:', err);
    res.status(500).json({ error: 'Failed to create application' });
  }
});

// PUT /api/applications/:id - Update application status (admin only)
router.put('/:id', authenticate, authorize(['admin', 'alumni_office']), async (req, res) => {
  try {
    const { status, payload } = req.body;
    
    if (status && !['pending', 'approved', 'rejected', 'info_requested'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const application = await Application.findByIdAndUpdate(
      req.params.id,
      {
        ...(status && { status }),
        ...(payload && { payload }),
        updated_at: new Date(),
      },
      { new: true }
    );

    if (!application) return res.status(404).json({ error: 'Application not found' });
    res.json(application);
  } catch (err) {
    console.error('PUT /applications/:id error:', err);
    res.status(500).json({ error: 'Failed to update application' });
  }
});

// DELETE /api/applications/:id - Delete application (admin only)
router.delete('/:id', authenticate, authorize(['admin', 'alumni_office']), async (req, res) => {
  try {
    const application = await Application.findByIdAndDelete(req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    res.json({ message: 'Application deleted' });
  } catch (err) {
    console.error('DELETE /applications/:id error:', err);
    res.status(500).json({ error: 'Failed to delete application' });
  }
});

export default router;
