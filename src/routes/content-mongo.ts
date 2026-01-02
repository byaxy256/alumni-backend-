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
const CONTENT_DIR = path.join(process.cwd(), UPLOAD_DIR, 'content');

// Utility: save uploaded file to disk and/or keep buffer
async function saveUploadedFile(file?: Express.Multer.File) {
  if (!file) return { path: null, buffer: null, mime: null };

  await fs.mkdir(CONTENT_DIR, { recursive: true });

  const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
  const filePath = path.join(CONTENT_DIR, safeName);
  await fs.writeFile(filePath, file.buffer);

  return {
    path: `/${UPLOAD_DIR}/content/${safeName}`,
    buffer: file.buffer,
    mime: file.mimetype,
  };
}

// ===== GET Endpoints =====

// Get all published news
router.get('/news', async (_req, res) => {
  try {
    const news = await News.find().sort({ created_at: -1 });
    res.json(news);
  } catch (err) {
    console.error('NEWS ERROR:', err);
    res.status(500).json({ error: 'Failed to load news' });
  }
});

// Get all events
router.get('/events', async (_req, res) => {
  try {
    const events = await Event.find().sort({ event_date: -1 });
    res.json(events);
  } catch (err) {
    console.error('EVENTS ERROR:', err);
    res.status(500).json({ error: 'Failed to load events' });
  }
});

// ===== POST Endpoints =====

// Create news
router.post('/news', authenticate, authorize(['admin', 'alumni_office']), upload.single('image'), async (req, res) => {
  try {
    const { title, content, audience, status } = req.body;
    const { path: imagePath, buffer: imageBuffer, mime: imageMime } = await saveUploadedFile(req.file);

    const news = new News({
      title,
      content,
      image_data: imagePath || imageBuffer,
      image_mime: imageMime,
      audience: audience || 'all',
      status: status || 'published',
      author_id: (req as any).user.id,
    });

    await news.save();
    res.status(201).json(news);
  } catch (err) {
    console.error('POST /news error:', err);
    res.status(500).json({ error: 'Failed to create news' });
  }
});

// Create event
router.post('/events', authenticate, authorize(['admin', 'alumni_office']), upload.single('image'), async (req, res) => {
  try {
    const { title, description, event_date, event_time, location, audience, status } = req.body;
    const { path: imagePath, buffer: imageBuffer, mime: imageMime } = await saveUploadedFile(req.file);

    const event = new Event({
      title,
      description,
      image_url: imagePath || undefined,
      image_data: imageBuffer || undefined,
      image_mime: imageMime,
      event_date: event_date ? new Date(event_date) : new Date(),
      event_time,
      location,
      audience: audience || 'all',
      status: status || 'published',
      organizer_id: (req as any).user.id,
    });

    await event.save();
    res.status(201).json(event);
  } catch (err) {
    console.error('POST /events error:', err);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// ===== PUT Endpoints =====

// Update news
router.put('/news/:id', authenticate, authorize(['admin', 'alumni_office']), upload.single('image'), async (req, res) => {
  try {
    const { title, content, audience, status } = req.body;
    const { path: imagePath, buffer: imageBuffer, mime: imageMime } = await saveUploadedFile(req.file);

    const news = await News.findByIdAndUpdate(
      req.params.id,
      {
        title,
        content,
        ...(imagePath || imageBuffer ? { image_data: imagePath || imageBuffer, image_mime: imageMime } : {}),
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

// Update event
router.put('/events/:id', authenticate, authorize(['admin', 'alumni_office']), upload.single('image'), async (req, res) => {
  try {
    const { title, description, event_date, event_time, location, audience, status } = req.body;
    const { path: imagePath, buffer: imageBuffer, mime: imageMime } = await saveUploadedFile(req.file);

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      {
        title,
        description,
        ...(imagePath || imageBuffer ? { image_url: imagePath, image_data: imageBuffer, image_mime: imageMime } : {}),
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

// ===== DELETE Endpoints =====

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

// ===== IMAGE SERVING =====
async function serveImage(res: express.Response, data: any, mime: string | undefined) {
  try {
    if (!data) return res.status(404).json({ error: 'Image not found' });

    if (typeof data === 'string') {
      const filePath = path.join(process.cwd(), data.replace(/^\//, ''));
      if (fsSync.existsSync(filePath)) {
        const stat = fsSync.statSync(filePath);
        res.setHeader('Content-Type', mime || 'application/octet-stream');
        res.setHeader('Content-Length', String(stat.size));
        return fsSync.createReadStream(filePath).pipe(res);
      }
      return res.redirect(data); // fallback to URL
    }

    if (Buffer.isBuffer(data)) {
      res.setHeader('Content-Type', mime || 'application/octet-stream');
      res.setHeader('Content-Length', String(data.length));
      return res.send(data);
    }

    return res.status(404).json({ error: 'Image not found' });
  } catch (err) {
    console.error('serveImage error:', err);
    res.status(500).json({ error: 'Failed to load image' });
  }
}

// News image endpoint
router.get('/news/:id/image', async (req, res) => {
  const news: any = await News.findById(req.params.id).lean();
  return serveImage(res, news?.image_data, news?.image_mime);
});

// Event image endpoint
router.get('/events/:id/image', async (req, res) => {
  const event: any = await Event.findById(req.params.id).lean();
  return serveImage(res, event?.image_url || event?.image_data, event?.image_mime);
});

export default router;
