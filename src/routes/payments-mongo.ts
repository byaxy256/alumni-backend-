// src/routes/payments-mongo.ts - MongoDB-based payment management
import express from 'express';
import { Payment } from '../models/Payment.js';
import { User } from '../models/User.js';
import { Loan } from '../models/Loan.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// GET /api/payments - Get payments (students see own, admin/office see all)
router.get('/', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    let query: any = {};

    if (!['admin', 'alumni_office'].includes(user.role)) {
      // Students only see their own payments
      query = { $or: [{ user_uid: user.uid }, { payer_uid: user.uid }] };
    }

    const payments = await Payment.find(query).sort({ created_at: -1 }).lean();
    res.json(payments);
  } catch (err) {
    console.error('GET /payments error:', err);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// GET /api/payments/mine - Get current user's payments
router.get('/mine', authenticate, async (req, res) => {
  try {
    const userUid = (req as any).user.uid;
    const payments = await Payment.find({
      $or: [{ user_uid: userUid }, { payer_uid: userUid }]
    }).sort({ created_at: -1 }).lean();
    res.json(payments);
  } catch (err) {
    console.error('GET /mine error:', err);
    res.status(500).json({ error: 'Failed to fetch your payments' });
  }
});

// POST /api/payments - Create payment (students create own, admin creates for others)
router.post('/', authenticate, async (req, res) => {
  try {
    const { transaction_id, loan_id, user_uid, amount, method, status, external_ref, access_number } = req.body;
    const requester = (req as any).user;

    // Validation
    if (!transaction_id || !amount) {
      return res.status(400).json({ error: 'transaction_id and amount are required' });
    }

    // Check if payment already exists
    const existing = await Payment.findOne({ transaction_id });
    if (existing) {
      return res.status(400).json({ error: 'Payment with this transaction_id already exists' });
    }

    // Check authorization
    const targetUid = user_uid || requester.uid;
    if (!['admin', 'alumni_office'].includes(requester.role) && targetUid !== requester.uid) {
      return res.status(403).json({ error: 'Cannot create payments for other users' });
    }

    const payment = new Payment({
      transaction_id,
      loan_id: loan_id || undefined,
      user_uid: targetUid,
      payer_uid: requester.uid,
      amount,
      status: status || 'PENDING',
      method: method || 'mobile_money',
      external_ref: external_ref || undefined,
      access_number: access_number || undefined,
    });

    await payment.save();
    res.status(201).json({
      id: payment._id.toString(),
      transaction_id: payment.transaction_id,
      loan_id: payment.loan_id,
      user_uid: payment.user_uid,
      payer_uid: payment.payer_uid,
      amount: payment.amount,
      status: payment.status,
      method: payment.method,
      created_at: payment.created_at,
      updated_at: payment.updated_at,
    });
  } catch (err) {
    console.error('POST /payments error:', err);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// PUT /api/payments/:id - Update payment (admin only)
router.put('/:id', authenticate, authorize(['admin', 'alumni_office']), async (req, res) => {
  try {
    const { status, method, external_ref, access_number } = req.body;

    if (status && !['PENDING', 'SUCCESSFUL', 'FAILED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid payment status' });
    }

    const payment = await Payment.findByIdAndUpdate(
      req.params.id,
      {
        ...(status && { status }),
        ...(method && { method }),
        ...(external_ref && { external_ref }),
        ...(access_number && { access_number }),
        updated_at: new Date(),
      },
      { new: true }
    );

    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json(payment);
  } catch (err) {
    console.error('PUT /payments/:id error:', err);
    res.status(500).json({ error: 'Failed to update payment' });
  }
});

// DELETE /api/payments/:id - Delete payment (admin only)
router.delete('/:id', authenticate, authorize(['admin', 'alumni_office']), async (req, res) => {
  try {
    const payment = await Payment.findByIdAndDelete(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json({ message: 'Payment deleted' });
  } catch (err) {
    console.error('DELETE /payments/:id error:', err);
    res.status(500).json({ error: 'Failed to delete payment' });
  }
});

export default router;
