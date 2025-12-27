// src/models/Chat.ts - Chat schema for MongoDB
import mongoose, { Schema, Document } from 'mongoose';

export interface IChat extends Document {
    sqlId?: number;
    chat_id: string;
    participants?: string[];
    created_at: Date;
    updated_at: Date;
}

const ChatSchema = new Schema<IChat>({
    sqlId: { type: Number, index: true },
    chat_id: { type: String, required: true, unique: true, index: true },
    participants: [{ type: String, index: true }],
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

ChatSchema.index({ chat_id: 1 });

export const Chat = mongoose.model<IChat>('Chat', ChatSchema);
