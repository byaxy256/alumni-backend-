import mongoose from 'mongoose';

const mongoUri = 'mongodb+srv://alumni:Alumni123456@alumni.6wc4ysj.mongodb.net/alumni_db?retryWrites=true&w=majority';

try {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  
  // Count applications
  const appCount = await db.collection('applications').countDocuments();
  console.log(`Total Applications: ${appCount}`);
  
  if (appCount > 0) {
    const sample = await db.collection('applications').findOne({});
    console.log('\nSample Application:');
    console.log(JSON.stringify(sample, null, 2));
    
    // Find for specific user
    const userUid = 'u1763546941538';
    const userApps = await db.collection('applications').find({ student_uid: userUid }).toArray();
    console.log(`\nApplications for ${userUid}:`);
    console.log(JSON.stringify(userApps, null, 2));
  }
  
  await mongoose.disconnect();
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
