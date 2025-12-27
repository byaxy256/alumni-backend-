// src/models/Message.ts - Message schema for MongoDB
import mongoose, { Schema } from 'mongoose';
const MessageSchema = new Schema({
    sqlId: { type: Number, index: true },
    chat_id: { type: String, required: true, index: true },
    sender_uid: { type: String, index: true },
    text: { type: String },
    ts: { type: Date, default: Date.now, index: true },
});
MessageSchema.index({ chat_id: 1, ts: -1 });
export const Message = mongoose.model('Message', MessageSchema);
