// src/index.ts
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import express from 'express';
import fs from 'fs-extra';
import { connectMongoDB } from './mongodb.js';

import authRoutes from './routes/auth.js';
import loanRoutes from './routes/loans.js';
import notificationRoutes from './routes/notifications.js';
import uploadRoutes from './routes/upload.js';
import contentRoutes from './routes/content-mongo.js';
import mentorRoutes from './routes/mentors-mongo.js';
import supportRoutes from './routes/support-mongo.js';
import chatsRoutes from './routes/chats-mongo.js';
import applicationsRoutes from './routes/applications-mongo.js';
import disburseRoutes from './routes/disburse-mongo.js';
import paymentsRoutes from './routes/payments-mongo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

/* =======================
   Middleware
======================= */

// CORS configuration with origin function for flexibility
const corsOptions = {
  origin: function (_origin: any, callback: any) {
    // Allow all origins to unblock frontend (Vercel, localhost, etc.)
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* =======================
   Static uploads
======================= */

const uploadPath = path.join(__dirname, '..', UPLOAD_DIR);
fs.ensureDirSync(uploadPath);
app.use(`/${UPLOAD_DIR}`, express.static(uploadPath));

/* =======================
   Routes
======================= */

app.use('/api/auth', authRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/mentors', mentorRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/chat', chatsRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api/disburse', disburseRoutes);
app.use('/api/payments', paymentsRoutes);

/* =======================
   Health checks
======================= */

app.get('/', (_req, res) =>
  res.send('UCU Alumni Circle Backend running')
);

app.get('/api/test', (_req, res) =>
  res.json({ ok: true, timestamp: new Date() })
);

/* =======================
   Error handling
======================= */

app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
  });
});

/* =======================
   Start server AFTER DB
======================= */

(async () => {
  const connected = await connectMongoDB();
  if (!connected) {
    console.error('❌ MongoDB connection failed');
    process.exit(1);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
})();
