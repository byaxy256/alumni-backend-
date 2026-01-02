import express from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth.js';
import { Payment } from '../models/Payment.js';
import { Loan } from '../models/Loan.js';
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';

const router = express.Router();

const MTN_BASE_URL = 'https://sandbox.momodeveloper.mtn.com';
const MTN_COLLECTION_PRIMARY_KEY = process.env.MTN_COLLECTION_PRIMARY_KEY;
const MTN_API_USER = process.env.MTN_API_USER;
const MTN_API_KEY = process.env.MTN_API_KEY;

// Helper to get MTN token
const getMtnToken = async () => {
    try {
        const credentials = Buffer.from(`${MTN_API_USER}:${MTN_API_KEY}`).toString('base64');
        const response = await axios.post(`${MTN_BASE_URL}/collection/token/`, {}, {
            headers: {
                'Ocp-Apim-Subscription-Key': MTN_COLLECTION_PRIMARY_KEY,
                'Authorization': `Basic ${credentials}`
            }
        });
        return response.data.access_token;
    } catch (err: any) {
        console.error("MTN Token Error:", err.response?.data || err.message);
        throw new Error("Could not authenticate with payment provider.");
    }
};

// GET /api/payments/loan/:loanId - fetch user's loan payment history
router.get('/loan/:loanId', authenticate, async (req, res) => {
    try {
        const { loanId } = req.params;
        const userUid = (req as any).user.uid;

        const loan = await Loan.findOne({ _id: loanId, student_uid: userUid }).lean();
        if (!loan) return res.status(404).json({ error: "Loan not found for this user." });

        const payments = await Payment.find({ loan_id: loanId, status: 'SUCCESSFUL' })
            .sort({ created_at: -1 })
            .lean();

        res.json(payments);
    } catch (err) {
        console.error("GET /loan/:loanId error:", err);
        res.status(500).json({ error: 'Failed to fetch payment history' });
    }
});

// POST /api/payments/initiate - initiate MTN payment
router.post('/initiate', authenticate, async (req, res) => {
    try {
        const { amount, phone, provider, loanId } = req.body;
        const userId = (req as any).user.id;
        const userUid = (req as any).user.uid;
        const transaction_id = uuidv4();

        if (!amount || !phone || !loanId) {
            return res.status(400).json({ error: 'Amount, phone, and loanId are required.' });
        }
        if (provider !== 'mtn') {
            return res.status(400).json({ error: 'Only MTN payments are supported.' });
        }

        const token = await getMtnToken();
        const callbackUrl = process.env.MTN_CALLBACK_URL || 'https://your-app.onrender.com/api/payments/callback';

        const paymentPayload = {
            amount: String(amount),
            currency: 'UGX',
            externalId: loanId,
            payer: { partyIdType: 'MSISDN', partyId: phone },
            payerMessage: `Payment for Loan #${loanId}`,
            payeeNote: `Alumni Aid Loan Repayment`
        };

        await axios.post(`${MTN_BASE_URL}/collection/v1_0/requesttopay`, paymentPayload, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Reference-Id': transaction_id,
                'X-Target-Environment': 'sandbox',
                'Ocp-Apim-Subscription-Key': MTN_COLLECTION_PRIMARY_KEY,
                'Content-Type': 'application/json',
                'X-Callback-Url': callbackUrl,
            }
        });

        const newPayment = new Payment({
            transaction_id,
            loan_id: loanId,
            user_id: userId,
            user_uid: userUid,
            amount,
            status: 'PENDING',
        });
        await newPayment.save();
        
        // Update user phone number if provided
        if (phone && userUid) {
            await User.updateOne({ uid: userUid }, { $set: { phone } });
        }

        res.status(202).json({ message: 'Payment request sent.', transaction_id });
    } catch (err: any) {
        console.error("MTN Payment Error:", err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to initiate payment' });
    }
});

// POST /api/payments/callback - handle MTN payment callback
router.post('/callback', async (req, res) => {
    const transaction_id = req.headers['x-reference-id'] as string;
    const { status, financialTransactionId } = req.body;

    try {
        const payment = await Payment.findOne({ transaction_id });
        if (!payment || payment.status !== 'PENDING') return res.sendStatus(200);

        if (status === 'SUCCESSFUL') {
            payment.status = 'SUCCESSFUL';
            payment.external_ref = financialTransactionId;
            await Loan.findByIdAndUpdate(payment.loan_id, { $inc: { outstanding_balance: -payment.amount } });
        } else {
            payment.status = 'FAILED';
        }

        await payment.save();
        res.sendStatus(200);
    } catch (err) {
        console.error("Callback processing error:", err);
        res.sendStatus(500);
    }
});

// POST /api/payments/confirm - confirm payment after PIN entry (for simulation/local testing)
router.post('/confirm', authenticate, async (req, res) => {
    try {
        const { transactionId } = req.body;
        const userId = (req as any).user.id;
        const userUid = (req as any).user.uid;

        if (!transactionId) {
            return res.status(400).json({ error: 'Transaction ID is required' });
        }

        const payment = await Payment.findOne({ transaction_id: transactionId });
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        if (payment.status === 'SUCCESSFUL') {
            return res.json({ message: 'Payment already confirmed', paymentId: payment._id });
        }

        // Mark payment as successful and ensure user_uid is set
        payment.status = 'SUCCESSFUL';
        if (!payment.user_uid) {
            payment.user_uid = userUid;
        }
        await payment.save();

        // Update loan outstanding balance
        const loan = await Loan.findById(payment.loan_id);
        if (loan) {
            loan.outstanding_balance = Math.max(0, (loan.outstanding_balance || loan.amount) - payment.amount);
            await loan.save();
        }

        // Create notification for the user
        await Notification.create({
            target_uid: userUid,
            title: 'Payment Confirmed',
            message: `Your payment of UGX ${payment.amount.toLocaleString()} has been processed successfully.`,
            read: false,
        });

        res.json({
            message: 'Payment confirmed successfully',
            paymentId: payment._id,
        });
    } catch (err) {
        console.error('POST /payments/confirm error:', err);
        res.status(500).json({ error: 'Failed to confirm payment' });
    }
});

// GET /api/payments/:paymentId/receipt - generate/retrieve payment receipt
router.get('/:paymentId/receipt', authenticate, async (req, res) => {
    try {
        const { paymentId } = req.params;
        const userUid = (req as any).user.uid;

        if (!paymentId) {
            return res.status(400).json({ error: 'Payment ID is required' });
        }

        let payment;
        try {
            // Try to find by MongoDB ObjectId first
            payment = await Payment.findById(paymentId).lean();
        } catch (err) {
            // If not a valid ObjectId, return not found
            console.log(`Invalid ObjectId format: ${paymentId}`);
        }

        if (!payment) {
            console.log(`Payment not found with ID: ${paymentId}`);
            return res.status(404).json({ error: 'Payment not found' });
        }

        // Verify user owns this payment
        if (payment.user_uid !== userUid && payment.payer_uid !== userUid) {
            console.log(`Unauthorized access attempt: user ${userUid} tried to access payment ${paymentId}`);
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Verify payment is successful
        if (payment.status !== 'SUCCESSFUL') {
            return res.status(404).json({ error: 'Receipt only available for successful payments' });
        }

        // Generate a simple HTML receipt as PDF
        const receiptHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Payment Receipt</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    .receipt { max-width: 600px; margin: 0 auto; border: 1px solid #ddd; padding: 20px; }
                    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
                    .title { font-size: 24px; font-weight: bold; color: #0b2a4a; }
                    .subtitle { font-size: 14px; color: #666; margin-top: 5px; }
                    .details { margin: 20px 0; }
                    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
                    .label { font-weight: bold; color: #333; }
                    .value { color: #666; }
                    .amount { font-size: 18px; font-weight: bold; color: #0b2a4a; }
                    .status { padding: 10px; background-color: #d4edda; color: #155724; border-radius: 4px; text-align: center; margin: 20px 0; }
                    .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="receipt">
                    <div class="header">
                        <div class="title">PAYMENT RECEIPT</div>
                        <div class="subtitle">Alumni Aid Portal</div>
                    </div>
                    <div class="details">
                        <div class="detail-row">
                            <span class="label">Receipt ID:</span>
                            <span class="value">${payment._id?.toString()}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Date:</span>
                            <span class="value">${new Date(payment.created_at).toLocaleDateString('en-GB')}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Time:</span>
                            <span class="value">${new Date(payment.created_at).toLocaleTimeString()}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Loan ID:</span>
                            <span class="value">${payment.loan_id || payment.loan_sql_id || 'N/A'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Transaction ID:</span>
                            <span class="value">${payment.transaction_id}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Amount:</span>
                            <span class="value amount">UGX ${Number(payment.amount).toLocaleString()}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Status:</span>
                            <span class="value">${payment.status}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Payment Method:</span>
                            <span class="value">${payment.method || 'MTN Mobile Money'}</span>
                        </div>
                        ${payment.access_number ? `
                        <div class="detail-row">
                            <span class="label">Access Number:</span>
                            <span class="value">${payment.access_number}</span>
                        </div>
                        ` : ''}
                    </div>
                    <div class="status">
                        ✓ Payment Successful
                    </div>
                    <div class="footer">
                        <p>This is an automatically generated receipt. No signature is required.</p>
                        <p>For inquiries, contact the Alumni Office at support@alumni.ac.ug</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        // Convert HTML to simple PDF-like response
        // For now, send as HTML that can be printed/saved as PDF
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `attachment; filename="receipt-${paymentId}.html"`);
        res.send(receiptHtml);
    } catch (err) {
        console.error('GET /receipt error:', err);
        res.status(500).json({ error: 'Failed to generate receipt' });
    }
});

export default router;
