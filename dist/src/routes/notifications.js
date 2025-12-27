// src/routes/notifications.ts
import express from 'express';
import { Notification } from '../models/Notification.js';
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
        const notifications = await Notification.find({ target_uid: userUid })
            .sort({ created_at: -1 })
            .lean();
        res.json(notifications.map(n => ({ ...n, id: n._id.toString() })));
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
        const result = await Notification.findOneAndUpdate({ _id: notificationId, target_uid: userUid }, { $set: { read: true } }, { new: true });
        if (!result) {
            return res.status(404).json({ error: "Notification not found or you do not have permission." });
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
        await Notification.updateMany({ target_uid: userUid, read: { $ne: true } }, { $set: { read: true } });
        res.status(200).json({ message: "All notifications marked as read." });
    }
    catch (err) {
        console.error("Mark all notifications as read error:", err);
        res.status(500).json({ error: "Server error while updating notifications." });
    }
});
export default router;
