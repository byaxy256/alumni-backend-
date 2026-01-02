// Update missing loan amounts and user semester data from MySQL
import db from '../src/db.js';
import { connectMongoDB } from '../src/mongodb.js';
import { Loan } from '../src/models/Loan.js';
import { User } from '../src/models/User.js';
import type { RowDataPacket } from 'mysql2';

async function updateMissingData() {
  console.log('Starting update of missing loan amounts and user semester data...\n');
  
  try {
    // Connect to MongoDB
    const ok = await connectMongoDB();
    if (!ok) {
      console.error('MongoDB connection failed');
      process.exit(1);
    }
    console.log('✓ Connected to MongoDB');
    
    // Update Loans with missing amounts from MySQL
    console.log('\n=== Updating Loan Amounts and Semester ===');
    const [mysqlLoans] = await db.execute<RowDataPacket[]>('SELECT id, student_uid, amount_requested, semester, purpose FROM loans WHERE amount_requested > 0');
    console.log(`Found ${mysqlLoans.length} loans in MySQL with amounts`);
    
    let loansUpdated = 0;
    for (const mysqlLoan of mysqlLoans) {
      try {
        const updateFields: any = {};
        
        // Update amount if MongoDB has 0
        if (mysqlLoan.amount_requested > 0) {
          updateFields.amount = Number(mysqlLoan.amount_requested);
          updateFields.outstanding_balance = Number(mysqlLoan.amount_requested);
        }
        
        // Update purpose if MySQL has it
        if (mysqlLoan.purpose) {
          updateFields.purpose = mysqlLoan.purpose;
        }
        
        const result = await Loan.updateOne(
          { sqlId: mysqlLoan.id, amount: { $in: [0, null] } },
          { $set: updateFields }
        );
        
        if (result.modifiedCount > 0) {
          loansUpdated++;
          console.log(`✓ Updated loan sqlId=${mysqlLoan.id}, amount=${mysqlLoan.amount_requested}, purpose=${mysqlLoan.purpose}`);
        }
        
        // Update user semester if MySQL has it and user exists
        if (mysqlLoan.semester && mysqlLoan.semester > 0) {
          await User.updateOne(
            { uid: mysqlLoan.student_uid },
            { $set: { 'meta.semester': mysqlLoan.semester } }
          );
        }
      } catch (err) {
        console.error(`✗ Failed to update loan sqlId=${mysqlLoan.id}:`, err);
      }
    }
    console.log(`✓ Updated ${loansUpdated} loans with amounts from MySQL`);
    
    // Update User semester data from MySQL users table
    console.log('\n=== Updating User Semester Data ===');
    const [mysqlUsers] = await db.execute<RowDataPacket[]>('SELECT uid, meta FROM users WHERE meta IS NOT NULL');
    console.log(`Found ${mysqlUsers.length} users in MySQL with meta data`);
    
    let usersUpdated = 0;
    for (const mysqlUser of mysqlUsers) {
      try {
        // Parse meta JSON
        let meta = {};
        if (typeof mysqlUser.meta === 'string') {
          meta = JSON.parse(mysqlUser.meta);
        } else {
          meta = mysqlUser.meta;
        }
        
        // Only update if MySQL has semester and MongoDB doesn't
        if (meta.semester || meta.university_id || meta.program) {
          const updateFields: any = {};
          if (meta.semester) updateFields['meta.semester'] = meta.semester;
          if (meta.university_id) updateFields['meta.university_id'] = meta.university_id;
          if (meta.program) updateFields['meta.program'] = meta.program;
          
          const result = await User.updateOne(
            { uid: mysqlUser.uid },
            { $set: updateFields }
          );
          
          if (result.modifiedCount > 0) {
            usersUpdated++;
            console.log(`✓ Updated user ${mysqlUser.uid}, semester=${meta.semester}, program=${meta.program}`);
          }
        }
      } catch (err) {
        console.error(`✗ Failed to update user ${mysqlUser.uid}:`, err);
      }
    }
    console.log(`✓ Updated ${usersUpdated} users with semester data from MySQL`);
    
    console.log('\n✅ Migration update completed successfully!');
    console.log(`Summary: ${loansUpdated} loans updated, ${usersUpdated} users updated`);
    
    process.exit(0);
  } catch (err) {
    console.error('Migration update failed:', err);
    process.exit(1);
  }
}

updateMissingData();
