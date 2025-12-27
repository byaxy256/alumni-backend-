// src/routes/loans.ts
import express from 'express';
import db from '../db.js';
import multer from 'multer';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

// --- THE FIX IS HERE ---
// We are importing the correct function names from your middleware file.
import { authenticate, authorize } from '../middleware/auth.js';
// --- END OF FIX ---

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/loans (Student creates a loan)
// This route should only require a student to be logged in.
router.post('/', authenticate, authorize(['student']), upload.any(), async (req, res) => {
  try {
    const studentUid = (req as any).user.uid; // always from token ONLY

    const { amountRequested, semester, consentFullChop, purpose } = req.body;
    const amount = Number(amountRequested);
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid amountRequested' });

    const [result] = await db.execute<ResultSetHeader>(
      'INSERT INTO loans (student_uid, amount_requested, semester, consent_full_chop, purpose, outstanding_balance, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [studentUid, amount, semester || null, consentFullChop ? 1 : 0, purpose || null, amount, 'pending']
    );
    res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error('POST /loans error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/loans (Alumni Office gets all loans)
// This route requires a user to be logged in AND have the 'alumni_office' or 'admin' role.
router.get('/', authenticate, authorize(['alumni_office', 'admin']), async (req, res) => {
  try {
    const sql = `SELECT l.*, u.full_name, u.email, u.phone, u.program, u.semester, u.university_id 
                 FROM loans l JOIN users u ON l.student_uid = u.uid 
                 ORDER BY l.created_at DESC`;
    const [rows] = await db.execute<RowDataPacket[]>(sql);
    res.json(rows || []);
  } catch (err) {
    console.error('GET /loans error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/loans/mine (Student gets their own loans)
// This only requires a user to be logged in.
router.get('/mine', authenticate, async (req, res) => {
    try {
        const studentUid = (req as any).user.uid; // Get UID securely from the token
 const [rows] = await db.execute<RowDataPacket[]>(
            'SELECT * FROM loans WHERE student_uid = ? ORDER BY created_at DESC',
            [studentUid]
        );
        res.json(rows || []);
    } catch (err) { /* ... */ }
});
// PATCH /api/loans/:id/status (Alumni Office updates status)
// Requires 'alumni_office' or 'admin' role.
router.patch('/:id/status', authenticate, authorize(['alumni_office', 'admin']), async (req, res) => {
  const { id } = req.params;
  try {
    const { status, reason } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status provided' });
    }
    await db.execute(
      'UPDATE loans SET status = ?, rejection_reason = ? WHERE id = ?',
      [status, status === 'rejected' ? reason || null : null, id]
    );
    res.json({ message: `Loan status updated successfully to ${status}` });
  } catch (err) {
    console.error(`Error updating loan ${id}:`, err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;