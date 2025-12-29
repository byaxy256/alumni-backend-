// src/routes/debug-mongo.ts - Temporary debug endpoints (remove after use)
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { authenticate } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { News } from '../models/News.js';

const router = express.Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

// GET /api/debug/uploads - list upload dirs and file sizes
router.get('/uploads', authenticate, async (req, res) => {
  try {
    const root = path.join(process.cwd(), UPLOAD_DIR);
    const contentDir = path.join(root, 'content');
    const contentsDir = path.join(root, 'contents');

    const dirs = [root, contentDir, contentsDir];
    const result: any = {};
    for (const d of dirs) {
      if (fsSync.existsSync(d)) {
        const files = await fs.readdir(d);
        result[d.replace(process.cwd() + path.sep, '')] = await Promise.all(files.map(async f => {
          const fp = path.join(d, f);
          const st = await fs.stat(fp);
          return { name: f, path: fp.replace(process.cwd() + path.sep, ''), size: st.size };
        }));
      } else {
        result[d.replace(process.cwd() + path.sep, '')] = null;
      }
    }

    res.json(result);
  } catch (err) {
    console.error('GET /debug/uploads error:', err);
    res.status(500).json({ error: 'Failed to list uploads' });
  }
});

// GET /api/debug/my-meta - return the authenticated user's meta and referenced mentors
router.get('/my-meta', authenticate, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const user = await User.findById(userId).select('-password').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const approvedMentors = Array.isArray(user.meta?.approved_mentors) ? user.meta.approved_mentors : [];
    const ids = approvedMentors.map((id: any) => id.toString());
    const mentors = ids.length ? await User.find({ _id: { $in: ids } }).select('-password').lean() : [];

    res.json({ user, mentors });
  } catch (err) {
    console.error('GET /debug/my-meta error:', err);
    res.status(500).json({ error: 'Failed to fetch user meta' });
  }
});

// GET /api/debug/news/:id - inspect news image storage
router.get('/news/:id', authenticate, async (req, res) => {
  try {
    const n = await News.findById(req.params.id).lean();
    if (!n) return res.status(404).json({ error: 'News not found' });

    const info: any = { id: n._id?.toString(), image_data_type: typeof n.image_data, image_mime: n.image_mime };
    if (typeof n.image_data === 'string') {
      const imageData: string = String(n.image_data);
      const p = imageData && imageData.charAt(0) === '/' ? path.join(process.cwd(), imageData.replace(/^\//, '')) : null;
      info.image_path = imageData;
      if (p && fsSync.existsSync(p)) {
        const st = fsSync.statSync(p);
        info.file_exists = true;
        info.file_size = st.size;
      } else {
        info.file_exists = false;
      }
    } else if (Buffer.isBuffer(n.image_data)) {
      info.buffer_length = n.image_data.length;
    }

    res.json(info);
  } catch (err) {
    console.error('GET /debug/news/:id error:', err);
    res.status(500).json({ error: 'Failed to inspect news' });
  }
});

export default router;
