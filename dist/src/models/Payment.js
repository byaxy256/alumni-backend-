// src/models/Payment.ts - Payment schema for MongoDB
import mongoose, { Schema } from 'mongoose';
const PaymentSchema = new Schema({
    sqlId: { type: Number, index: true },
    transaction_id: { type: String, required: true, unique: true, index: true },
    loan_id: { type: String, index: true }, // Can be ObjectId or numeric string
    loan_sql_id: { type: Number, index: true },
    user_id: { type: String, index: true },
    user_uid: { type: String, index: true },
    payer_uid: { type: String, index: true },
    amount: { type: Number, required: true },
    status: {
        type: String,
        enum: ['PENDING', 'SUCCESSFUL', 'FAILED'],
        default: 'PENDING',
        index: true
    },
    method: { type: String },
    external_ref: { type: String },
    access_number: { type: String },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
PaymentSchema.index({ loan_sql_id: 1, status: 1 });
export const Payment = mongoose.model('Payment', PaymentSchema);
