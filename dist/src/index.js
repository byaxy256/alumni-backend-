// src/index.ts
import contentRoutes from './routes/content.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import express from "express";
import fs from 'fs-extra';
import { connectMongoDB } from './mongodb.js';
import authRoutes from './routes/auth.js';
import loanRoutes from './routes/loans.js';
import supportRoutes from './routes/support.js';
import notificationRoutes from './routes/notifications.js';
import applicationRoutes from './routes/applications.js';
import chatRoutes from './routes/chats.js';
import disburseRoutes from './routes/disburse.js';
import uploadRoutes from './routes/upload.js';
import paymentRoutes from './routes/payments.js';
import mentorRoutes from './routes/mentors.js';
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // do not exit immediately in dev; just log
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
const app = express();
const PORT = process.env.PORT || 4000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:300',
        'http://localhost:3002',
        'http://localhost:3001',
        'http://localhost:5173', // Vite dev server
    ],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// static uploads dir
const uploadPath = path.join(__dirname, '..', UPLOAD_DIR);
fs.ensureDirSync(uploadPath);
app.use(`/${UPLOAD_DIR}`, express.static(uploadPath));
// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/disburse', disburseRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/mentors', mentorRoutes);
// root
app.get('/', (req, res) => res.send('UCU Alumni Circle Server Running'));
// Legacy alias routes for StudentFund fallbacks
app.get('/api/funds/mine', (req, res) => res.redirect(307, '/api/payments/mine'));
app.get('/api/transactions/mine', (req, res) => res.redirect(307, '/api/payments/mine'));
app.get('/api/student/funds', (req, res) => res.redirect(307, '/api/payments/mine'));
app.get('/api/payments', (req, res) => res.redirect(307, '/api/payments/mine'));
// 404
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
// error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' });
});
// Initialize MongoDB connection (non-blocking)
connectMongoDB().catch(err => {
    console.warn('MongoDB initialization failed, continuing with MySQL only:', err);
});
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
