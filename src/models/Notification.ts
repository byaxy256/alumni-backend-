// src/models/Notification.ts - Notification schema for MongoDB
import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
    sqlId?: number;
    target_uid: string;
    title: string;
    message: string;
    read: boolean;
    created_at: Date;
    updated_at: Date;
}

const NotificationSchema = new Schema<INotification>({
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

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
