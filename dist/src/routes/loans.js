// src/routes/loans.ts
import express from 'express';
import multer from 'multer';
import { Loan } from '../models/Loan.js';
import { User } from '../models/User.js';
import { authenticate, authorize } from '../middleware/auth.js';
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
// POST /api/loans (Student creates a loan)
router.post('/', authenticate, authorize(['student']), upload.any(), async (req, res) => {
    try {
        const studentUid = req.user.uid;
        const { amountRequested, semester, consentFullChop, purpose } = req.body;
        const amount = Number(amountRequested);
        if (isNaN(amount) || amount <= 0)
            return res.status(400).json({ error: 'Invalid amountRequested' });
        const loan = await Loan.create({
            student_uid: studentUid,
            amount,
            outstanding_balance: amount,
            status: 'pending',
            purpose: purpose || '',
            application_date: new Date()
        });
        res.status(201).json({ ok: true, id: loan._id.toString() });
    }
    catch (err) {
        console.error('POST /loans error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
// GET /api/loans (Alumni Office gets all loans)
router.get('/', authenticate, authorize(['alumni_office', 'admin']), async (req, res) => {
    try {
        const loans = await Loan.find().sort({ created_at: -1 }).lean();
        // Enrich with user data
        const enriched = await Promise.all(loans.map(async (loan) => {
            const user = await User.findOne({ uid: loan.student_uid }).select('full_name email phone meta').lean();
            return {
                ...loan,
                id: loan._id.toString(),
                full_name: user?.full_name || '',
                email: user?.email || '',
                phone: user?.phone || '',
                program: user?.meta?.program || '',
                semester: user?.meta?.semester || '',
                university_id: user?.meta?.university_id || ''
            };
        }));
        res.json(enriched);
    }
    catch (err) {
        console.error('GET /loans error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
// GET /api/loans/mine (Student gets their own loans)
router.get('/mine', authenticate, async (req, res) => {
    try {
        const studentUid = req.user.uid;
        const loans = await Loan.find({ student_uid: studentUid })
            .sort({ created_at: -1 })
            .lean();
        res.json(loans.map(loan => ({ ...loan, id: loan._id.toString() })));
    }
    catch (err) {
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
            approved_by: status === 'approved' ? req.user.uid : undefined
        });
        res.json({ message: `Loan status updated successfully to ${status}` });
    }
    catch (err) {
        console.error(`Error updating loan ${id}:`, err);
        res.status(500).json({ error: 'Server error' });
    }
});
export default router;
