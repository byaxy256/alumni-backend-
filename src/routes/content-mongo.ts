// src/routes/content-mongo.ts - MongoDB-based content management
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
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
    const news = await News.find({ published: true }).sort({ createdAt: -1 }).lean();
    res.json(news.map(item => ({
      id: item._id.toString(),
      title: item.title || '',
      description: item.description || '',
      content: item.content || '',
      hasImage: !!item.imageUrl,
      imageUrl: item.imageUrl || null,
      audience: item.audience || 'both',
      published: item.published !== false,
      type: 'news',
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })));
  } catch (err) {
    console.error('GET /news error:', err);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// GET /api/content/events - Get all events
router.get('/events', async (req, res) => {
  try {
    const events = await Event.find({ published: true }).sort({ eventDate: -1 }).lean();
    res.json(events.map(item => ({
      id: item._id.toString(),
      title: item.title || '',
      description: item.description || '',
      content: item.content || '',
      hasImage: !!item.imageUrl,
      imageUrl: item.imageUrl || null,
      audience: item.audience || 'both',
      date: item.eventDate,
      time: item.eventTime,
      location: item.location || '',
      published: item.published !== false,
      type: 'events',
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })));
  } catch (err) {
    console.error('GET /events error:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// POST /api/content/news - Create news (admin/alumni_office only)
router.post('/news', authenticate, authorize(['admin', 'alumni_office']), upload.single('image'), async (req, res) => {
  try {
    const { title, description, content, audience, published } = req.body;
    const imageUrl = await saveUploadedFile(req.file);

    const news = new News({
      title,
      description,
      content,
      imageUrl,
      audience: audience || 'both',
      published: published !== 'false',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await news.save();
    res.status(201).json({
      id: news._id.toString(),
      title: news.title,
      description: news.description,
      content: news.content,
      imageUrl: news.imageUrl,
      audience: news.audience,
      published: news.published,
      createdAt: news.createdAt,
      updatedAt: news.updatedAt,
    });
  } catch (err) {
    console.error('POST /news error:', err);
    res.status(500).json({ error: 'Failed to create news' });
  }
});

// POST /api/content/events - Create event (admin/alumni_office only)
router.post('/events', authenticate, authorize(['admin', 'alumni_office']), upload.single('image'), async (req, res) => {
  try {
    const { title, description, content, eventDate, eventTime, location, audience, published } = req.body;
    const imageUrl = await saveUploadedFile(req.file);

    const event = new Event({
      title,
      description,
      content,
      imageUrl,
      eventDate: eventDate ? new Date(eventDate) : null,
      eventTime,
      location,
      audience: audience || 'both',
      published: published !== 'false',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await event.save();
    res.status(201).json({
      id: event._id.toString(),
      title: event.title,
      description: event.description,
      content: event.content,
      imageUrl: event.imageUrl,
      eventDate: event.eventDate,
      eventTime: event.eventTime,
      location: event.location,
      audience: event.audience,
      published: event.published,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    });
  } catch (err) {
    console.error('POST /events error:', err);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// PUT /api/content/news/:id - Update news
router.put('/news/:id', authenticate, authorize(['admin', 'alumni_office']), upload.single('image'), async (req, res) => {
  try {
    const { title, description, content, audience, published } = req.body;
    const imageUrl = await saveUploadedFile(req.file);

    const news = await News.findByIdAndUpdate(
      req.params.id,
      {
        title,
        description,
        content,
        ...(imageUrl && { imageUrl }),
        audience: audience || 'both',
        published: published !== 'false',
        updatedAt: new Date(),
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
    const { title, description, content, eventDate, eventTime, location, audience, published } = req.body;
    const imageUrl = await saveUploadedFile(req.file);

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      {
        title,
        description,
        content,
        ...(imageUrl && { imageUrl }),
        eventDate: eventDate ? new Date(eventDate) : undefined,
        eventTime,
        location,
        audience: audience || 'both',
        published: published !== 'false',
        updatedAt: new Date(),
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

export default router;
