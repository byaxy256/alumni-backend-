// src/mongodb.ts - MongoDB connection using Mongoose
import mongoose from 'mongoose';

// If MONGODB_URI has auth errors or is unreachable, fallback to local MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/alumni_aid';
const USE_LOCAL_MONGO = process.env.USE_LOCAL_MONGO === 'true';

let isConnected = false;

export const connectMongoDB = async (): Promise<boolean> => {
    if (isConnected) {
        console.log('MongoDB already connected');
        return true;
    }

    // If USE_LOCAL_MONGO is set, skip Atlas and use local
    if (USE_LOCAL_MONGO) {
        try {
            await mongoose.connect('mongodb://localhost:27017/alumni_aid', {
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            });
            isConnected = true;
            console.log('MongoDB connected to local instance');
            return true;
        } catch (err) {
            console.error('Local MongoDB connection error:', err);
            isConnected = false;
            return false;
        }
    }

    try {
        await mongoose.connect(MONGODB_URI, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        isConnected = true;
        console.log('MongoDB connected successfully to:', MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@'));
        return true;
    } catch (err) {
        console.error('MongoDB connection error:', err);
        // Don't throw - allow app to continue with MySQL fallback
        isConnected = false;
        return false;
    }
};

// Graceful shutdown
process.on('SIGINT', async () => {
    if (isConnected) {
        await mongoose.connection.close();
        console.log('MongoDB connection closed');
        process.exit(0);
    }
});

export default mongoose;
