// src/routes/content.ts
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import db from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

// Save uploaded file to disk and return a public URL path
async function saveUploadedFile(file?: Express.Multer.File) {
  if (!file) return null;
  const contentDir = path.join(process.cwd(), UPLOAD_DIR, 'content');
  await fs.mkdir(contentDir, { recursive: true });
  const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
  const filePath = path.join(contentDir, safeName);
  await fs.writeFile(filePath, file.buffer);
  return `/${UPLOAD_DIR}/content/${safeName}`;
}

// Helpers to normalize DB rows to frontend shape
const mapNewsRow = (row: any) => ({
  id: row.id,
  title: row.title ?? '',
  description: row.description ?? row.content ?? '',
  content: row.content ?? '',
  // Original behavior: detect blob presence only for news
  hasImage: !!(row.image_data || row.hasImage),
  audience: row.audience ?? 'both',
  published: row.published ?? (row.status ? row.status === 'published' : true),
  type: 'news' as const,
  createdAt: row.created_at ?? row.createdAt ?? null,
  updatedAt: row.updated_at ?? row.updatedAt ?? null,
});

const mapEventRow = (row: any) => ({
  id: row.id,
  title: row.title ?? '',
  description: row.description ?? row.content ?? '',
  content: row.content ?? '',
  hasImage: !!(row.image_data || row.image_url || row.image),
  imageUrl: row.image_url || row.image || null,
  audience: row.audience ?? 'both',
  date: row.event_date ?? row.date ?? null,
  time: row.event_time ?? row.time ?? null,
  location: row.location ?? '',
  registrationFee: row.registration_fee ?? 0,
  published: row.published ?? (row.status ? row.status === 'published' : true),
  type: 'event' as const,
  createdAt: row.created_at ?? row.createdAt ?? null,
  updatedAt: row.updated_at ?? row.updatedAt ?? null,
});

// --- PUBLIC ROUTES (for students/alumni to view) ---

// GET /api/content/news
router.get('/news', async (req, res) => {
  try {
    const audience = (req.query.audience as string) || '';
    if (audience) {
      try {
        const [rows] = await db.execute<RowDataPacket[]>(
          "SELECT * FROM news WHERE status = 'published' AND (audience = ? OR audience = 'both' OR audience IS NULL) ORDER BY created_at DESC",
          [audience]
        );
        return res.json({ content: rows.map(mapNewsRow) });
      } catch (errFilter) {
        console.error('GET /content/news audience filter error', errFilter);
      }
    }
    const [rows] = await db.execute<RowDataPacket[]>("SELECT * FROM news WHERE status = 'published' ORDER BY created_at DESC");
    res.json({ content: rows.map(mapNewsRow) });
  } catch (err) {
    console.error('GET /content/news error', err);
    try {
      const [rows2] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM news ORDER BY id DESC LIMIT 100'
      );
      return res.json({ content: rows2.map(mapNewsRow) });
    } catch (err2) {
      console.error('GET /content/news fallback error', err2);
      res.status(500).json({ message: 'Server error' });
    }
  }
});

// GET /api/content/events
router.get('/events', async (req, res) => {
  try {
    const audience = (req.query.audience as string) || '';
    if (audience) {
      try {
        const [rows] = await db.execute<RowDataPacket[]>(
          "SELECT e.*, (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id) AS attendees FROM events e WHERE (e.audience = ? OR e.audience = 'both' OR e.audience IS NULL) ORDER BY (e.event_date IS NULL), e.event_date ASC, e.id DESC LIMIT 100",
          [audience]
        );
        return res.json({ content: rows.map(r => ({ ...mapEventRow(r), attendees: (r as any).attendees || 0 })) });
      } catch (errFilter) {
        console.error('GET /content/events audience filter error', errFilter);
      }
    }
    const [rows] = await db.execute<RowDataPacket[]>(
      'SELECT e.*, (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id) AS attendees FROM events e ORDER BY (e.event_date IS NULL), e.event_date ASC, e.id DESC LIMIT 100'
    );
    res.json({ content: rows.map(r => ({ ...mapEventRow(r), attendees: (r as any).attendees || 0 })) });
  } catch (err) {
    console.error('GET /content/events error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET image bytes for news (restore original blob-only behavior)
router.get('/news/:id/image', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.execute<RowDataPacket[]>(
      'SELECT image_data, image_mime FROM news WHERE id = ? LIMIT 1',
      [id]
    );
    const row: any = (rows as any)[0];
    if (!row || !row.image_data) return res.status(404).json({ message: 'Image not found' });
    res.setHeader('Content-Type', row.image_mime || 'image/jpeg');
    return res.send(row.image_data);
  } catch (err: any) {
    // Likely column missing
    return res.status(404).json({ message: 'Image not available' });
  }
});

// GET image bytes for events (supports stored file paths)
router.get('/events/:id/image', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.execute<RowDataPacket[]>(
      'SELECT image_data, image_mime, image_url FROM events WHERE id = ? LIMIT 1',
      [id]
    );
    const row: any = (rows as any)[0];
    if (!row) return res.status(404).json({ message: 'Image not found' });

    // If file path stored, stream from disk
    if (row.image_url) {
      const filePath = path.join(process.cwd(), row.image_url.replace(/^\//, ''));
      try {
        const file = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        res.setHeader('Content-Type', mime);
        return res.send(file);
      } catch (e) {
        // Fall through to blob check
      }
    }

    if (row.image_data) {
      res.setHeader('Content-Type', row.image_mime || 'image/jpeg');
      return res.send(row.image_data);
    }

    return res.status(404).json({ message: 'Image not found' });
  } catch (err: any) {
    return res.status(404).json({ message: 'Image not available' });
  }
});
// POST /api/content/news
router.post('/news', authenticate, authorize(['admin', 'alumni_office']), upload.single('image'), async (req, res) => {
  try {
    const { title, description, content, target_audience, published = true } = req.body;
    const audience = target_audience || req.body.audience || 'both';
    const author_id = (req as any).user?.uid ?? null;

    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    const contentVal = description || content || '';
    // Try with image_data columns
    try {
      const [result] = await db.execute<ResultSetHeader>(
        'INSERT INTO news (title, content, image_data, image_mime, status, audience) VALUES (?, ?, ?, ?, ?, ?)',
        [title, contentVal, file?.buffer ?? null, file?.mimetype ?? null, published ? 'published' : 'draft', audience]
      );
      return res.status(201).json({ id: (result as any).insertId, message: 'News article created successfully.' });
    } catch (e1: any) {
      // Fallback without image columns
      const [result] = await db.execute<ResultSetHeader>(
        'INSERT INTO news (title, content, status) VALUES (?, ?, ?)',
        [title, contentVal, published ? 'published' : 'draft']
      );
      return res.status(201).json({ id: (result as any).insertId, message: 'News article created successfully.' });
    }
  } catch (err) {
    console.error('POST /content/news error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/content/news/:id
router.put('/news/:id', authenticate, authorize(['admin', 'alumni_office']), upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { title, description, content, published = true } = req.body;
  const audience = req.body.target_audience || req.body.audience || 'both';

  try {
    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    const contentVal = description || content || '';

    if (file) {
      try {
        await db.execute(
          'UPDATE news SET title = ?, content = ?, image_data = ?, image_mime = ?, status = ?, audience = ? WHERE id = ?',
          [title, contentVal, file.buffer, file.mimetype, published ? 'published' : 'draft', audience, id]
        );
      } catch (e1: any) {
        // Fallback without image columns
        await db.execute(
          'UPDATE news SET title = ?, content = ?, status = ? WHERE id = ?',
          [title, contentVal, published ? 'published' : 'draft', id]
        );
      }
    } else {
      await db.execute(
        'UPDATE news SET title = ?, content = ?, status = ? WHERE id = ?',
        [title, contentVal, published ? 'published' : 'draft', id]
      );
    }

    res.json({ message: 'News article updated successfully.' });
  } catch (err) {
    console.error(`PUT /content/news/${id} error`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/content/news/:id
router.delete('/news/:id', authenticate, authorize(['admin', 'alumni_office']), async (req, res) => {
  const { id } = req.params;
  try {
    await db.execute('DELETE FROM news WHERE id = ?', [id]);
    res.json({ message: 'News article deleted successfully.' });
  } catch (err) {
    console.error(`DELETE /content/news/${id} error`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/content/events
router.post('/events', authenticate, authorize(['admin', 'alumni_office']), upload.single('image'), async (req, res) => {
  try {
    const { title, description, content, date, time, location, registrationFee = 0, published = true } = req.body;
    const audience = req.body.target_audience || req.body.audience || 'both';
    const fee = Number(registrationFee) || 0;

    if (!title || !description || !date) {
      return res.status(400).json({ message: 'Title, description, and date are required' });
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    const imageUrl = await saveUploadedFile(file);
    try {
      const [result] = await db.execute<ResultSetHeader>(
        'INSERT INTO events (title, description, event_date, event_time, location, registration_fee, image_url, status, audience) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [title, description, date, time || null, location || '', fee, imageUrl, published ? 'published' : 'draft', audience]
      );
      return res.status(201).json({ id: (result as any).insertId, message: 'Event created successfully.' });
    } catch (e1: any) {
      const [result] = await db.execute<ResultSetHeader>(
        'INSERT INTO events (title, description, event_date, event_time, location, registration_fee, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [title, description, date, time || null, location || '', fee, published ? 'published' : 'draft']
      );
      return res.status(201).json({ id: (result as any).insertId, message: 'Event created successfully.' });
    }
  } catch (err) {
    console.error('POST /content/events error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/content/events/:id
router.put('/events/:id', authenticate, authorize(['admin', 'alumni_office']), upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { title, description, content, date, time, location, registrationFee = 0, published = true } = req.body;
  const fee = Number(registrationFee) || 0;

  try {
    if (!title || !description || !date) {
      return res.status(400).json({ message: 'Title, description, and date are required' });
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    const imageUrl = await saveUploadedFile(file);
    if (imageUrl) {
      await db.execute(
        'UPDATE events SET title = ?, description = ?, event_date = ?, event_time = ?, location = ?, registration_fee = ?, image_url = ?, status = ? WHERE id = ?',
        [title, description, date, time || null, location || null, fee, imageUrl, published ? 'published' : 'draft', id]
      );
    } else {
      await db.execute(
        'UPDATE events SET title = ?, description = ?, event_date = ?, event_time = ?, location = ?, registration_fee = ?, status = ? WHERE id = ?',
        [title, description, date, time || null, location || null, fee, published ? 'published' : 'draft', id]
      );
    }

    res.json({ message: 'Event updated successfully.' });
  } catch (err) {
    console.error(`PUT /content/events/${id} error`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/content/events/:id/register (Student registration)
router.post('/events/:id/register', authenticate, authorize(['student']), async (req, res) => {
  const { id } = req.params;
  const studentUid = (req as any).user?.uid;
  
  if (!studentUid) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    // Check event fee to enforce payment for paid events
    const [eventRows] = await db.execute<RowDataPacket[]>(
      'SELECT registration_fee FROM events WHERE id = ? LIMIT 1',
      [id]
    );
    const eventRow: any = (eventRows as any)[0];
    const fee = Number(eventRow?.registration_fee || 0);

    if (fee > 0) {
      // Ensure a successful event payment exists before registering
      await db.execute(
        `CREATE TABLE IF NOT EXISTS event_payments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          event_id INT NOT NULL,
          user_uid VARCHAR(64) NOT NULL,
          amount INT NOT NULL,
          method VARCHAR(32) DEFAULT NULL,
          status VARCHAR(16) NOT NULL,
          reference VARCHAR(128) DEFAULT NULL,
          transaction_id VARCHAR(64) DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      );
      const [payRows] = await db.execute<RowDataPacket[]>(
        'SELECT id FROM event_payments WHERE event_id = ? AND user_uid = ? AND status = ? LIMIT 1',
        [id, studentUid, 'SUCCESS']
      );
      if (!payRows || (payRows as any).length === 0) {
        return res.status(400).json({ message: 'Payment required before registration.' });
      }
    }

    // Check if already registered
    const [existing] = await db.execute<RowDataPacket[]>(
      'SELECT id FROM event_registrations WHERE event_id = ? AND student_uid = ?',
      [id, studentUid]
    );

    if (existing && existing.length > 0) {
      return res.status(400).json({ message: 'Already registered for this event' });
    }

    // Insert registration
    await db.execute(
      'INSERT INTO event_registrations (event_id, student_uid, registered_at) VALUES (?, ?, NOW())',
      [id, studentUid]
    );

    res.status(201).json({ message: 'Registered successfully' });
  } catch (err) {
    console.error(`POST /content/events/${id}/register error`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/content/events/:id/registrations (Get attendee list for an event)
router.get('/events/:id/registrations', authenticate, authorize(['admin', 'alumni_office']), async (req, res) => {
  const { id } = req.params;
  try {
    const [registrations] = await db.execute<RowDataPacket[]>(
      `SELECT er.id, er.student_uid, er.registered_at, u.email, u.full_name
       FROM event_registrations er
       LEFT JOIN users u ON er.student_uid = u.uid
       WHERE er.event_id = ?
       ORDER BY er.registered_at DESC`,
      [id]
    );

    res.json({ registrations });
  } catch (err) {
    console.error(`GET /content/events/${id}/registrations error`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/content/events/:id
router.delete('/events/:id', authenticate, authorize(['admin', 'alumni_office']), async (req, res) => {
  const { id } = req.params;
  try {
    await db.execute('DELETE FROM events WHERE id = ?', [id]);
    res.json({ message: 'Event deleted successfully.' });
  } catch (err) {
    console.error(`DELETE /content/events/${id} error`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Backwards-compat aliases to avoid 404s from older frontend paths
router.get('/event', (_req, res) => res.redirect(307, '/api/content/events'));
router.post('/event', (_req, res) => res.redirect(307, '/api/content/events'));

// Catch-all creator for legacy POST /api/content
router.post('/', authenticate, authorize(['admin', 'alumni_office']), async (req, res) => {
  const { type, ...rest } = req.body;

  if (type === 'news') {
    const { title, description, content, target_audience, published = true } = rest;
    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }
    try {
      const author_id = (req as any).user?.uid ?? null;
      const [result] = await db.execute<ResultSetHeader>(
        'INSERT INTO news (title, content, author_id, target_audience, status) VALUES (?, ?, ?, ?, ?)',
        [title, description || content || '', author_id, target_audience || 'all', published ? 'published' : 'draft']
      );
      return res.status(201).json({ id: result.insertId, message: 'News article created successfully.' });
    } catch (err) {
      console.error('Legacy POST /content news error', err);
      return res.status(500).json({ message: 'Server error' });
    }
  }

  if (type === 'event' || type === 'events') {
    const { title, description, content, date, time, location, published = true } = rest;
    if (!title || !description || !date) {
      return res.status(400).json({ message: 'Title, description, and date are required' });
    }
    try {
      const [result] = await db.execute<ResultSetHeader>(
        'INSERT INTO events (title, description, event_date, status) VALUES (?, ?, ?, ?)',
        [title, description, date, published ? 'published' : 'draft']
      );
      return res.status(201).json({ id: result.insertId, message: 'Event created successfully.' });
    } catch (err) {
      console.error('Legacy POST /content events error', err);
      return res.status(500).json({ message: 'Server error' });
    }
  }

  return res.status(400).json({ message: 'Specify type as "news" or "event"' });
});

export default router;