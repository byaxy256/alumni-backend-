// src/routes/payments.ts - STUB - TO BE IMPLEMENTED WITH MONGODB
import express from 'express';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Stub endpoints - return empty data for now
router.post('/initiate', authenticate, async (req, res) => {
  res.status(501).json({ error: 'Payment initiation not yet implemented with MongoDB' });
});

router.get('/mine', authenticate, async (req, res) => {
  res.json([]);
});

router.get('/:id/receipt', authenticate, async (req, res) => {
  res.status(404).json({ error: 'Receipt not found' });
});

export default router;
