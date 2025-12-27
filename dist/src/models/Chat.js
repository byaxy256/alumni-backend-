// src/models/Chat.ts - Chat schema for MongoDB
import mongoose, { Schema } from 'mongoose';
const ChatSchema = new Schema({
    sqlId: { type: Number, index: true },
    chat_id: { type: String, required: true, unique: true, index: true },
    participants: [{ type: String, index: true }],
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
ChatSchema.index({ chat_id: 1 });
export const Chat = mongoose.model('Chat', ChatSchema);
