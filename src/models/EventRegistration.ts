// src/models/EventRegistration.ts - Event Registration schema for MongoDB
import mongoose, { Schema, Document } from 'mongoose';

export interface IEventRegistration extends Document {
  sqlId?: number; // Original MySQL ID
  event_sql_id: number; // MySQL event id reference
  student_uid: string;
  registered_at: Date;
  created_at: Date;
}

const EventRegistrationSchema = new Schema<IEventRegistration>({
  sqlId: { type: Number, index: true, unique: true },
  event_sql_id: { type: Number, required: true, index: true },
  student_uid: { type: String, required: true, index: true },
  registered_at: { type: Date, required: true },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

export const EventRegistration = mongoose.model<IEventRegistration>('EventRegistration', EventRegistrationSchema);
