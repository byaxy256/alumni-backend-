// src/models/Disbursement.ts - Disbursement schema for MongoDB
import mongoose, { Schema, Document } from 'mongoose';

export interface IDisbursement extends Document {
    sqlId?: number;
    student_uid: string;
    original_amount: number;
    deduction_amount: number;
    net_amount: number;
    approved_by?: string;
    approved_at: Date;
    created_at: Date;
    updated_at: Date;
}

const DisbursementSchema = new Schema<IDisbursement>({
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

export const Disbursement = mongoose.model<IDisbursement>('Disbursement', DisbursementSchema);
