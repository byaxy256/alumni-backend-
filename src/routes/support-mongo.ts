// src/routes/support-mongo.ts - MongoDB-based support requests
import express from 'express';
import { SupportRequest } from '../models/SupportRequest.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// GET /api/support - Get all support requests (admin/alumni_office only)
router.get('/', authenticate, authorize(['admin', 'alumni_office']), async (req, res) => {
  try {
    const requests = await SupportRequest.find().sort({ created_at: -1 }).lean();
    res.json(requests);
  } catch (err) {
    console.error('GET /support error:', err);
    res.status(500).json({ error: 'Failed to fetch support requests' });
  }
});

// GET /api/support/:id - Get specific support request
router.get('/:id', authenticate, async (req, res) => {
  try {
    const request = await SupportRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Support request not found' });
    res.json(request);
  } catch (err) {
    console.error('GET /support/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch support request' });
  }
});

// GET /api/support/user/:student_uid - Get requests for a specific student
router.get('/user/:student_uid', authenticate, authorize(['admin', 'alumni_office']), async (req, res) => {
  try {
    const requests = await SupportRequest.find({ student_uid: req.params.student_uid }).sort({ created_at: -1 }).lean();
    res.json(requests);
  } catch (err) {
    console.error('GET /support/user/:student_uid error:', err);
    res.status(500).json({ error: 'Failed to fetch student support requests' });
  }
});

// GET /api/support/mine - Get requests for current student
router.get('/mine', authenticate, async (req, res) => {
  try {
    const studentUid = (req as any).user.uid;
    if (!studentUid) return res.status(400).json({ error: 'Could not identify user' });
    const requests = await SupportRequest.find({ student_uid: studentUid }).sort({ created_at: -1 }).lean();
    res.json(requests || []);
  } catch (err) {
    console.error('GET /support/mine error:', err);
    // Fail-safe: return empty array so frontend doesn't break if there's a transient DB issue
    return res.json([]);
  }
});

// POST /api/support - Create a new support request
router.post('/', authenticate, async (req, res) => {
  try {
    const { student_uid, amount_requested, reason, attachments } = req.body;

    if (!student_uid || amount_requested === undefined) {
      return res.status(400).json({ error: 'student_uid and amount_requested are required' });
    }

    const request = new SupportRequest({
      student_uid,
      amount_requested,
      reason: reason || '',
      attachments: attachments || [],
      status: 'pending',
      requested_fields: {},
    });

    await request.save();
    res.status(201).json(request);
  } catch (err) {
    console.error('POST /support error:', err);
    res.status(500).json({ error: 'Failed to create support request' });
  }
});

// PUT /api/support/:id - Update support request (status, rejection reason, etc.)
router.put('/:id', authenticate, authorize(['admin', 'alumni_office']), async (req, res) => {
  try {
    const { status, rejection_reason, requested_fields } = req.body;
    const allowedStatuses = ['pending', 'approved', 'rejected', 'info_requested'];

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const updateData: any = {};
    if (status) updateData.status = status;
    if (rejection_reason) updateData.rejection_reason = rejection_reason;
    if (requested_fields) updateData.requested_fields = requested_fields;

    const request = await SupportRequest.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!request) return res.status(404).json({ error: 'Support request not found' });
    res.json(request);
  } catch (err) {
    console.error('PUT /support/:id error:', err);
    res.status(500).json({ error: 'Failed to update support request' });
  }
});

// DELETE /api/support/:id - Delete support request
router.delete('/:id', authenticate, authorize(['admin', 'alumni_office']), async (req, res) => {
  try {
    const request = await SupportRequest.findByIdAndDelete(req.params.id);
    if (!request) return res.status(404).json({ error: 'Support request not found' });
    res.json({ message: 'Support request deleted successfully' });
  } catch (err) {
    console.error('DELETE /support/:id error:', err);
    res.status(500).json({ error: 'Failed to delete support request' });
  }
});

export default router;
