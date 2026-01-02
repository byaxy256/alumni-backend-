// src/models/Message.ts - Message schema for MongoDB
import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
    sqlId?: number;
    chat_id: string;
    sender_uid?: string;
    text?: string;
    ts: Date;
    type?: 'text' | 'image' | 'file' | 'voice';
    attachment?: {
        url: string;
        name: string;
        type: string;
        size: number;
    };
    read_by?: string[]; // Array of UIDs who have read this message
    delivered_to?: string[]; // Array of UIDs who received this message
    reply_to?: string; // Message ID this is replying to
    is_edited?: boolean;
    edited_at?: Date;
}

const MessageSchema = new Schema<IMessage>({
    sqlId: { type: Number, index: true },
    chat_id: { type: String, required: true, index: true },
    sender_uid: { type: String, index: true },
    text: { type: String },
    ts: { type: Date, default: Date.now, index: true },
    type: { type: String, enum: ['text', 'image', 'file', 'voice'], default: 'text' },
    attachment: {
        url: String,
        name: String,
        type: String,
        size: Number
    },
    read_by: [{ type: String }],
    delivered_to: [{ type: String }],
    reply_to: { type: String },
    is_edited: { type: Boolean, default: false },
    edited_at: { type: Date }
});

MessageSchema.index({ chat_id: 1, ts: -1 });
MessageSchema.index({ sender_uid: 1, ts: -1 });

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
