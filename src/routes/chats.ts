// src/routes/chat.ts
import express from 'express';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = express.Router();

/**
 * Helper function to create a consistent, sorted conversation ID between two user UIDs.
 * This ensures that the conversation between User A and User B always has the same ID,
 * regardless of who initiated it.
 * @param uid1 The UID of the first user.
 * @param uid2 The UID of the second user.
 * @returns A sorted and joined string (e.g., "uid1--uid2").
 */
const getConversationId = (uid1: string, uid2: string): string => {
    if (!uid1 || !uid2) {
        throw new Error("Both user UIDs are required to generate a conversation ID.");
    }
    return [uid1, uid2].sort().join('--');
};

/**
 * @route   GET /api/chat/:otherUserId
 * @desc    Fetch the chat history between the logged-in user and another user.
 * @access  Private (Requires authentication)
 */
router.get('/:otherUserId', authenticate, async (req, res) => {
    try {
        const myUid = (req as any).user.uid;
        const otherUserId = req.params.otherUserId;

        // Validate that the otherUserId parameter is present
        if (!otherUserId) {
            return res.status(400).json({ error: "No conversation partner specified." });
        }

        const conversationId = getConversationId(myUid, otherUserId);

        const [messages] = await db.execute<RowDataPacket[]>(
            "SELECT id, sender_uid, text, ts FROM messages WHERE chat_id = ? ORDER BY ts ASC",
            [conversationId]
        );

        // Map database columns to frontend expected format
        const formattedMessages = (messages || []).map((msg: any) => ({
            id: msg.id,
            sender_id: msg.sender_uid,
            message_text: msg.text,
            created_at: msg.ts,
            status: 'delivered' // All fetched messages are delivered
        }));

        res.json(formattedMessages);

    } catch (err) {
        console.error("Fetch chat error:", err);
        res.status(500).json({ error: "Server error while fetching chat history." });
    }
});

/**
 * @route   POST /api/chat
 * @desc    Send a new message to another user.
 * @access  Private (Requires authentication)
 */
router.post('/', authenticate, async (req, res) => {
    try {
        const myUid = (req as any).user.uid;
        // Accept both field names for backward compatibility
        const recipientId = req.body.recipientId || req.body.otherUserId;
        const message = req.body.message || req.body.text;

        // Debug: log payload basics (avoid logging full message content)
        try {
            console.log('Chat POST payload', {
                myUid,
                recipientId,
                hasMessage: typeof message === 'string',
                messageLength: typeof message === 'string' ? message.length : undefined,
            });
        } catch {}

        // --- Stricter Validation ---
        if (!recipientId || typeof recipientId !== 'string') {
            return res.status(400).json({ error: "A valid recipient ID is required." });
        }
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ error: "A non-empty message is required." });
        }
        // --- Enhanced Security ---
        if (myUid === recipientId) {
            return res.status(400).json({ error: "You cannot send a message to yourself." });
        }

        const conversationId = getConversationId(myUid, recipientId);
        const trimmedMessage = message.trim();

        // Debug conversation id
        try { console.log('Creating message for conversationId', conversationId); } catch {}

        const [result] = await db.execute<ResultSetHeader>(
            "INSERT INTO messages (chat_id, sender_uid, text) VALUES (?, ?, ?)",
            [conversationId, myUid, trimmedMessage]
        );

        // Get sender's name for notification
        const [senderRows] = await db.execute<RowDataPacket[]>(
            'SELECT full_name FROM users WHERE uid = ? LIMIT 1',
            [myUid]
        );
        const senderName = (senderRows[0] as any)?.full_name || 'Someone';

        // Create notification for recipient
        await db.execute(
            'INSERT INTO notifications (target_uid, title, message) VALUES (?, ?, ?)',
            [recipientId, 'New Message', `${senderName} sent you a message: ${trimmedMessage.substring(0, 50)}${trimmedMessage.length > 50 ? '...' : ''}`]
        );
        
        // Return the formatted message for frontend
        res.status(201).json({ 
            id: result.insertId,
            sender_id: myUid,
            message_text: trimmedMessage,
            created_at: new Date().toISOString(),
            status: 'sent',
            message: "Message sent successfully" 
        });

    } catch (err) {
        // Log more context for debugging purposes
        try { console.error('Send message error:', err, 'body:', req.body); } catch {}
        res.status(500).json({ error: "Server error while sending message." });
    }
});

export default router;