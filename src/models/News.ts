// src/models/News.ts - News schema for MongoDB
import mongoose, { Schema, Document } from 'mongoose';

export interface INews extends Document {
    sqlId?: number;
    title: string;
    content: string;
    author_id?: string;
    target_audience?: 'all' | 'students' | 'alumni';
    status?: 'draft' | 'published';
    image_data?: Buffer;
    image_mime?: string;
    audience?: string;
    created_at: Date;
    updated_at: Date;
}

const NewsSchema = new Schema<INews>({
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

export const News = mongoose.model<INews>('News', NewsSchema);
