// Migration script to sync mentor data bidirectionally
// Run this once to populate student's approved_mentors from alumni's approved_mentees
import db from './db.js';
const parseMeta = (raw) => {
    try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
    }
    catch {
        return {};
    }
};
async function migrateMentorData() {
    console.log('Starting mentor data migration...');
    try {
        // Get all alumni with approved_mentees
        const [alumniRows] = await db.execute('SELECT uid, full_name, meta FROM users WHERE role = ?', ['alumni']);
        let updatedStudents = 0;
        let totalAlumni = 0;
        for (const alumni of alumniRows) {
            const alumniMeta = parseMeta(alumni.meta);
            const approvedMentees = Array.isArray(alumniMeta.approved_mentees)
                ? alumniMeta.approved_mentees
                : [];
            if (approvedMentees.length === 0)
                continue;
            totalAlumni++;
            console.log(`\nAlumni: ${alumni.full_name} (${alumni.uid})`);
            console.log(`  Has ${approvedMentees.length} approved mentees:`, approvedMentees);
            // For each approved mentee, add this alumni to their approved_mentors
            for (const studentId of approvedMentees) {
                const [studentRows] = await db.execute('SELECT uid, full_name, meta FROM users WHERE uid = ?', [studentId]);
                if (!Array.isArray(studentRows) || studentRows.length === 0) {
                    console.log(`  ⚠️  Student ${studentId} not found`);
                    continue;
                }
                const student = studentRows[0];
                const studentMeta = parseMeta(student.meta);
                const approvedMentors = Array.isArray(studentMeta.approved_mentors)
                    ? studentMeta.approved_mentors
                    : [];
                // Check if alumni is already in student's approved_mentors
                if (approvedMentors.includes(alumni.uid)) {
                    console.log(`  ✓ Student ${student.full_name} already has this mentor`);
                    continue;
                }
                // Add alumni to student's approved_mentors
                approvedMentors.push(alumni.uid);
                const updatedStudentMeta = {
                    ...studentMeta,
                    approved_mentors: approvedMentors
                };
                await db.execute('UPDATE users SET meta = ? WHERE uid = ?', [JSON.stringify(updatedStudentMeta), studentId]);
                updatedStudents++;
                console.log(`  ✅ Added mentor to ${student.full_name}'s approved_mentors`);
            }
        }
        console.log('\n' + '='.repeat(50));
        console.log('Migration complete!');
        console.log(`Total alumni processed: ${totalAlumni}`);
        console.log(`Students updated: ${updatedStudents}`);
        console.log('='.repeat(50));
    }
    catch (error) {
        console.error('Migration error:', error);
        throw error;
    }
    finally {
        await db.end();
        process.exit(0);
    }
}
// Run migration
migrateMentorData().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
