// src/routes/payments-mongo.ts

import express from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, authorize } from '../middleware/auth.js';
import { Payment } from '../models/Payment.js'; // Ensure this is the correct path to your Payment model
import { Loan } from '../models/Loan.js'; // We need the Loan model to update balances

const router = express.Router();

// --- MTN API Configuration (should be in your .env file) ---
const MTN_BASE_URL = 'https://sandbox.momodeveloper.mtn.com';
const MTN_COLLECTION_PRIMARY_KEY = process.env.MTN_COLLECTION_PRIMARY_KEY;
const MTN_API_USER = process.env.MTN_API_USER;
const MTN_API_KEY = process.env.MTN_API_KEY;

// Helper to get an access token from MTN
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

/**
 * @route   GET /api/payments/loan/:loanId
 * @desc    Fetch the payment history for a specific loan.
 * @access  Private (Requires authentication)
 */
router.get('/loan/:loanId', authenticate, async (req, res) => {
    try {
        const { loanId } = req.params;
        // The Loan model stores the student's UID in `student_uid` (not student_id)
        const userUid = (req as any).user.uid;

        // Security check: Ensure the loan belongs to the user asking for payment history
        const loan = await Loan.findOne({ _id: loanId, student_uid: userUid });
        if (!loan) {
            return res.status(404).json({ error: "Active loan not found for this user." });
        }

        // Find successful payments for this loan
        const payments = await Payment.find({ 
            loan_id: loanId, 
            status: 'SUCCESSFUL' 
        }).sort({ created_at: -1 });
        
        res.json(payments);
    } catch (err) {
        console.error("Error fetching payment history:", err);
        res.status(500).json({ error: 'Server error while fetching payment history.' });
    }
});

/**
 * @route   POST /api/payments/initiate
 * @desc    Initiate a mobile money payment for a loan.
 * @access  Private (Requires authentication)
 */
router.post('/initiate', authenticate, async (req, res) => {
    try {
        const { amount, phone, provider, loanId } = req.body;
        const userId = (req as any).user.id;
        const transaction_id = uuidv4();

        if (!amount || !phone || !loanId) {
            return res.status(400).json({ error: 'Amount, phone number, and loanId are required.' });
        }
        if (provider !== 'mtn') {
            return res.status(400).json({ error: 'Only MTN payments are supported at this time.' });
        }

        const token = await getMtnToken();
        // IMPORTANT: This must be a publicly accessible URL. Use ngrok for local testing.
        const callbackUrl = process.env.MTN_CALLBACK_URL || 'https://your-app.onrender.com/api/payments/callback';

        const paymentPayload = {
            amount: String(amount),
            currency: 'UGX',
            externalId: loanId,
            payer: { partyIdType: 'MSISDN', partyId: phone },
            payerMessage: `Payment for Loan #${loanId}`,
            payeeNote: `Alumni Aid Loan Repayment`
        };

        // Make the payment request to MTN
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

        // Store the pending transaction in MongoDB
        const newPayment = new Payment({
            transaction_id,
            loan_id: loanId,
            user_id: userId,
            amount,
            status: 'PENDING',
        });
        await newPayment.save();

        res.status(202).json({ message: 'Payment request sent. Please approve on your phone.', transaction_id });

    } catch (err: any) {
        console.error("MTN Payment Error:", err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to initiate payment.' });
    }
});

/**
 * @route   POST /api/payments/callback
 * @desc    Callback endpoint for MTN to send payment status updates.
 * @access  Public (Called by MTN's servers)
 */
router.post('/callback', async (req, res) => {
    const transaction_id = req.headers['x-reference-id'] as string;
    const { status, financialTransactionId } = req.body;

    console.log(`Received callback for ${transaction_id}: Status - ${status}`);

    try {
        const payment = await Payment.findOne({ transaction_id });
        if (!payment || payment.status !== 'PENDING') {
            // If payment not found or already processed, just acknowledge the request.
            return res.sendStatus(200);
        }
        
        if (status === 'SUCCESSFUL') {
            payment.status = 'SUCCESSFUL';
            payment.external_ref = financialTransactionId;
            
            // Atomically update the loan's outstanding balance
            await Loan.findByIdAndUpdate(payment.loan_id, { 
                $inc: { outstanding_balance: -payment.amount } 
            });
            console.log(`Successfully processed payment for loan #${payment.loan_id}`);
        } else {
            payment.status = 'FAILED';
            console.log(`Payment failed for transaction ${transaction_id}`);
        }
        
        await payment.save();
        res.sendStatus(200);

    } catch (err) {
        console.error("Callback processing error:", err);
        res.sendStatus(500); // Let MTN know something went wrong on our end
    }
});

export default router;