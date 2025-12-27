// src/routes/mentors.ts - STUB - TO BE IMPLEMENTED WITH MONGODB
import express from 'express';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', async (req, res) => {
  res.json([]);
});

router.get('/students-by-field', async (req, res) => {
  res.json([]);
});

router.get('/my-mentors', authenticate, async (req, res) => {
  res.json([]);
});

router.post('/request', authenticate, async (req, res) => {
  res.status(501).json({ error: 'Mentor requests not yet implemented with MongoDB' });
});

export default router;
