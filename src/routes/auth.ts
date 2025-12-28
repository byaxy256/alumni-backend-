// src/routes/auth.ts
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { User } from '../models/User.js';

dotenv.config();
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

console.log('Auth route loaded. JWT_SECRET is set:', !!process.env.JWT_SECRET, 'Using secret:', JWT_SECRET === process.env.JWT_SECRET ? 'FROM ENV' : 'DEFAULT FALLBACK');

const genToken = (payload: object) => jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

// --- REGISTER ---
router.post('/register', async (req, res) => {
  try {
    const { full_name, email, phone, password, role, meta } = req.body;
    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Email, password, and role are required' });
    }

    // Check if user already exists
    const existing = await User.findOne({ $or: [{ email }, { phone: phone || '' }] });
    if (existing) {
      return res.status(400).json({ error: 'Email or phone already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const uid = 'u' + Date.now();

    const user = await User.create({
      uid,
      full_name: full_name || '',
      email,
      phone: phone || '',
      password: hashed,
      role,
      meta: meta || {}
    });

    const token = genToken({ id: user._id.toString(), role: user.role, uid: user.uid });

    res.status(201).json({
      user: {
        id: user._id.toString(),
        uid: user.uid,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        meta: user.meta || {}
      },
      token
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- LOGIN ---
router.post('/login', async (req, res) => {
  try {
    console.log('Incoming /auth/login body:', req.body);
    // support both frontends that send { email, phone, password } or { emailOrPhone, password }
    const { email, phone, emailOrPhone, password } = req.body;
    const credential = (emailOrPhone || email || phone || '').trim();
    console.log('Parsed credential for login:', credential ? credential : '(empty)');

    if (!credential || !password) return res.status(400).json({ error: 'Missing credentials' });

    const user = await User.findOne({ $or: [{ email: credential }, { phone: credential }] });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Invalid credentials' });

    const token = genToken({ id: user._id.toString(), role: user.role, uid: user.uid });

    res.json({
      user: {
        id: user._id.toString(),
        uid: user.uid,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        meta: user.meta || {}
      },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- GET CURRENT USER ---
router.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'No token' });
    const token = auth.replace('Bearer ', '');
    let payload: any;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err: any) {
      if (err?.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      throw err;
    }

    if (!payload?.id) return res.status(401).json({ error: 'Invalid token payload' });

    const user = await User.findById(payload.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      user: {
        id: user._id.toString(),
        uid: user.uid,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        email_verified: false,
        meta: user.meta || {}
      }
    });
  } catch (err) {
    console.error('GET /me error:', err);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// --- GET ALL USERS (for testing) ---
router.get('/users', async (req, res) => {
  try {
    const users = await User.find()
      .select('uid full_name email phone role meta')
      .sort({ created_at: -1 })
      .limit(20);

    res.json(users.map(user => ({
      uid: user.uid,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      meta: user.meta || {}
    })));
  } catch (err) {
    console.error('GET /users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/test', (req, res) => {
  console.log('🎉 /api/auth/test route was hit successfully!');
  res.send('Auth route test is working!');
});

// --- UPDATE CURRENT USER (profile save) ---
router.put('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'No token' });
    const token = auth.replace('Bearer ', '');
    const payload: any = jwt.verify(token, JWT_SECRET);
    if (!payload?.id) return res.status(401).json({ error: 'Invalid token payload' });

    const { full_name, email, phone, meta } = req.body;
    
    const updateData: any = {};
    if (full_name) updateData.full_name = full_name;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (meta) updateData.meta = meta;

    const user = await User.findByIdAndUpdate(
      payload.id,
      { $set: updateData },
      { new: true, select: '-password' }
    );

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      user: {
        id: user._id.toString(),
        uid: user.uid,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        email_verified: false,
        meta: user.meta || {}
      }
    });
  } catch (err) {
    console.error('PUT /me error:', err);
    res.status(401).json({ error: 'Invalid token or server error' });
  }
});

export default router;
