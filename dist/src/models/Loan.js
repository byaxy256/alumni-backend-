// src/models/Loan.ts - Loan schema for MongoDB
import mongoose, { Schema } from 'mongoose';
const LoanSchema = new Schema({
    sqlId: { type: Number, index: true },
    student_uid: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    outstanding_balance: { type: Number, required: true },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'active', 'paid'],
        default: 'pending',
        index: true
    },
    purpose: { type: String },
    application_date: { type: Date, default: Date.now },
    approved_at: { type: Date },
    approved_by: { type: String },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
LoanSchema.index({ student_uid: 1, status: 1 });
export const Loan = mongoose.model('Loan', LoanSchema);
