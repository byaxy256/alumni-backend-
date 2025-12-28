// src/routes/disburse-mongo.ts - MongoDB-based disbursement management
import express from 'express';
import { Disbursement } from '../models/Disbursement.js';
import { User } from '../models/User.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// GET /api/disburse - Get disbursements (students see own, admin/office see all)
router.get('/', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    let query: any = {};

    if (!['admin', 'alumni_office'].includes(user.role)) {
      // Students only see their own disbursements
      query = { student_uid: user.uid };
    }

    const disbursements = await Disbursement.find(query).sort({ approved_at: -1 }).lean();
    res.json(disbursements);
  } catch (err) {
    console.error('GET /disburse error:', err);
    res.status(500).json({ error: 'Failed to fetch disbursements' });
  }
});

// GET /api/disburse/mine - Get current student's disbursements
router.get('/mine', authenticate, async (req, res) => {
  try {
    const studentUid = (req as any).user.uid;
    const disbursements = await Disbursement.find({ student_uid: studentUid }).sort({ approved_at: -1 }).lean();
    res.json(disbursements);
  } catch (err) {
    console.error('GET /mine error:', err);
    res.status(500).json({ error: 'Failed to fetch your disbursements' });
  }
});

// POST /api/disburse - Create disbursement (admin only)
router.post('/', authenticate, authorize(['admin', 'alumni_office']), async (req, res) => {
  try {
    const { student_uid, original_amount, deduction_amount, net_amount, approved_by } = req.body;

    if (!student_uid || !original_amount || deduction_amount === undefined || !net_amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const disbursement = new Disbursement({
      student_uid,
      original_amount,
      deduction_amount,
      net_amount,
      approved_by: approved_by || (req as any).user.id,
      approved_at: new Date(),
    });

    await disbursement.save();
    res.status(201).json({
      id: disbursement._id.toString(),
      student_uid: disbursement.student_uid,
      original_amount: disbursement.original_amount,
      deduction_amount: disbursement.deduction_amount,
      net_amount: disbursement.net_amount,
      approved_by: disbursement.approved_by,
      approved_at: disbursement.approved_at,
      created_at: disbursement.created_at,
      updated_at: disbursement.updated_at,
    });
  } catch (err) {
    console.error('POST /disburse error:', err);
    res.status(500).json({ error: 'Failed to create disbursement' });
  }
});

// PUT /api/disburse/:id - Update disbursement (admin only)
router.put('/:id', authenticate, authorize(['admin', 'alumni_office']), async (req, res) => {
  try {
    const { original_amount, deduction_amount, net_amount } = req.body;

    const disbursement = await Disbursement.findByIdAndUpdate(
      req.params.id,
      {
        ...(original_amount !== undefined && { original_amount }),
        ...(deduction_amount !== undefined && { deduction_amount }),
        ...(net_amount !== undefined && { net_amount }),
        updated_at: new Date(),
      },
      { new: true }
    );

    if (!disbursement) return res.status(404).json({ error: 'Disbursement not found' });
    res.json(disbursement);
  } catch (err) {
    console.error('PUT /disburse/:id error:', err);
    res.status(500).json({ error: 'Failed to update disbursement' });
  }
});

// DELETE /api/disburse/:id - Delete disbursement (admin only)
router.delete('/:id', authenticate, authorize(['admin', 'alumni_office']), async (req, res) => {
  try {
    const disbursement = await Disbursement.findByIdAndDelete(req.params.id);
    if (!disbursement) return res.status(404).json({ error: 'Disbursement not found' });
    res.json({ message: 'Disbursement deleted' });
  } catch (err) {
    console.error('DELETE /disburse/:id error:', err);
    res.status(500).json({ error: 'Failed to delete disbursement' });
  }
});

export default router;
