// src/routes/chats-mongo.ts - MongoDB-based chat management
import express from 'express';
import { Chat } from '../models/Chat.js';
import { Message } from '../models/Message.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Compatibility endpoint for frontend: GET /api/chat/:otherId
// Returns messages for the chat between the current user and the other participant.
router.get('/chat/:otherId', authenticate, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const otherId = req.params.otherId;

    // Find a chat that contains both participants
    const chat = await Chat.findOne({ participants: { $all: [userId, otherId] } }).lean();
    if (!chat) return res.json([]);

    const messages = await Message.find({ chat_id: chat.chat_id }).sort({ ts: 1 }).lean();

    // Map to frontend shape
    const mapped = messages.map((m: any) => ({
      id: m._id.toString(),
      sender_id: m.sender_uid,
      message_text: m.text,
      created_at: m.ts instanceof Date ? m.ts.toISOString() : new Date(m.ts).toISOString(),
    }));

    res.json(mapped);
  } catch (err) {
    console.error('GET /chat/:otherId error:', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Compatibility endpoint for frontend: POST /api/chat
// Body: { recipientId, message }
router.post('/chat', authenticate, async (req, res) => {
  try {
    const { recipientId, message } = req.body;
    const userId = (req as any).user.id;
    const senderUid = (req as any).user.uid;

    if (!recipientId || !message) return res.status(400).json({ error: 'recipientId and message are required' });

    // Find or create a chat between the two participants
    let chat = await Chat.findOne({ participants: { $all: [userId, recipientId] } });
    if (!chat) {
      const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      chat = new Chat({ chat_id: chatId, participants: [userId, recipientId] });
      await chat.save();
    }

    const msg = new Message({ chat_id: chat.chat_id, sender_uid: senderUid, text: message, ts: new Date() });
    await msg.save();

    chat.updated_at = new Date();
    await chat.save();

    // Respond with frontend-friendly shape
    res.status(201).json({
      id: msg._id.toString(),
      sender_id: msg.sender_uid,
      message_text: msg.text,
      created_at: msg.ts instanceof Date ? msg.ts.toISOString() : new Date(msg.ts).toISOString(),
    });
  } catch (err) {
    console.error('POST /chat error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GET /api/chats - Get all chats for current user
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const chats = await Chat.find({ participants: userId }).sort({ updated_at: -1 }).lean();
    res.json(chats);
  } catch (err) {
    console.error('GET /chats error:', err);
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

// POST /api/chats - Create a new chat
router.post('/', authenticate, async (req, res) => {
  try {
    const { participants } = req.body;
    const userId = (req as any).user.id;

    if (!participants || participants.length === 0) {
      return res.status(400).json({ error: 'Participants are required' });
    }

    const allParticipants = Array.from(new Set([userId, ...participants]));
    const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const chat = new Chat({
      chat_id: chatId,
      participants: allParticipants,
    });

    await chat.save();
    res.status(201).json({
      id: chat._id.toString(),
      chat_id: chat.chat_id,
      participants: chat.participants,
      created_at: chat.created_at,
      updated_at: chat.updated_at,
    });
  } catch (err) {
    console.error('POST /chats error:', err);
    res.status(500).json({ error: 'Failed to create chat' });
  }
});

// GET /api/chats/:id - Get chat details with messages
router.get('/:id', authenticate, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id).lean();
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    const messages = await Message.find({ chat_id: chat.chat_id }).sort({ ts: -1 }).limit(50).lean();
    
    res.json({
      id: chat._id.toString(),
      chat_id: chat.chat_id,
      participants: chat.participants,
      messages: messages.reverse(),
      created_at: chat.created_at,
      updated_at: chat.updated_at,
    });
  } catch (err) {
    console.error('GET /chats/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch chat' });
  }
});

// POST /api/chats/:id/messages - Send a message
router.post('/:id/messages', authenticate, async (req, res) => {
  try {
    const { text } = req.body;
    const senderUid = (req as any).user.uid;

    if (!text) return res.status(400).json({ error: 'Message text is required' });

    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    const message = new Message({
      chat_id: chat.chat_id,
      sender_uid: senderUid,
      text,
      ts: new Date(),
    });

    await message.save();

    // Update chat updated_at
    chat.updated_at = new Date();
    await chat.save();

    res.status(201).json({
      id: message._id.toString(),
      chat_id: message.chat_id,
      sender_uid: message.sender_uid,
      text: message.text,
      ts: message.ts,
    });
  } catch (err) {
    console.error('POST /messages error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
