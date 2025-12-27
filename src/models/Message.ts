// src/models/Message.ts - Message schema for MongoDB
import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
    sqlId?: number;
    chat_id: string;
    sender_uid?: string;
    text?: string;
    ts: Date;
}

const MessageSchema = new Schema<IMessage>({
    sqlId: { type: Number, index: true },
    chat_id: { type: String, required: true, index: true },
    sender_uid: { type: String, index: true },
    text: { type: String },
    ts: { type: Date, default: Date.now, index: true },
});

MessageSchema.index({ chat_id: 1, ts: -1 });

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
