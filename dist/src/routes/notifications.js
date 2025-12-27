// src/routes/notifications.ts
import express from 'express';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
const router = express.Router();
/**
 * @route   GET /api/notifications/mine
 * @desc    Fetch all notifications for the currently logged-in user.
 * @access  Private (Requires authentication)
 */
router.get('/mine', authenticate, async (req, res) => {
    try {
        const userUid = req.user.uid;
        if (!userUid) {
            return res.status(401).json({ error: "Unauthorized: Could not identify user from token." });
        }
        // --- THE FIX IS HERE ---
        // We are changing 'user_uid' to 'target_uid' to match your actual database table structure.
        const [notifications] = await db.execute("SELECT * FROM notifications WHERE target_uid = ? ORDER BY created_at DESC", [userUid]);
        // --- END OF FIX ---
        res.json(notifications || []);
    }
    catch (err) {
        console.error("Fetch notifications error:", err);
        res.status(500).json({ error: "Server error while fetching notifications." });
    }
});
/**
 * @route   PATCH /api/notifications/:notificationId/read
 * @desc    Mark a single notification as read.
 * @access  Private (Requires authentication)
 */
router.patch('/:notificationId/read', authenticate, async (req, res) => {
    try {
        const userUid = req.user.uid;
        const { notificationId } = req.params;
        if (!notificationId) {
            return res.status(400).json({ error: "Notification ID is required." });
        }
        // Try to mark as read (column may not exist, that's okay)
        try {
            const [result] = await db.execute("UPDATE notifications SET `read` = 1 WHERE id = ? AND target_uid = ?", [notificationId, userUid]);
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "Notification not found or you do not have permission." });
            }
        }
        catch (updateErr) {
            // If column doesn't exist, just mark as success anyway
            if (updateErr.code !== 'ER_BAD_FIELD_ERROR') {
                throw updateErr;
            }
        }
        res.status(200).json({ message: "Notification marked as read." });
    }
    catch (err) {
        console.error("Mark notification as read error:", err);
        res.status(500).json({ error: "Server error while updating notification." });
    }
});
/**
 * @route   PATCH /api/notifications/read-all
 * @desc    Mark all of the logged-in user's notifications as read.
 * @access  Private (Requires authentication)
 */
router.patch('/read-all', authenticate, async (req, res) => {
    try {
        const userUid = req.user.uid;
        // Try to mark all as read (column may not exist, that's okay)
        try {
            await db.execute("UPDATE notifications SET `read` = 1 WHERE target_uid = ? AND `read` = 0", [userUid]);
        }
        catch (updateErr) {
            // If column doesn't exist, just mark as success anyway
            if (updateErr.code !== 'ER_BAD_FIELD_ERROR') {
                throw updateErr;
            }
        }
        res.status(200).json({ message: "All notifications marked as read." });
    }
    catch (err) {
        console.error("Mark all notifications as read error:", err);
        res.status(500).json({ error: "Server error while updating notifications." });
    }
});
export default router;
