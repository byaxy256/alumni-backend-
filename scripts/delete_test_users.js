// scripts/delete_test_users.js
// Delete test users created by smoke tests: emails starting with student_ or mentor_ and ending with @example.com

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Schema } from 'mongoose';

// First attempt to load .env normally
dotenv.config();

// If not present, try to read parent .env manually
if (!process.env.MONGODB_URI && !process.env.MONGO_URI) {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const envPath = path.resolve(process.cwd(), '..', '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split(/\r?\n/).forEach(line => {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (m) {
          const key = m[1];
          let val = m[2] || '';
          // strip optional quotes
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          process.env[key] = val;
        }
      });
    }
  } catch (e) {
    // ignore
  }
}

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set in .env');
  process.exit(1);
}

// Minimal User schema for deletion script (matches app schema)
const UserSchema = new Schema({
  uid: String,
  email: String,
  password: String,
  full_name: String,
  phone: String,
  role: String,
  meta: Schema.Types.Mixed,
}, { collection: 'users', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const User = mongoose.model('User', UserSchema);

async function main() {
  console.log('Connecting to', MONGODB_URI.replace(/:.+@/, ':*****@'));
  await mongoose.connect(MONGODB_URI, { maxPoolSize: 5 });

  try {
    const pattern = /^(student|mentor)_\d+_.*@example\.com$/i;
    const users = await User.find({ email: { $regex: pattern } }).select('email uid _id').lean();
    console.log('Found', users.length, 'matching users');
    if (users.length === 0) {
      console.log('No test users found. Exiting.');
      return;
    }

    for (const u of users) {
      console.log('Deleting user:', u.email, u._id.toString());
      await User.findByIdAndDelete(u._id);
    }

    console.log('Deletion complete');
  } catch (err) {
    console.error('Error during deletion:', err);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
