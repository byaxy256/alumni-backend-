import express from 'express';
import mongoose from 'mongoose';
import { Chat } from '../models/Chat.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { MentorAssignment } from '../models/MentorAssignment.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

const isObjectId = (id: any) => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);

/**
 * Map Message → frontend-friendly shape
 */
const mapMessage = (m: any) => ({
  id: m._id.toString(),
  sender_id: m.sender_uid,
  message_text: m.text,
  created_at: m.ts instanceof Date ? m.ts.toISOString() : new Date(m.ts).toISOString(),
});

/**
 * GET /api/chat/:otherUid
 * Messages between current user and other participant
 */
router.get('/:otherUid', authenticate, async (req, res) => {
  try {
    const userUid = (req as any).user.uid;
    const otherUid = req.params.otherUid;

    if (!userUid || !otherUid) return res.status(400).json({ error: 'Invalid user UIDs' });

    // Create a consistent chat ID using sorted UIDs
    const sortedUids = [userUid, otherUid].sort();
    const chatId = `chat_${sortedUids[0]}_${sortedUids[1]}`;

    let chat = await Chat.findOne({ chat_id: chatId }).lean();
    if (!chat) {
      // Create chat if it doesn't exist
      const newChat = new Chat({ chat_id: chatId, participants: [userUid, otherUid] });
      await newChat.save();
    }

    const messages = await Message.find({ chat_id: chatId }).sort({ ts: 1 }).lean();
    res.json(messages.map(mapMessage));
  } catch (err) {
    console.error('GET /:otherUid error:', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

/**
 * POST /api/chat
 * Send message to a recipient using UIDs
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { recipientUid, message } = req.body;
    const userUid = (req as any).user.uid;

    if (!recipientUid || !message) return res.status(400).json({ error: 'recipientUid and message are required' });

    // Verify recipient exists
    const recipient = await User.findOne({ uid: recipientUid });
    if (!recipient) return res.status(404).json({ error: 'Recipient user not found' });

    // Create a consistent chat ID using sorted UIDs
    const sortedUids = [userUid, recipientUid].sort();
    const chatId = `chat_${sortedUids[0]}_${sortedUids[1]}`;

    let chat = await Chat.findOne({ chat_id: chatId });
    if (!chat) {
      chat = new Chat({ chat_id: chatId, participants: [userUid, recipientUid] });
      await chat.save();
    }

    const msg = new Message({ chat_id: chat.chat_id, sender_uid: userUid, text: message, ts: new Date() });
    await msg.save();

    chat.updated_at = new Date();
    await chat.save();

    res.status(201).json(mapMessage(msg));
  } catch (err) {
    console.error('POST / error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * GET /api/chats
 * All chats for current user (including mentor assignments)
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const userUid = (req as any).user.uid;
    
    // Get all chats where user is a participant
    const chats = await Chat.find({ participants: userUid }).sort({ updated_at: -1 }).lean();
    
    // Get mentor information
    const mentorAssignments = await MentorAssignment.find({ 
      $or: [
        { student_uid: userUid },
        { mentor_uid: userUid }
      ],
      status: 'active'
    }).lean();
    
    // Enrich chats with participant information
    const enrichedChats = await Promise.all(chats.map(async (chat) => {
      const otherUids = chat.participants.filter((uid: string) => uid !== userUid);
      const otherUsers = await Promise.all(otherUids.map(uid => 
        User.findOne({ uid }).select('full_name phone email').lean()
      ));
      
      return {
        id: chat._id.toString(),
        chat_id: chat.chat_id,
        participants: chat.participants,
        other_participants: otherUsers,
        created_at: chat.created_at,
        updated_at: chat.updated_at,
      };
    }));
    
    res.json(enrichedChats);
  } catch (err) {
    console.error('GET / error:', err);
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

/**
 * GET /api/chats/:id
 * Chat details with messages
 */
router.get('/details/:chatId', authenticate, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId).lean();
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    const messages = await Message.find({ chat_id: chat.chat_id }).sort({ ts: 1 }).lean();
    
    // Get participant user information
    const participants = await Promise.all(chat.participants.map((uid: string) =>
      User.findOne({ uid }).select('full_name email phone').lean()
    ));

    res.json({
      id: chat._id.toString(),
      chat_id: chat.chat_id,
      participants: chat.participants,
      participant_info: participants,
      messages: messages.map(mapMessage),
      created_at: chat.created_at,
      updated_at: chat.updated_at,
    });
  } catch (err) {
    console.error('GET /details/:chatId error:', err);
    res.status(500).json({ error: 'Failed to fetch chat' });
  }
});

/**
 * POST /api/chats/:chatId/messages
 * Send a message in an existing chat
 */
router.post('/:chatId/messages', authenticate, async (req, res) => {
  try {
    const { text } = req.body;
    const userUid = (req as any).user.uid;
    const chat = await Chat.findById(req.params.chatId);

    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    if (!text) return res.status(400).json({ error: 'Message text is required' });

    // Verify user is a participant
    if (!chat.participants.includes(userUid)) {
      return res.status(403).json({ error: 'Not a participant of this chat' });
    }

    const message = new Message({ chat_id: chat.chat_id, sender_uid: userUid, text, ts: new Date() });
    await message.save();

    chat.updated_at = new Date();
    await chat.save();

    res.status(201).json(mapMessage(message));
  } catch (err) {
    console.error('POST /:chatId/messages error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * POST /api/mentors/assign
 * Create mentor assignment
 */
router.post('/assign', authenticate, async (req, res) => {
  try {
    const { mentorUid, field } = req.body;
    const studentUid = (req as any).user.uid;

    if (!mentorUid || !field) {
      return res.status(400).json({ error: 'mentorUid and field are required' });
    }

    // Verify mentor exists
    const mentor = await User.findOne({ uid: mentorUid, role: 'alumni' });
    if (!mentor) return res.status(404).json({ error: 'Mentor not found' });

    // Check if assignment already exists
    let assignment = await MentorAssignment.findOne({ 
      student_uid: studentUid,
      mentor_uid: mentorUid 
    });

    if (!assignment) {
      assignment = new MentorAssignment({
        student_uid: studentUid,
        mentor_uid: mentorUid,
        field,
        status: 'active'
      });
      await assignment.save();
    }

    res.status(201).json(assignment);
  } catch (err) {
    console.error('POST /assign error:', err);
    res.status(500).json({ error: 'Failed to assign mentor' });
  }
});

/**
 * GET /api/mentors/my-assignments
 * Get current user's mentor assignments
 */
router.get('/my-assignments', authenticate, async (req, res) => {
  try {
    const userUid = (req as any).user.uid;
    const userRole = (req as any).user.role;

    let assignments;
    if (userRole === 'student') {
      // Student: get assigned mentors
      assignments = await MentorAssignment.find({ student_uid: userUid, status: 'active' }).lean();
      
      // Enrich with mentor information
      const enriched = await Promise.all(assignments.map(async (a) => {
        const mentor = await User.findOne({ uid: a.mentor_uid }).select('full_name email phone').lean();
        return { ...a, mentor };
      }));
      
      res.json(enriched);
    } else if (userRole === 'alumni') {
      // Alumni: get assigned mentees
      assignments = await MentorAssignment.find({ mentor_uid: userUid, status: 'active' }).lean();
      
      // Enrich with student information
      const enriched = await Promise.all(assignments.map(async (a) => {
        const student = await User.findOne({ uid: a.student_uid }).select('full_name email phone meta').lean();
        return { ...a, student };
      }));
      
      res.json(enriched);
    } else {
      res.json([]);
    }
  } catch (err) {
    console.error('GET /my-assignments error:', err);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

export default router;
