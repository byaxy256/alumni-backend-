// src/routes/payments.ts
import express from 'express';
import db from '../db.js';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth.js';
import { RowDataPacket } from 'mysql2';
import PDFDocument from 'pdfkit';

const router = express.Router();

// Ensure payments table exists with required columns (works on MySQL 5.7+)
const ensurePaymentsTable = async () => {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS payments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            transaction_id VARCHAR(191),
            loan_id INT NULL,
            user_id INT NOT NULL,
            amount DECIMAL(12,2) NOT NULL,
            status VARCHAR(64) DEFAULT 'PENDING',
            payer_uid VARCHAR(191) NULL,
            external_ref VARCHAR(191) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
};

// Ensure payments table has columns we rely on (works on MySQL 5.7+ without IF NOT EXISTS)
const ensureColumn = async (table: string, column: string, definition: string) => {
    const [rows] = await db.execute<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [table, column]
    );
    if (!rows.length) {
        await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
};

const ensurePaymentsSchema = async () => {
    try {
        await ensurePaymentsTable();
        await ensureColumn('payments', 'transaction_id', 'VARCHAR(191) NULL');
        await ensureColumn('payments', 'loan_id', 'INT NULL');
        await ensureColumn('payments', 'user_id', 'INT NULL');
        await ensureColumn('payments', 'amount', 'DECIMAL(12,2) NULL');
        await ensureColumn('payments', 'status', "VARCHAR(64) NULL DEFAULT 'PENDING'");
        await ensureColumn('payments', 'payer_uid', 'VARCHAR(191) NULL');
        await ensureColumn('payments', 'external_ref', 'VARCHAR(191) NULL');
        await ensureColumn('payments', 'access_number', 'VARCHAR(191) NULL');
        await ensureColumn('payments', 'created_at', 'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP');
        // Make sure payer_uid is nullable even if it existed as NOT NULL
        await db.execute('ALTER TABLE payments MODIFY COLUMN payer_uid VARCHAR(191) NULL');
    } catch (err) {
        console.warn('ensurePaymentsSchema warning:', err);
    }
};

void ensurePaymentsSchema();

// --- MTN API Configuration ---
const MTN_BASE_URL = 'https://sandbox.momodeveloper.mtn.com';
const MTN_COLLECTION_PRIMARY_KEY = process.env.MTN_COLLECTION_PRIMARY_KEY;
const MTN_API_USER = process.env.MTN_API_USER;
const MTN_API_KEY = process.env.MTN_API_KEY;

// Lightweight helper to record a notification; best-effort (does not throw)
const createNotification = async (targetUid: string | null | undefined, title: string, message: string) => {
    if (!targetUid) return;
    try {
        await db.execute(
            'INSERT INTO notifications (target_uid, title, message) VALUES (?, ?, ?)',
            [targetUid, title, message]
        );
    } catch (err) {
        console.warn('notification insert failed:', err);
    }
};

// Helper to get an access token from MTN
const getMtnToken = async () => {
    const credentials = Buffer.from(`${MTN_API_USER}:${MTN_API_KEY}`).toString('base64');
    const response = await axios.post(`${MTN_BASE_URL}/collection/token/`, {}, {
        headers: {
            'Ocp-Apim-Subscription-Key': MTN_COLLECTION_PRIMARY_KEY,
            'Authorization': `Basic ${credentials}`
        }
    });
    return response.data.access_token;
};

// POST /api/payments/initiate
router.post('/initiate', authenticate, async (req, res) => {
    try {
        await ensurePaymentsSchema();
        const { amount, phone, provider, loanId } = req.body;
        const userId = (req as any).user.id;
        const transactionId = uuidv4(); // A unique ID for this specific transaction attempt

        if (!amount || !phone || !loanId) {
            return res.status(400).json({ error: 'Amount, phone, and loanId are required.' });
        }
        
        // In a real app, you would add logic for Airtel here. For now, we focus on MTN.
        if (provider !== 'mtn') {
            return res.status(400).json({ error: 'Only MTN payments are supported in this demo.' });
        }

        // If MTN credentials are missing in this environment, short-circuit to a simulated success
        const hasMtnCreds = MTN_COLLECTION_PRIMARY_KEY && MTN_API_USER && MTN_API_KEY;
        let token: string | null = null;
        if (hasMtnCreds) {
            token = await getMtnToken();
        } else {
            console.warn('MTN credentials not set; simulating payment initiation for local/dev.');
        }

        // The "callback URL" is where MTN will send the final transaction status.
        // It must be a publicly accessible URL (e.g., using ngrok for local development).
        const callbackUrl = 'https://your-public-callback-url.com/api/payments/callback';

        const paymentPayload = {
            amount: String(amount),
            currency: 'UGX', // Or your country's currency
            externalId: loanId, // Can be used to identify the loan
            payer: {
                partyIdType: 'MSISDN',
                partyId: phone,
            },
            payerMessage: `Payment for Loan #${loanId}`,
            payeeNote: `Alumni Loan Repayment`
        };

        // Make the payment request to MTN
        let sentToMtn = false;
        if (token) {
            try {
                await axios.post(`${MTN_BASE_URL}/collection/v1_0/requesttopay`, paymentPayload, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'X-Reference-Id': transactionId,
                        'X-Target-Environment': 'sandbox',
                        'Ocp-Apim-Subscription-Key': MTN_COLLECTION_PRIMARY_KEY,
                        'Content-Type': 'application/json',
                        'X-Callback-Url': callbackUrl,
                    }
                });
                sentToMtn = true;
            } catch (err: any) {
                console.warn('MTN request failed, falling back to simulated success:', err.response?.data || err.message);
            }
        }

        // Store the pending transaction in your database so you can track it
        await db.execute(
            'INSERT INTO payments (transaction_id, loan_id, user_id, amount, status, payer_uid, access_number) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [transactionId, loanId, userId, amount, 'PENDING', (req as any).user?.uid || null, phone]
        );

        res.status(202).json({ message: sentToMtn ? 'Payment request sent. Please approve on your phone.' : 'Payment recorded (simulated).', transactionId });

    } catch (err: any) {
        console.error("MTN Payment Error:", err.response?.data || err.message);
        const detail = err.response?.data || err.message || 'Failed to initiate payment.';
        res.status(500).json({ error: 'Failed to initiate payment.', detail });
    }
});


// POST /api/payments/callback
// This is the endpoint that the MTN API will call to notify you of the payment status.
router.post('/callback', async (req, res) => {
    const { financialTransactionId, status } = req.body;
    const transactionId = req.headers['x-reference-id']; // The original UUID we sent

    console.log(`Received callback for ${transactionId}: Status - ${status}`);

    try {
        if (status === 'SUCCESSFUL') {
            // 1. Find the pending payment in your database
            const [paymentRows] = await db.execute<any[]>("SELECT *, loan_id AS loan_resolved FROM payments WHERE transaction_id = ?", [transactionId]);
            const payment = paymentRows[0];

            if (payment && payment.status === 'PENDING') {
                // 2. Update the payment status to SUCCESSFUL
                await db.execute("UPDATE payments SET status = ?, external_ref = ? WHERE id = ?", ['SUCCESSFUL', financialTransactionId, payment.id]);
                
                // 3. Update the loan's outstanding balance
                await db.execute("UPDATE loans SET outstanding_balance = outstanding_balance - ? WHERE id = ?", [payment.amount, payment.loan_resolved]);

                // 4. Notify the student
                await createNotification(
                    payment.payer_uid,
                    'Payment received',
                    `Payment of UGX ${Number(payment.amount || 0).toLocaleString()} was applied to your loan #${payment.loan_resolved}.`
                );

                console.log(`Successfully processed payment for loan #${payment.loan_resolved}`);
            }
        } else {
            // Update the payment status to FAILED
            await db.execute("UPDATE payments SET status = ? WHERE transaction_id = ?", ['FAILED', transactionId]);
            console.log(`Payment failed for transaction ${transactionId}`);
        }
        
        // Respond to MTN's server
        res.sendStatus(200);
        return;

    } catch (err) {
        console.error("Callback processing error:", err);
        res.sendStatus(500);
        return;
    }
});    
// --- NEW: A route to get payment history for a specific loan ---
router.get('/loan/:loanId', authenticate, async (req, res) => {
    try {
        await ensurePaymentsSchema();
        const { loanId } = req.params;
        const userId = (req as any).user.id;

        // Query to get successful payments for a specific loan, ensuring the user owns the loan
        const [rows] = await db.execute<RowDataPacket[]>(
            `SELECT p.*, p.loan_id AS loan_resolved
             FROM payments p JOIN loans l ON p.loan_id = l.id 
             WHERE p.loan_id = ? AND l.student_uid = (SELECT uid FROM users WHERE id = ?) AND p.status = 'SUCCESSFUL'
             ORDER BY p.created_at DESC`,
            [loanId, userId]
        );
        res.json(rows);
    } catch (err) {
        console.error("Error fetching payment history:", err);
        res.status(500).json({ error: 'Server error', detail: err instanceof Error ? err.message : String(err) });
    }
});

// --- NEW: Confirm a pending payment (used for simulated/local PIN confirmation)
router.post('/confirm', authenticate, async (req, res) => {
    try {
        await ensurePaymentsSchema();
        const { transactionId } = req.body;
        const userId = (req as any).user.id;

        if (!transactionId) {
            return res.status(400).json({ error: 'transactionId is required.' });
        }

        // Fetch the payment to ensure it belongs to the current user and is pending
        const [rows] = await db.execute<RowDataPacket[]>(
            `SELECT p.id, p.amount, p.loan_id, p.status, l.id AS loan_resolved
             FROM payments p
             JOIN loans l ON p.loan_id = l.id
             WHERE p.transaction_id = ? AND p.user_id = ? LIMIT 1`,
            [transactionId, userId]
        );

        if (!rows.length) {
            return res.status(404).json({ error: 'Pending payment not found for this user.' });
        }

        const payment = rows[0];
        if (payment.status !== 'PENDING') {
            return res.status(400).json({ error: 'Payment is not in a pending state.' });
        }

        // Mark payment as SUCCESSFUL and adjust the loan balance
        await db.execute(
            `UPDATE payments SET status = 'SUCCESSFUL' WHERE id = ?`,
            [payment.id]
        );

        // Decrement outstanding balance on the loan
        await db.execute(
            `UPDATE loans SET outstanding_balance = outstanding_balance - ? WHERE id = ?`,
            [payment.amount, payment.loan_resolved]
        );

        // Notify the student that payment was applied
        await createNotification(
            (req as any).user?.uid,
            'Payment received',
            `Payment of UGX ${Number(payment.amount || 0).toLocaleString()} was applied to your loan #${payment.loan_resolved}.`
        );

        return res.json({
            message: 'Payment confirmed successfully.',
            paymentId: payment.id,
            loanId: payment.loan_resolved,
        });
    } catch (err) {
        console.error('POST /payments/confirm error:', err);
        return res.status(500).json({ error: 'Failed to confirm payment.' });
    }
});
// List current user's payments (used by StudentFund fallbacks)
router.get('/mine', authenticate, async (req, res) => {
    try {
        await ensurePaymentsSchema();
        const userId = (req as any).user.id;
        const [rows] = await db.execute<RowDataPacket[]>(
            `SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC`,
            [userId]
        );
        res.json(rows);
    } catch (err) {
        console.error('GET /payments/mine error:', err);
        res.status(500).json({ error: 'Server error', detail: err instanceof Error ? err.message : String(err) });
    }
});

// --- NEW: The route to generate and download a PDF receipt ---
router.get('/:paymentId/receipt', authenticate, async (req, res) => {
    try {
        await ensurePaymentsSchema();
        const { paymentId } = req.params;
        const userId = (req as any).user.id;

        // Security Check: Fetch payment details and verify the logged-in user owns this payment
        const [paymentRows] = await db.execute<RowDataPacket[]>(
            `SELECT p.*, p.loan_id AS loan_resolved, u.full_name, u.email 
             FROM payments p JOIN users u ON p.user_id = u.id 
             WHERE p.id = ? AND p.user_id = ? AND p.status = 'SUCCESSFUL' LIMIT 1`,
            [paymentId, userId]
        );

        if (paymentRows.length === 0) {
            return res.status(404).json({ error: 'Receipt not found or you do not have permission to view it.' });
        }
        const payment = paymentRows[0];

        // --- PDF Generation Logic ---
        const doc = new PDFDocument({ size: 'A4', margin: 50 });

        // Set headers to trigger a download in the browser
        const filename = `Receipt-Payment-${payment.id}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // Pipe the PDF output directly to the HTTP response
        doc.pipe(res);

        // --- Add Content to the PDF ---
        doc.fontSize(20).text('Payment Receipt', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text('Alumni Aid - Uganda Christian University');
        doc.moveDown(2);

        doc.text(`Receipt ID: PAY-${payment.id}`);
        doc.text(`Payment Date: ${new Date(payment.created_at).toLocaleString()}`);
        if (payment.access_number) {
            doc.text(`Access Number: ${payment.access_number}`);
        }
        doc.moveDown();

        doc.text('Paid By:', { underline: true });
        doc.text(payment.full_name);
        doc.text(payment.email);
        doc.moveDown(2);

        // Table Header
        doc.fontSize(10).text('Description', { continued: true });
        doc.text('Amount', { align: 'right' });
        doc.lineCap('butt').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // Table Row
        doc.fontSize(12).text(`Payment for Loan #${payment.loan_resolved}`, { continued: true });
        doc.text(`UGX ${Number(payment.amount).toLocaleString()}`, { align: 'right' });
        doc.moveDown();

        // Total
        doc.lineCap('butt').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();
        doc.fontSize(14).font('Helvetica-Bold').text('Total Paid:', { continued: true });
        doc.text(`UGX ${Number(payment.amount).toLocaleString()}`, { align: 'right' });
        doc.moveDown(3);
        
        doc.fontSize(10).font('Helvetica').text('Thank you for your payment.', { align: 'center' });

        // Finalize the PDF and end the stream
        doc.end();

    } catch (err) {
        console.error("Error generating receipt:", err);
        res.status(500).json({ error: 'Failed to generate PDF receipt.' });
    }
});

// POST /api/payments/initialize (For event registrations with MTN/Airtel)
router.post('/initialize', authenticate, async (req, res) => {
    try {
        const { amount, phone, reference, type, description } = req.body;
        const user = (req as any).user || {};
        const userUid = user.uid;

        if (!amount || !reference || !userUid) {
            return res.status(400).json({ message: 'Amount and reference are required.' });
        }

        // Ensure event_payments table exists
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

        // parse event id from reference format 'event-<id>'
        const match = String(reference).match(/^event-(\d+)$/);
        const eventId = match ? Number(match[1]) : null;
        if (!eventId) {
            return res.status(400).json({ message: 'Invalid reference format' });
        }

        const transactionId = uuidv4();

        // Insert as PENDING
        await db.execute(
            'INSERT INTO event_payments (event_id, user_uid, amount, method, status, reference, transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [eventId, userUid, Number(amount), type || null, 'PENDING', reference, transactionId]
        );

        // In a real implementation, you would:
        // 1. Call MTN/Airtel API to initiate payment
        // 2. Get a payment URL or code
        // 3. Return it to the client

        // For now, return success (student will auto-register)
        // In production, implement actual payment provider integration
        res.status(200).json({ 
            message: 'Payment initialized',
            transactionId,
            status: 'PENDING'
        });

    } catch (err) {
        console.error('POST /payments/initialize error:', err);
        res.status(500).json({ message: 'Payment initialization failed' });
    }
});

// POST /api/payments/confirm-event
// Simulate provider callback: mark SUCCESS and auto-register the user for the event
router.post('/confirm-event', authenticate, async (req, res) => {
    try {
        const { reference } = req.body;
        const user = (req as any).user || {};
        const userUid = user.uid;

        const match = String(reference).match(/^event-(\d+)$/);
        const eventId = match ? Number(match[1]) : null;
        if (!eventId || !userUid) {
            return res.status(400).json({ message: 'Invalid request' });
        }

        // Mark last pending payment as SUCCESS
        await db.execute(
            'UPDATE event_payments SET status = ? WHERE event_id = ? AND user_uid = ? AND status = ? ORDER BY id DESC LIMIT 1',
            ['SUCCESS', eventId, userUid, 'PENDING']
        );

        // Create registration if not already registered
        await db.execute(
            'INSERT IGNORE INTO event_registrations (event_id, student_uid, registered_at) VALUES (?, ?, NOW())',
            [eventId, userUid]
        );

        res.json({ message: 'Payment confirmed and registration completed' });
    } catch (err) {
        console.error('POST /payments/confirm-event error:', err);
        res.status(500).json({ message: 'Failed to confirm payment' });
    }
});

export default router;