// src/models/Event.ts - Event schema for MongoDB
import mongoose, { Schema, Document } from 'mongoose';

export interface IEvent extends Document {
    sqlId?: number;
    title: string;
    description: string;
    image_url?: string;
    event_date: Date;
    event_time?: string;
    location?: string;
    status?: string;
    organizer_id?: string;
    target_audience?: 'all' | 'students' | 'alumni';
    audience?: string;
    registration_fee?: number;
    image_data?: Buffer;
    image_mime?: string;
    created_at: Date;
    updated_at: Date;
}

const EventSchema = new Schema<IEvent>({
    sqlId: { type: Number, index: true },
    title: { type: String, required: true, index: true },
    description: { type: String, required: true },
    image_url: { type: String },
    event_date: { type: Date, required: true, index: true },
    event_time: { type: String },
    location: { type: String },
    status: { type: String },
    organizer_id: { type: String, index: true },
    target_audience: {
        type: String,
        enum: ['all', 'students', 'alumni'],
        default: 'all'
    },
    audience: { type: String },
    registration_fee: { type: Number, default: 0 },
    image_data: { type: Buffer },
    image_mime: { type: String },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

EventSchema.index({ event_date: -1 });
EventSchema.index({ organizer_id: 1, event_date: -1 });

export const Event = mongoose.model<IEvent>('Event', EventSchema);
