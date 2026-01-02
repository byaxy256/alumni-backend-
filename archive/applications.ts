// src/routes/applications.ts - Express routes for loan applications
import express from 'express';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import type { RowDataPacket } from 'mysql2';

const router = express.Router();

// Get all applications (admin/alumni office)
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await db.execute<RowDataPacket[]>(
      'SELECT * FROM applications ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching applications:', err);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// Get applications for a specific student
router.get('/mine', authenticate, async (req, res) => {
  try {
    const uid = (req as any).user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const [rows] = await db.execute<RowDataPacket[]>(
      'SELECT * FROM applications WHERE student_uid = ? ORDER BY created_at DESC',
      [uid]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching student applications:', err);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// Create new application
router.post('/', authenticate, async (req, res) => {
  try {
    const uid = (req as any).user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const { type, payload } = req.body;
    
    await db.execute(
      'INSERT INTO applications (student_uid, type, payload, status) VALUES (?, ?, ?, ?)',
      [uid, type, JSON.stringify(payload), 'pending']
    );
    
    res.status(201).json({ message: 'Application submitted successfully' });
  } catch (err) {
    console.error('Error creating application:', err);
    res.status(500).json({ error: 'Failed to create application' });
  }
});

// Update application status (admin/alumni office)
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const role = (req as any).user?.role;
    if (role !== 'admin' && role !== 'alumni_office') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;
    const { status } = req.body;
    
    await db.execute(
      'UPDATE applications SET status = ? WHERE id = ?',
      [status, id]
    );
    
    res.json({ message: 'Application status updated' });
  } catch (err) {
    console.error('Error updating application:', err);
    res.status(500).json({ error: 'Failed to update application' });
  }
});

export default router;