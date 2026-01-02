// scripts/create-test-mentor-assignments.js
// Creates test mentor assignments for students
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/alumni';

// Schema definitions
const UserSchema = new mongoose.Schema({
  uid: String,
  full_name: String,
  email: String,
  role: String,
  meta: Object,
}, { collection: 'users' });

const MentorAssignmentSchema = new mongoose.Schema({
  student_uid: String,
  mentor_uid: String,
  field: String,
  assigned_date: Date,
  status: String,
  sessions_count: Number,
  notes: String,
}, { 
  collection: 'mentorassignments',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

const User = mongoose.model('User', UserSchema);
const MentorAssignment = mongoose.model('MentorAssignment', MentorAssignmentSchema);

async function createTestAssignments() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully!');

    // Get all students
    const students = await User.find({ role: 'student' }).limit(10);
    console.log(`Found ${students.length} students`);

    // Get all alumni (potential mentors)
    const alumni = await User.find({ role: 'alumni' }).limit(10);
    console.log(`Found ${alumni.length} alumni`);

    if (students.length === 0) {
      console.log('❌ No students found! Please create student accounts first.');
      return;
    }

    if (alumni.length === 0) {
      console.log('❌ No alumni found! Please create alumni accounts first.');
      return;
    }

    console.log('\n=== Creating Mentor Assignments ===\n');

    let created = 0;
    for (const student of students) {
      // Assign 1-2 random mentors to each student
      const numMentors = Math.floor(Math.random() * 2) + 1;
      const shuffledAlumni = alumni.sort(() => Math.random() - 0.5);

      for (let i = 0; i < Math.min(numMentors, alumni.length); i++) {
        const mentor = shuffledAlumni[i];

        // Check if assignment already exists
        const existing = await MentorAssignment.findOne({
          student_uid: student.uid,
          mentor_uid: mentor.uid
        });

        if (existing) {
          console.log(`⏭️  Assignment already exists: ${student.full_name} ← ${mentor.full_name}`);
          continue;
        }

        // Create new assignment
        const assignment = new MentorAssignment({
          student_uid: student.uid,
          mentor_uid: mentor.uid,
          field: student.meta?.field || student.meta?.course || 'General',
          assigned_date: new Date(),
          status: 'active',
          sessions_count: Math.floor(Math.random() * 5),
          notes: 'Test assignment created by script'
        });

        await assignment.save();
        created++;

        console.log(`✅ Created: ${student.full_name} (${student.uid}) ← ${mentor.full_name} (${mentor.uid})`);
      }
    }

    console.log(`\n✨ Created ${created} new mentor assignments!`);

    // Show summary
    const totalAssignments = await MentorAssignment.countDocuments({ status: 'active' });
    console.log(`\n📊 Total active assignments in database: ${totalAssignments}`);

    // Show some examples
    console.log('\n=== Sample Assignments ===');
    const samples = await MentorAssignment.find({ status: 'active' }).limit(5);
    for (const sample of samples) {
      const student = await User.findOne({ uid: sample.student_uid });
      const mentor = await User.findOne({ uid: sample.mentor_uid });
      console.log(`  ${student?.full_name} (student) ← ${mentor?.full_name} (mentor) | Field: ${sample.field}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

createTestAssignments();
