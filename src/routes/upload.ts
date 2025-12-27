// src/routes/upload.ts
import express from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', '..', UPLOAD_DIR)),
  filename: (req, file, cb) => cb(null, `${uuidv4()}_${file.originalname}`)
});
const upload = multer({ storage });

router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = `${process.env.BASE_URL || 'http://localhost:4000'}/${process.env.UPLOAD_DIR || 'uploads'}/${req.file.filename}`;
  res.json({ url });
});

export default router;
