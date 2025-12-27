import express from 'express';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import PDFDocument from 'pdfkit';
const router = express.Router();

// Ensure disbursements table exists for student benefit payouts
const ensureDisbursementsTable = async () => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS disbursements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_uid VARCHAR(191) NOT NULL,
      original_amount DECIMAL(12,2) NOT NULL,
      deduction_amount DECIMAL(12,2) NOT NULL,
      net_amount DECIMAL(12,2) NOT NULL,
      approved_by VARCHAR(191) DEFAULT NULL,
      approved_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
};

router.get('/prepare', async (req, res) => {
  try {
    await ensureDisbursementsTable();
    const studentUid = String(req.query.studentUid || '');
    const originalAmount = Number(req.query.originalAmount || 0);
    if (!studentUid || !originalAmount) return res.status(400).json({ error: 'missing params' });
    // sum outstanding loans
    const [rows] = await db.execute('SELECT SUM(outstanding_balance) as total FROM loans WHERE student_uid = ? AND status IN ("approved","active")', [studentUid]);
    const total = (rows as any)[0].total || 0;
    const deduction = Math.min(total, originalAmount);
    res.json({ originalAmount, deduction, netAmount: originalAmount - deduction });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

router.post('/approve', async (req, res) => {
  try {
    await ensureDisbursementsTable();
    const { studentUid, originalAmount, deduction, approver } = req.body;
    // create disbursement record
    const [r] = await db.execute('INSERT INTO disbursements (student_uid, original_amount, deduction_amount, net_amount, approved_by, approved_at) VALUES (?, ?, ?, ?, ?, NOW())', [studentUid, originalAmount, deduction, originalAmount - deduction, approver]);
    const disbId = (r as any).insertId;
    // reduce outstandingBalance across loans (simple logic: deduct from oldest loan)
    let remaining = deduction;
    const [loans] = await db.execute('SELECT id, outstanding_balance FROM loans WHERE student_uid = ? AND outstanding_balance > 0 ORDER BY created_at ASC', [studentUid]);
    for (const loan of loans as any[]) {
      if (remaining <= 0) break;
      const take = Math.min(Number(loan.outstanding_balance), remaining);
      await db.execute('UPDATE loans SET outstanding_balance = outstanding_balance - ? WHERE id = ?', [take, loan.id]);
      remaining -= take;
    }
    // footprint record (optional)
    await db.execute('INSERT INTO footprints (user_uid, action, target_type, target_id, meta) VALUES (?, ?, ?, ?, ?)', [approver, 'approve_disbursement', 'disbursement', String(disbId), JSON.stringify({ originalAmount, deduction })]);
    res.json({ ok: true, disbursementId: disbId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// Generate and download a PDF receipt for a disbursement (student benefit)
router.get('/:id/receipt', authenticate, async (req, res) => {
  try {
    await ensureDisbursementsTable();
    const { id } = req.params;
    const uid = (req as any).user?.uid;
    if (!uid) return res.status(401).json({ error: 'unauthorized' });

    const [rows] = await db.execute<any[]>(
      `SELECT * FROM disbursements WHERE id = ? AND student_uid = ? LIMIT 1`,
      [id, uid]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Receipt not found or unauthorized.' });
    }

    const disb = rows[0];

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const filename = `Disbursement-Receipt-${disb.id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    doc.fontSize(20).text('Student Benefit Receipt', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text('Alumni Aid - Uganda Christian University');
    doc.moveDown(2);

    doc.text(`Receipt ID: DISB-${disb.id}`);
    doc.text(`Approved At: ${new Date(disb.approved_at || Date.now()).toLocaleString()}`);
    doc.text(`Student UID: ${disb.student_uid}`);
    doc.moveDown();

    doc.text('Benefit Details:', { underline: true });
    doc.moveDown(0.5);
    doc.text(`Original Amount: UGX ${Number(disb.original_amount || 0).toLocaleString()}`);
    doc.text(`Loan Deduction: UGX ${Number(disb.deduction_amount || 0).toLocaleString()}`);
    doc.text(`Net Amount (Received): UGX ${Number(disb.net_amount || 0).toLocaleString()}`);
    doc.text(`Approved By: ${disb.approved_by || '—'}`);

    doc.moveDown(3);
    doc.fontSize(10).text('Thank you. This benefit has been disbursed to your account.', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('GET /disburse/:id/receipt error:', err);
    res.status(500).json({ error: 'Failed to generate receipt.' });
  }
});

// List disbursements (benefits) for the current student
router.get('/mine', authenticate, async (req, res) => {
  try {
    await ensureDisbursementsTable();
    const uid = (req as any).user?.uid;
    if (!uid) return res.status(401).json({ error: 'unauthorized' });

    const [rows] = await db.execute(
      `SELECT id, original_amount, deduction_amount, net_amount, approved_at, approved_by
       FROM disbursements WHERE student_uid = ? ORDER BY approved_at DESC`,
      [uid]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

export default router;
