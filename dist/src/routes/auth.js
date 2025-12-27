// src/routes/auth.ts
import express from 'express';
import db from '../db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const genToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
// --- REGISTER ---
router.post('/register', async (req, res) => {
    try {
        const { full_name, email, phone, password, role, meta } = req.body;
        if (!email || !password || !role) {
            return res.status(400).json({ error: 'Email, password, and role are required' });
        }
        const [existingRows] = await db.execute('SELECT id FROM users WHERE email = ? OR phone = ?', [email, phone || '']);
        if (Array.isArray(existingRows) && existingRows.length > 0) {
            return res.status(400).json({ error: 'Email or phone already exists' });
        }
        const hashed = await bcrypt.hash(password, 10);
        const uid = 'u' + Date.now();
        const [result] = await db.execute('INSERT INTO users (uid, full_name, email, phone, password, role, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())', [uid, full_name || '', email, phone || '', hashed, role, JSON.stringify(meta || {})]);
        const insertId = result.insertId;
        const token = genToken({ id: insertId, role, uid });
        res.status(201).json({
            user: {
                id: insertId,
                uid,
                full_name: full_name || '',
                email,
                phone: phone || '',
                role,
                meta: meta || {}
            },
            token
        });
    }
    catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
// --- LOGIN ---
router.post('/login', async (req, res) => {
    try {
        // support both frontends that send { email, phone, password } or { emailOrPhone, password }
        const { email, phone, emailOrPhone, password } = req.body;
        const credential = (emailOrPhone || email || phone || '').trim();
        if (!credential || !password)
            return res.status(400).json({ error: 'Missing credentials' });
        const [users] = await db.execute('SELECT * FROM users WHERE email = ? OR phone = ? LIMIT 1', [credential, credential]);
        if (!Array.isArray(users) || users.length === 0)
            return res.status(400).json({ error: 'Invalid credentials' });
        const user = users[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match)
            return res.status(400).json({ error: 'Invalid credentials' });
        let userMeta = {};
        try {
            userMeta = typeof user.meta === 'string' ? JSON.parse(user.meta) : user.meta || {};
        }
        catch (e) {
            userMeta = {};
        }
        const token = genToken({ id: user.id, role: user.role, uid: user.uid });
        res.json({
            user: {
                id: user.id,
                uid: user.uid,
                full_name: user.full_name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                meta: userMeta
            },
            token
        });
    }
    catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
// --- GET CURRENT USER ---
router.get('/me', async (req, res) => {
    try {
        const auth = req.headers.authorization;
        if (!auth)
            return res.status(401).json({ error: 'No token' });
        const token = auth.replace('Bearer ', '');
        let payload;
        try {
            payload = jwt.verify(token, JWT_SECRET);
        }
        catch (err) {
            if (err?.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expired' });
            }
            throw err;
        }
        if (!payload?.id)
            return res.status(401).json({ error: 'Invalid token payload' });
        const [rows] = await db.execute('SELECT id, uid, full_name, email, phone, role, email_verified, meta FROM users WHERE id = ? LIMIT 1', [payload.id]);
        if (!rows || rows.length === 0)
            return res.status(404).json({ error: 'User not found' });
        const user = rows[0];
        let userMeta = {};
        try {
            userMeta = typeof user.meta === 'string' ? JSON.parse(user.meta) : user.meta || {};
        }
        catch {
            userMeta = {};
        }
        res.json({
            user: {
                id: user.id,
                uid: user.uid,
                full_name: user.full_name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                email_verified: Boolean(user.email_verified),
                meta: userMeta
            }
        });
    }
    catch (err) {
        console.error('GET /me error:', err);
        res.status(401).json({ error: 'Invalid token' });
    }
});
// --- GET ALL USERS (for testing) ---
router.get('/users', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT uid, full_name, email, phone, role, meta FROM users ORDER BY created_at DESC LIMIT 20');
        const users = rows.map(row => {
            let userMeta = {};
            try {
                userMeta = typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta || {};
            }
            catch {
                userMeta = {};
            }
            return {
                uid: row.uid,
                full_name: row.full_name,
                email: row.email,
                phone: row.phone,
                role: row.role,
                meta: userMeta
            };
        });
        res.json(users);
    }
    catch (err) {
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
        if (!auth)
            return res.status(401).json({ error: 'No token' });
        const token = auth.replace('Bearer ', '');
        const payload = jwt.verify(token, JWT_SECRET);
        if (!payload?.id)
            return res.status(401).json({ error: 'Invalid token payload' });
        const { full_name, email, phone, meta } = req.body;
        // sanitize and prepare meta
        const metaStr = meta ? JSON.stringify(meta) : null;
        await db.execute('UPDATE users SET full_name = ?, email = ?, phone = ?, meta = COALESCE(?, meta) WHERE id = ?', [full_name || null, email || null, phone || null, metaStr, payload.id]);
        // return updated user
        const [rows] = await db.execute('SELECT id, uid, full_name, email, phone, role, email_verified, meta FROM users WHERE id = ? LIMIT 1', [payload.id]);
        const user = rows[0];
        let userMeta = {};
        try {
            userMeta = typeof user.meta === 'string' ? JSON.parse(user.meta) : user.meta || {};
        }
        catch {
            userMeta = {};
        }
        res.json({
            user: {
                id: user.id,
                uid: user.uid,
                full_name: user.full_name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                email_verified: Boolean(user.email_verified),
                meta: userMeta
            }
        });
    }
    catch (err) {
        console.error('PUT /me error:', err);
        res.status(401).json({ error: 'Invalid token or server error' });
    }
});
export default router;
