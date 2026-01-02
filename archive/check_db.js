import mongoose from 'mongoose';
import { Loan } from './src/models/Loan.js';
import { SupportRequest } from './src/models/SupportRequest.js';
import { User } from './src/models/User.js';

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://alumni:Alumni123456@alumni.6wc4ysj.mongodb.net/alumni_db?retryWrites=true&w=majority';

mongoose.connect(mongoUri).then(async () => {
  console.log('Connected to MongoDB');
  
  // Check a few loans
  const loans = await Loan.find().limit(3).lean();
  console.log('\n=== LOANS (first 3) ===');
  loans.forEach(loan => {
    console.log(`Loan ID: ${loan._id}`);
    console.log(`  Student UID: ${loan.student_uid}`);
    console.log(`  Amount: ${loan.amount}`);
    console.log(`  Purpose: ${loan.purpose}`);
    console.log(`  Status: ${loan.status}`);
    console.log(`  Created: ${loan.created_at}`);
    console.log('');
  });
  
  // Check a few support requests
  const supports = await SupportRequest.find().limit(3).lean();
  console.log('\n=== SUPPORT REQUESTS (first 3) ===');
  supports.forEach(req => {
    console.log(`Support ID: ${req._id}`);
    console.log(`  Student UID: ${req.student_uid}`);
    console.log(`  Amount Requested: ${req.amount_requested}`);
    console.log(`  Reason: ${req.reason}`);
    console.log(`  Status: ${req.status}`);
    console.log(`  Created: ${req.created_at}`);
    console.log('');
  });
  
  // Check users with loans
  if (loans.length > 0) {
    const user = await User.findOne({ uid: loans[0].student_uid }).lean();
    console.log('\n=== USER DATA (matched to first loan) ===');
    console.log(`UID: ${user.uid}`);
    console.log(`Name: ${user.full_name}`);
    console.log(`Phone: ${user.phone}`);
    console.log(`Email: ${user.email}`);
    console.log(`Meta:`, JSON.stringify(user.meta, null, 2));
  }
  
  mongoose.connection.close();
}).catch(err => {
  console.error('Connection error:', err.message);
  process.exit(1);
});
