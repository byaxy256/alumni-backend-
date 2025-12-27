// src/models/Disbursement.ts - Disbursement schema for MongoDB
import mongoose, { Schema } from 'mongoose';
const DisbursementSchema = new Schema({
    sqlId: { type: Number, index: true },
    student_uid: { type: String, required: true, index: true },
    original_amount: { type: Number, required: true },
    deduction_amount: { type: Number, required: true },
    net_amount: { type: Number, required: true },
    approved_by: { type: String },
    approved_at: { type: Date, default: Date.now },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
DisbursementSchema.index({ student_uid: 1, approved_at: -1 });
export const Disbursement = mongoose.model('Disbursement', DisbursementSchema);
