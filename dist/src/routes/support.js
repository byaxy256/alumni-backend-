// src/routes/support.ts
import express from "express";
import db from "../db.js";
import multer from "multer";
// --- THE FIX IS HERE: We are importing the middleware functions ---
import { authenticate, authorize } from '../middleware/auth.js';
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
// POST /api/support (Student creates a support request)
// This route should only require a student to be logged in.
router.post("/", authenticate, authorize(['student']), upload.array("attachments"), async (req, res) => {
    try {
        const studentUid = req.user.uid; // Get UID securely from token
        const { amountRequested, reason } = req.body;
        if (!amountRequested || isNaN(Number(amountRequested))) {
            return res.status(400).json({ error: "Amount required" });
        }
        if (!reason || reason.length < 5) {
            return res.status(400).json({ error: "Reason too short" });
        }
        // ... (your existing logic for handling attachments is fine)
        const [result] = await db.execute("INSERT INTO support_requests (student_uid, amount_requested, reason, attachments, status) VALUES (?, ?, ?, ?, ?)", [studentUid, Number(amountRequested), reason, JSON.stringify([]), 'pending'] // Assuming attachments are handled separately
        );
        res.status(201).json({ ok: true, id: result.insertId });
    }
    catch (err) {
        console.error("Support error:", err);
        res.status(500).json({ error: "Server error" });
    }
});
// GET /api/support (Alumni Office gets all support requests)
// This route requires 'alumni_office' or 'admin' role.
router.get('/', authenticate, authorize(['alumni_office', 'admin']), async (req, res) => {
    try {
        const sql = `SELECT sr.*, u.full_name, u.email, u.phone, u.program, u.semester, u.university_id 
                 FROM support_requests sr JOIN users u ON sr.student_uid = u.uid 
                 ORDER BY sr.created_at DESC`;
        const [rows] = await db.execute(sql);
        res.json(rows || []);
    }
    catch (err) {
        console.error('GET /support error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
// GET /api/support/mine (Student gets their own support requests)
// This route only requires a user to be logged in.
router.get("/mine", authenticate, async (req, res) => {
    try {
        const studentUid = req.user.uid; // Get UID securely from token
        if (!studentUid) {
            return res.status(400).json({ error: "Could not identify user from token." });
        }
        const [rows] = await db.execute("SELECT * FROM support_requests WHERE student_uid = ? ORDER BY created_at DESC", [studentUid]);
        res.json(rows || []);
    }
    catch (err) {
        console.error("Support mine error:", err);
        res.status(500).json({ error: "Server error" });
    }
});
// PATCH /api/support/:id/status (Alumni Office updates status)
// This route requires 'alumni_office' or 'admin' role.
router.patch('/:id/status', authenticate, authorize(['alumni_office', 'admin']), async (req, res) => {
    const { id } = req.params;
    try {
        const { status, reason } = req.body;
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status provided' });
        }
        await db.execute('UPDATE support_requests SET status = ?, rejection_reason = ? WHERE id = ?', [status, status === 'rejected' ? reason || null : null, id]);
        res.json({ message: `Support request status updated successfully to ${status}` });
    }
    catch (err) {
        console.error(`Error updating support request ${id}:`, err);
        res.status(500).json({ error: 'Server error' });
    }
});
export default router;
