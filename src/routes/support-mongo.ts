// src/routes/support-mongo.ts - MongoDB-based support requests
import express from 'express';
import { SupportRequest } from '../models/SupportRequest.js';
import { User } from '../models/User.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// GET /api/support - Get all support requests (admin/alumni_office only)
router.get('/', authenticate, authorize(['admin', 'alumni_office']), async (req, res) => {
  try {
    const requests = await SupportRequest.find().sort({ createdAt: -1 }).lean();
    res.json(requests);
  } catch (err) {
    console.error('GET /support error:', err);
    res.status(500).json({ error: 'Failed to fetch support requests' });
  }
});

// GET /api/support/mine - Get current user's support requests
router.get('/mine', authenticate, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const requests = await SupportRequest.find({ userId }).sort({ createdAt: -1 }).lean();
    res.json(requests);
  } catch (err) {
    console.error('GET /mine error:', err);
    res.status(500).json({ error: 'Failed to fetch your support requests' });
  }
});

// POST /api/support - Create a new support request
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, description, category, priority } = req.body;
    const userId = (req as any).user.id;

    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    const user = await User.findById(userId);
    const request = new SupportRequest({
      userId,
      userEmail: user?.email,
      userName: user?.full_name,
      title,
      description,
      category: category || 'general',
      priority: priority || 'normal',
      status: 'open',
      responses: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await request.save();
    res.status(201).json({
      id: request._id.toString(),
      title: request.title,
      description: request.description,
      category: request.category,
      priority: request.priority,
      status: request.status,
      createdAt: request.createdAt,
    });
  } catch (err) {
    console.error('POST /support error:', err);
    res.status(500).json({ error: 'Failed to create support request' });
  }
});

// PUT /api/support/:id - Update support request status (admin only)
router.put('/:id', authenticate, authorize(['admin', 'alumni_office']), async (req, res) => {
  try {
    const { status, response } = req.body;
    const request = await SupportRequest.findById(req.params.id);

    if (!request) return res.status(404).json({ error: 'Request not found' });

    if (status) request.status = status;
    if (response) {
      if (!request.responses) request.responses = [];
      request.responses.push({
        responderId: (req as any).user.id,
        message: response,
        respondedAt: new Date(),
      });
    }
    request.updatedAt = new Date();

    await request.save();
    res.json(request);
  } catch (err) {
    console.error('PUT /support/:id error:', err);
    res.status(500).json({ error: 'Failed to update request' });
  }
});

// DELETE /api/support/:id - Delete support request
router.delete('/:id', authenticate, authorize(['admin', 'alumni_office']), async (req, res) => {
  try {
    const request = await SupportRequest.findByIdAndDelete(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    res.json({ message: 'Request deleted' });
  } catch (err) {
    console.error('DELETE /support/:id error:', err);
    res.status(500).json({ error: 'Failed to delete request' });
  }
});

export default router;
