// src/models/Notification.ts - Notification schema for MongoDB
import mongoose, { Schema } from 'mongoose';
const NotificationSchema = new Schema({
    sqlId: { type: Number, index: true },
    target_uid: { type: String, required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false, index: true },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
NotificationSchema.index({ target_uid: 1, read: 1 });
NotificationSchema.index({ created_at: -1 });
export const Notification = mongoose.model('Notification', NotificationSchema);
