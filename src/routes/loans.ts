// src/routes/loans.ts
import express from 'express';
import multer from 'multer';
import { Loan } from '../models/Loan.js';
import { User } from '../models/User.js';
import { Application } from '../models/Application.js';
import { Disbursement } from '../models/Disbursement.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/loans (Student creates a loan)
router.post('/', authenticate, authorize(['student']), upload.any(), async (req, res) => {
  try {
    const studentUid = (req as any).user.uid;

    const { amountRequested, semester, consentFullChop, purpose, phone, program, currentSemester, studentId } = req.body;
    const amount = Number(amountRequested);
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid amountRequested' });

    const loan = await Loan.create({
      student_uid: studentUid,
      amount,
      outstanding_balance: amount,
      status: 'pending',
      purpose: purpose || '',
      application_date: new Date()
    });

    // Update user metadata with phone, program, semester, university_id if provided
    const updateFields: any = {};
    if (phone) updateFields.phone = phone;
    if (program) updateFields['meta.program'] = program;
    if (currentSemester) updateFields['meta.semester'] = currentSemester;
    if (studentId) updateFields['meta.university_id'] = studentId;
    
    if (Object.keys(updateFields).length > 0) {
      await User.updateOne({ uid: studentUid }, { $set: updateFields });
    }

    res.status(201).json({ ok: true, id: loan._id.toString() });
  } catch (err) {
    console.error('POST /loans error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/loans (Alumni Office gets all loans)
router.get('/', async (_req, res) => {
  try {
    const loans = await Loan.find().sort({ created_at: -1 }).lean();
    
    // Import Payment model
    const { Payment } = await import('../models/Payment.js');
    
    // Enrich with user data and application payload data
    const enriched = await Promise.all(loans.map(async (loan) => {
      const user = await User.findOne({ uid: loan.student_uid }).select('full_name email phone meta').lean();
      
      // Try to get data from Application if available (has semester and amount_requested from form)
      const appData = await Application.findOne({ student_uid: loan.student_uid }).sort({ created_at: -1 }).lean();
      const appPayload = appData?.payload || {};
      
      // For amount: use loan.amount if > 0, else try appPayload.amountRequested, else try disbursement.original_amount
      let amount = loan.amount > 0 ? loan.amount : (appPayload?.amountRequested ? Number(appPayload.amountRequested) : 0);
      if (amount === 0) {
        const disbursement = await Disbursement.findOne({ student_uid: loan.student_uid }).sort({ created_at: -1 }).lean();
        amount = disbursement?.original_amount || 0;
      }
      
      // Calculate actual outstanding balance from successful payments
      const payments = await Payment.find({ 
        loan_id: loan._id.toString(), 
        status: 'SUCCESSFUL' 
      }).lean();
      const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const actualOutstanding = Math.max(0, amount - totalPaid);
      
      // For semester: prefer user.meta.semester, fallback to appPayload.currentSemester
      let semester = user?.meta?.semester || appPayload?.currentSemester || '';
      
      return {
        ...loan,
        id: loan._id ? loan._id.toString() : loan.sqlId,
        type: 'loan',
        full_name: user?.full_name || '',
        email: user?.email || '',
        phone: user?.phone || appPayload?.phone || '',
        program: user?.meta?.program || appPayload?.program || '',
        semester: semester,
        university_id: user?.meta?.university_id || appPayload?.studentId || '',
        amount_requested: amount,
        outstanding_balance: actualOutstanding,
        total_paid: totalPaid,
        purpose: loan.purpose || appPayload?.purpose || '',
        repaymentPeriod: 12,
      };
    }));

    res.json(enriched);
  } catch (err) {
    console.error('LOANS ERROR:', err);
    res.status(500).json({ error: 'Failed to load loans' });
  }
});

// GET /api/loans/mine (Student gets their own loans)
router.get('/mine', authenticate, async (req, res) => {
  try {
    const studentUid = (req as any).user.uid;
    const loans = await Loan.find({ student_uid: studentUid })
      .sort({ created_at: -1 })
      .lean();
    
    // Import Payment model to calculate actual outstanding balance
    const { Payment } = await import('../models/Payment.js');
    
    // Normalize response and recalculate outstanding balance from payments
    const mapped = await Promise.all(loans.map(async (loan) => {
      // Get all successful payments for this loan
      const payments = await Payment.find({ 
        loan_id: loan._id.toString(), 
        status: 'SUCCESSFUL' 
      }).lean();
      
      const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const actualOutstanding = Math.max(0, loan.amount - totalPaid);
      
      return {
        id: loan._id.toString(),
        amount_requested: loan.amount,
        outstanding_balance: actualOutstanding,
        total_paid: totalPaid,
        status: loan.status,
        created_at: loan.created_at,
        repaymentPeriod: (loan as any).repaymentPeriod,
        chopConsented: (loan as any).consentFullChop || false,
        raw: loan
      };
    }));

    res.json(mapped);
  } catch (err) {
    console.error('GET /loans/mine error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/loans/:id/status (Alumni Office updates status)
router.patch('/:id/status', authenticate, authorize(['alumni_office', 'admin']), async (req, res) => {
  const { id } = req.params;
  try {
    const { status, reason } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status provided' });
    }

    await Loan.findByIdAndUpdate(id, {
      status,
      rejection_reason: status === 'rejected' ? (reason || null) : null,
      approved_at: status === 'approved' ? new Date() : undefined,
      approved_by: status === 'approved' ? (req as any).user.uid : undefined
    });

    res.json({ message: `Loan status updated successfully to ${status}` });
  } catch (err) {
    console.error(`Error updating loan ${id}:`, err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;