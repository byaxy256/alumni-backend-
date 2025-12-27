// src/models/Footprint.ts - Footprint schema for MongoDB
import mongoose, { Schema, Document } from 'mongoose';

export interface IFootprint extends Document {
    sqlId?: number;
    user_uid?: string;
    action: string;
    target_type?: string;
    target_id?: string;
    meta?: Record<string, any>;
    ts: Date;
}

const FootprintSchema = new Schema<IFootprint>({
    sqlId: { type: Number, index: true },
    user_uid: { type: String, index: true },
    action: { type: String, required: true },
    target_type: { type: String },
    target_id: { type: String },
    meta: { type: Schema.Types.Mixed, default: {} },
    ts: { type: Date, default: Date.now, index: true },
});

FootprintSchema.index({ user_uid: 1, ts: -1 });

export const Footprint = mongoose.model<IFootprint>('Footprint', FootprintSchema);
