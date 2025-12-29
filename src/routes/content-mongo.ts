// src/routes/content-mongo.ts - MongoDB-based content management
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { News } from '../models/News.js';
import { Event } from '../models/Event.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

// Save uploaded file to disk
async function saveUploadedFile(file?: Express.Multer.File) {
  if (!file) return null;
  const contentDir = path.join(process.cwd(), UPLOAD_DIR, 'content');
  await fs.mkdir(contentDir, { recursive: true });
  const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
  const filePath = path.join(contentDir, safeName);
  await fs.writeFile(filePath, file.buffer);
  return `/${UPLOAD_DIR}/content/${safeName}`;
}

// GET /api/content/news - Get all news
router.get('/news', async (req, res) => {
  try {
    const news = await News.find({ status: 'published' }).sort({ created_at: -1 }).lean();
    res.json(news.map(item => ({
      id: item._id?.toString(),
      title: item.title || '',
      content: item.content || '',
      hasImage: !!item.image_data,
      audience: item.audience || item.target_audience || 'all',
      published: item.status === 'published',
      type: 'news',
      created_at: item.created_at,
      updated_at: item.updated_at,
    })));
  } catch (err) {
    console.error('GET /news error:', err);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// GET /api/content/events - Get all events
router.get('/events', async (req, res) => {
  try {
    const events = await Event.find({ status: { $ne: 'draft' } }).sort({ event_date: -1 }).lean();
    res.json(events.map(item => ({
      id: item._id?.toString(),
      title: item.title || '',
      description: item.description || '',
      hasImage: !!item.image_url || !!item.image_data,
      imageUrl: item.image_url || null,
      audience: item.audience || item.target_audience || 'all',
      date: item.event_date,
      time: item.event_time,
      location: item.location || '',
      published: item.status !== 'draft',
      type: 'events',
      created_at: item.created_at,
      updated_at: item.updated_at,
    })));
  } catch (err) {
    console.error('GET /events error:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// POST /api/content/news - Create news (admin/alumni_office only)
router.post('/news', authenticate, authorize(['admin', 'alumni_office']), upload.single('image'), async (req, res) => {
  try {
    const { title, content, audience, status } = req.body;
    const imageUrl = await saveUploadedFile(req.file);

    const news = new News({
      title,
      content,
      image_data: imageUrl,
      audience: audience || 'all',
      status: status || 'published',
      author_id: (req as any).user.id,
    });

    await news.save();
    res.status(201).json({
      id: news._id?.toString(),
      title: news.title,
      content: news.content,
      image_data: news.image_data,
      audience: news.audience,
      status: news.status,
      created_at: news.created_at,
      updated_at: news.updated_at,
    });
  } catch (err) {
    console.error('POST /news error:', err);
    res.status(500).json({ error: 'Failed to create news' });
  }
});

// POST /api/content/events - Create event (admin/alumni_office only)
router.post('/events', authenticate, authorize(['admin', 'alumni_office']), upload.single('image'), async (req, res) => {
  try {
    const { title, description, event_date, event_time, location, audience, status } = req.body;
    const imageUrl = await saveUploadedFile(req.file);

    const event = new Event({
      title,
      description,
      image_url: imageUrl,
      event_date: event_date ? new Date(event_date) : new Date(),
      event_time,
      location,
      audience: audience || 'all',
      status: status || 'published',
      organizer_id: (req as any).user.id,
    });

    await event.save();
    res.status(201).json({
      id: event._id?.toString(),
      title: event.title,
      description: event.description,
      image_url: event.image_url,
      event_date: event.event_date,
      event_time: event.event_time,
      location: event.location,
      audience: event.audience,
      status: event.status,
      created_at: event.created_at,
      updated_at: event.updated_at,
    });
  } catch (err) {
    console.error('POST /events error:', err);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// PUT /api/content/news/:id - Update news
router.put('/news/:id', authenticate, authorize(['admin', 'alumni_office']), upload.single('image'), async (req, res) => {
  try {
    const { title, content, audience, status } = req.body;
    const imageUrl = await saveUploadedFile(req.file);

    const news = await News.findByIdAndUpdate(
      req.params.id,
      {
        title,
        content,
        ...(imageUrl && { image_data: imageUrl }),
        audience: audience || 'all',
        status: status || 'published',
        updated_at: new Date(),
      },
      { new: true }
    );

    if (!news) return res.status(404).json({ error: 'News not found' });
    res.json(news);
  } catch (err) {
    console.error('PUT /news/:id error:', err);
    res.status(500).json({ error: 'Failed to update news' });
  }
});

// PUT /api/content/events/:id - Update event
router.put('/events/:id', authenticate, authorize(['admin', 'alumni_office']), upload.single('image'), async (req, res) => {
  try {
    const { title, description, event_date, event_time, location, audience, status } = req.body;
    const imageUrl = await saveUploadedFile(req.file);

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      {
        title,
        description,
        ...(imageUrl && { image_url: imageUrl }),
        event_date: event_date ? new Date(event_date) : undefined,
        event_time,
        location,
        audience: audience || 'all',
        status: status || 'published',
        updated_at: new Date(),
      },
      { new: true }
    );

    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  } catch (err) {
    console.error('PUT /events/:id error:', err);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// DELETE /api/content/news/:id - Delete news
router.delete('/news/:id', authenticate, authorize(['admin', 'alumni_office']), async (req, res) => {
  try {
    const news = await News.findByIdAndDelete(req.params.id);
    if (!news) return res.status(404).json({ error: 'News not found' });
    res.json({ message: 'News deleted' });
  } catch (err) {
    console.error('DELETE /news/:id error:', err);
    res.status(500).json({ error: 'Failed to delete news' });
  }
});

// DELETE /api/content/events/:id - Delete event
router.delete('/events/:id', authenticate, authorize(['admin', 'alumni_office']), async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json({ message: 'Event deleted' });
  } catch (err) {
    console.error('DELETE /events/:id error:', err);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// GET /api/content/news/:id/image - Serve news image
router.get('/news/:id/image', async (req, res) => {
  try {
    const news: any = await News.findById(req.params.id).lean();
    if (!news || !news.image_data) return res.status(404).json({ error: 'Image not found' });

    // image_data may be a static path (string) or a Buffer stored in DB
    if (typeof news.image_data === 'string') {
      // If stored path is local (starts with /uploads), serve file directly so Content-Length is correct
      if (news.image_data.startsWith('/')) {
        const filePath = path.join(process.cwd(), news.image_data.replace(/^\//, ''));
        if (fsSync.existsSync(filePath)) {
          const stat = fsSync.statSync(filePath);
          const mime = news.image_mime || 'application/octet-stream';
          res.setHeader('Content-Type', mime);
          res.setHeader('Content-Length', String(stat.size));
          const stream = fsSync.createReadStream(filePath);
          return stream.pipe(res);
        }
        // fallback to redirect if file missing
        return res.redirect(news.image_data);
      }
      return res.redirect(news.image_data);
    }

    // Buffer -> stream bytes with mime if available
    const buf: Buffer = Buffer.isBuffer(news.image_data) ? news.image_data : Buffer.from(news.image_data);
    const mime = news.image_mime || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', String(buf.length));
    return res.send(buf);
  } catch (err) {
    console.error('GET /news/:id/image error:', err);
    res.status(500).json({ error: 'Failed to load image' });
  }
});

// GET /api/content/events/:id/image - Serve event image
router.get('/events/:id/image', async (req, res) => {
  try {
    const event: any = await Event.findById(req.params.id).lean();
    if (!event || !(event.image_url || event.image_data)) return res.status(404).json({ error: 'Image not found' });

    if (event.image_url && typeof event.image_url === 'string') {
      // external URL
      return res.redirect(event.image_url);
    }

    if (typeof event.image_data === 'string') {
      if (event.image_data.startsWith('/')) {
        const filePath = path.join(process.cwd(), event.image_data.replace(/^\//, ''));
        if (fsSync.existsSync(filePath)) {
          const stat = fsSync.statSync(filePath);
          const mime = event.image_mime || 'application/octet-stream';
          res.setHeader('Content-Type', mime);
          res.setHeader('Content-Length', String(stat.size));
          const stream = fsSync.createReadStream(filePath);
          return stream.pipe(res);
        }
        return res.redirect(event.image_data);
      }
      return res.redirect(event.image_data);
    }

    // Buffer stored
    const buf: Buffer = Buffer.isBuffer(event.image_data) ? event.image_data : Buffer.from(event.image_data);
    const mime = event.image_mime || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', String(buf.length));
    return res.send(buf);
  } catch (err) {
    console.error('GET /events/:id/image error:', err);
    res.status(500).json({ error: 'Failed to load image' });
  }
});

export default router;
