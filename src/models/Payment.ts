// src/models/Payment.ts - Payment schema for MongoDB
import mongoose, { Schema, Document } from 'mongoose';

export interface IPayment extends Document {
    sqlId?: number;
    transaction_id: string;
    loan_id?: string; // Reference to Loan ObjectId or sqlId
    loan_sql_id?: number; // Keep original loan ID
    user_id?: string; // Reference to User ObjectId or uid
    user_uid?: string; // Keep original user UID
    payer_uid?: string;
    amount: number;
    status: 'PENDING' | 'SUCCESSFUL' | 'FAILED';
    method?: string;
    external_ref?: string;
    access_number?: string;
    created_at: Date;
    updated_at: Date;
}

const PaymentSchema = new Schema<IPayment>({
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

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema);
