// src/models/News.ts - News schema for MongoDB
import mongoose, { Schema } from 'mongoose';
const NewsSchema = new Schema({
    sqlId: { type: Number, index: true },
    title: { type: String, required: true, index: true },
    content: { type: String, required: true },
    author_id: { type: String, index: true },
    target_audience: {
        type: String,
        enum: ['all', 'students', 'alumni'],
        default: 'all'
    },
    status: {
        type: String,
        enum: ['draft', 'published'],
        default: 'published'
    },
    image_data: { type: Buffer },
    image_mime: { type: String },
    audience: { type: String },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
NewsSchema.index({ author_id: 1, created_at: -1 });
NewsSchema.index({ status: 1, created_at: -1 });
export const News = mongoose.model('News', NewsSchema);
