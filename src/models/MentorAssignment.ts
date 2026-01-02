// src/models/MentorAssignment.ts - Mentor Assignment schema for MongoDB
import mongoose, { Schema, Document } from 'mongoose';

export interface IMentorAssignment extends Document {
    student_uid: string;
    mentor_uid: string;
    field: string;
    assigned_date: Date;
    status: 'active' | 'paused' | 'completed';
    sessions_count: number;
    notes?: string;
    created_at: Date;
    updated_at: Date;
}

const MentorAssignmentSchema = new Schema<IMentorAssignment>({
    student_uid: { type: String, required: true, index: true },
    mentor_uid: { type: String, required: true, index: true },
    field: { type: String, required: true },
    assigned_date: { type: Date, default: Date.now },
    status: {
        type: String,
        enum: ['active', 'paused', 'completed'],
        default: 'active',
        index: true
    },
    sessions_count: { type: Number, default: 0 },
    notes: { type: String },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

MentorAssignmentSchema.index({ student_uid: 1, status: 1 });
MentorAssignmentSchema.index({ mentor_uid: 1, status: 1 });

export const MentorAssignment = mongoose.model<IMentorAssignment>('MentorAssignment', MentorAssignmentSchema);
