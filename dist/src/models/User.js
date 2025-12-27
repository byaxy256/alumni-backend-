// src/models/User.ts - User schema for MongoDB
import mongoose, { Schema } from 'mongoose';
const UserSchema = new Schema({
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
export const User = mongoose.model('User', UserSchema);
