// src/models/Event.ts - Event schema for MongoDB
import mongoose, { Schema } from 'mongoose';
const EventSchema = new Schema({
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
export const Event = mongoose.model('Event', EventSchema);
