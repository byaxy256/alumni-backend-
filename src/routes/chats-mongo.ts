// src/routes/chats-mongo.ts - MongoDB-based chat management
import express from 'express';
import { Chat } from '../models/Chat.js';
import { Message } from '../models/Message.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

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
