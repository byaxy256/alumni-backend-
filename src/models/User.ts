// src/models/User.ts - User schema for MongoDB
import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
    uid: string; // Keep old SQL uid as unique field
    sqlId?: number; // Optional: store original MySQL id for reference
    email: string;
    password: string;
    full_name: string;
    role: 'student' | 'alumni' | 'admin' | 'alumni_office';
    meta?: any;
    created_at: Date;
    updated_at: Date;
}

const UserSchema = new Schema<IUser>({
    uid: { type: String, required: true, unique: true, index: true },
    sqlId: { type: Number, index: true }, // Original MySQL ID
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    full_name: { type: String, required: true },
    role: { 
        type: String, 
        enum: ['student', 'alumni', 'admin', 'alumni_office'],
        required: true,
        index: true
    },
    meta: { type: Schema.Types.Mixed, default: {} },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

export const User = mongoose.model<IUser>('User', UserSchema);
