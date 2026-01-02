// src/models/SupportRequest.ts - Support Request schema for MongoDB
import mongoose, { Schema, Document } from 'mongoose';

export interface ISupportRequest extends Document {
    sqlId?: number;
    student_uid: string;
    amount_requested: number;
    outstanding_balance: number;
    reason?: string;
    attachments?: any[]; // Array of attachment objects (more flexible)
    status: 'pending' | 'approved' | 'rejected' | 'info_requested' | 'active' | 'paid';
    requested_fields?: Record<string, any>;
    rejection_reason?: string;
    created_at: Date;
    updated_at: Date;
}

const SupportRequestSchema = new Schema<ISupportRequest>({
    sqlId: { type: Number, index: true },
    student_uid: { type: String, required: true, index: true },
    amount_requested: { type: Number, required: true },
    outstanding_balance: { type: Number, required: true },
    reason: { type: String },
    attachments: [{ type: Schema.Types.Mixed }], // Store as mixed type to handle objects
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'info_requested', 'active', 'paid'],
        default: 'pending',
        index: true
    },
    requested_fields: { type: Schema.Types.Mixed, default: {} },
    rejection_reason: { type: String },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

SupportRequestSchema.index({ student_uid: 1, status: 1 });
SupportRequestSchema.index({ created_at: -1 });

export const SupportRequest = mongoose.model<ISupportRequest>('SupportRequest', SupportRequestSchema);
