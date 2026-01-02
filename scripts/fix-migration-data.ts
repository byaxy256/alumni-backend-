// Fix incomplete migration data by extracting info from Applications
import { Loan } from '../src/models/Loan.js';
import { SupportRequest } from '../src/models/SupportRequest.js';
import { Application } from '../src/models/Application.js';
import { User } from '../src/models/User.js';
import { connectMongoDB } from '../src/mongodb.js';

async function fixLoansAndSupportData() {
  console.log('Starting data fix migration...\n');
  
  try {
    const ok = await connectMongoDB();
    if (!ok) {
      console.error('MongoDB connection failed');
      process.exit(1);
    }

    // Fix Loans with missing amount or purpose
    console.log('Fixing Loans...');
    const loansToFix = await Loan.find({ $or: [{ amount: 0 }, { purpose: { $exists: false } }] }).lean();
    
    for (const loan of loansToFix) {
      try {
        const appData = await Application.findOne({ 
          student_uid: loan.student_uid, 
          type: 'loan'
        }).sort({ created_at: -1 }).lean();
        
        if (appData?.payload) {
          const payload = appData.payload;
          const amount = payload.amountRequested ? Number(payload.amountRequested) : loan.amount;
          const purpose = payload.purpose || loan.purpose;
          const semester = payload.currentSemester;
          
          // Update the loan
          await Loan.findByIdAndUpdate(loan._id, {
            amount: amount > 0 ? amount : loan.amount,
            outstanding_balance: amount > 0 ? amount : loan.outstanding_balance,
            purpose: purpose || loan.purpose,
          });
          
          // Update user meta if semester is found
          if (semester) {
            await User.findOneAndUpdate(
              { uid: loan.student_uid },
              { $set: { 'meta.semester': semester } }
            );
          }
          
          console.log(`✓ Fixed loan ${loan._id}: amount=${amount}, purpose=${purpose}`);
        }
      } catch (err) {
        console.error(`✗ Failed to fix loan ${loan._id}:`, err);
      }
    }
    
    // Fix Support Requests with missing amount
    console.log('\nFixing Support Requests...');
    const supportToFix = await SupportRequest.find({ amount_requested: 0 }).lean();
    
    for (const support of supportToFix) {
      try {
        const appData = await Application.findOne({ 
          student_uid: support.student_uid, 
          type: 'support'
        }).sort({ created_at: -1 }).lean();
        
        if (appData?.payload) {
          const payload = appData.payload;
          const amount = payload.amountRequested ? Number(payload.amountRequested) : support.amount_requested;
          const semester = payload.currentSemester;
          
          // Update the support request
          await SupportRequest.findByIdAndUpdate(support._id, {
            amount_requested: amount > 0 ? amount : support.amount_requested,
          });
          
          // Update user meta if semester is found
          if (semester) {
            await User.findOneAndUpdate(
              { uid: support.student_uid },
              { $set: { 'meta.semester': semester } }
            );
          }
          
          console.log(`✓ Fixed support request ${support._id}: amount=${amount}`);
        }
      } catch (err) {
        console.error(`✗ Failed to fix support request ${support._id}:`, err);
      }
    }
    
    // Fill in missing phone numbers from Users
    console.log('\nEnsuring user phone numbers...');
    const usersWithoutPhone = await User.find({ phone: { $in: ['', null, undefined] } }).lean();
    console.log(`Found ${usersWithoutPhone.length} users without phone numbers`);
    
    console.log('\n✅ Data fix migration completed!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

fixLoansAndSupportData();
