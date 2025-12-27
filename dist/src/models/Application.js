// src/models/Application.ts - Application schema for MongoDB
import mongoose, { Schema } from 'mongoose';
const ApplicationSchema = new Schema({
    sqlId: { type: Number, index: true },
    student_uid: { type: String, required: true, index: true },
    type: { type: String },
    payload: { type: Schema.Types.Mixed, default: {} },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'info_requested'],
        default: 'pending',
        index: true
    },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
ApplicationSchema.index({ student_uid: 1, status: 1 });
export const Application = mongoose.model('Application', ApplicationSchema);
