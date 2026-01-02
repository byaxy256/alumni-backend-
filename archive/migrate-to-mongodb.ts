// scripts/migrate-to-mongodb.ts - One-time data migration from MySQL to MongoDB
import db from '../src/db.js';
import mongooseDefault, { connectMongoDB } from '../src/mongodb.js';
import { User, Loan, Payment, Notification, Disbursement, Application, Chat, Event, Footprint, Message, News, SupportRequest, EventRegistration } from '../src/models/index.js';
import type { RowDataPacket } from 'mysql2';

async function migrateUsers() {
    console.log('Migrating users...');
    const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM users');
    
    for (const row of rows) {
        try {
            await User.findOneAndUpdate(
                { uid: row.uid },
                {
                    sqlId: row.id,
                    uid: row.uid,
                    email: row.email,
                    password: row.password,
                    full_name: row.full_name,
                    role: row.role,
                    meta: typeof row.meta === 'string' ? JSON.parse(row.meta || '{}') : row.meta,
                    created_at: row.created_at || new Date(),
                },
                { upsert: true, new: true }
            );
        } catch (err) {
            console.error(`Failed to migrate user ${row.uid}:`, err);
        }
    }
    console.log(`✓ Migrated ${rows.length} users`);
}

async function migrateLoans() {
    console.log('Migrating loans...');
    const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM loans');
    
    for (const row of rows) {
        try {
            await Loan.findOneAndUpdate(
                { sqlId: row.id },
                {
                    sqlId: row.id,
                    student_uid: row.student_uid,
                    amount: Number(row.amount || 0),
                    outstanding_balance: Number(row.outstanding_balance || 0),
                    status: row.status || 'pending',
                    purpose: row.purpose,
                    application_date: row.application_date || row.created_at || new Date(),
                    approved_at: row.approved_at,
                    approved_by: row.approved_by,
                    created_at: row.created_at || new Date(),
                },
                { upsert: true, new: true }
            );
        } catch (err) {
            console.error(`Failed to migrate loan ${row.id}:`, err);
        }
    }
    console.log(`✓ Migrated ${rows.length} loans`);
}

async function migratePayments() {
    console.log('Migrating payments...');
    const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM payments');
    
    for (const row of rows) {
        try {
            await Payment.findOneAndUpdate(
                { transaction_id: row.transaction_id },
                {
                    sqlId: row.id,
                    transaction_id: row.transaction_id,
                    loan_sql_id: row.loan_id,
                    user_uid: row.payer_uid,
                    payer_uid: row.payer_uid,
                    amount: Number(row.amount || 0),
                    status: row.status || 'PENDING',
                    method: row.method,
                    external_ref: row.external_ref,
                    access_number: row.access_number,
                    created_at: row.created_at || new Date(),
                },
                { upsert: true, new: true }
            );
        } catch (err) {
            console.error(`Failed to migrate payment ${row.id}:`, err);
        }
    }
    console.log(`✓ Migrated ${rows.length} payments`);
}

async function migrateNotifications() {
    console.log('Migrating notifications...');
    const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM notifications');
    
    for (const row of rows) {
        try {
            await Notification.create({
                sqlId: row.id,
                target_uid: row.target_uid,
                title: row.title,
                message: row.message,
                read: Boolean(row.read),
                created_at: row.created_at || new Date(),
            });
        } catch (err: any) {
            if (err.code !== 11000) { // Ignore duplicates
                console.error(`Failed to migrate notification ${row.id}:`, err);
            }
        }
    }
    console.log(`✓ Migrated ${rows.length} notifications`);
}

async function migrateDisbursements() {
    console.log('Migrating disbursements...');
    
    try {
        const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM disbursements');
        
        for (const row of rows) {
            try {
                await Disbursement.findOneAndUpdate(
                    { sqlId: row.id },
                    {
                        sqlId: row.id,
                        student_uid: row.student_uid,
                        original_amount: Number(row.original_amount || 0),
                        deduction_amount: Number(row.deduction_amount || 0),
                        net_amount: Number(row.net_amount || 0),
                        approved_by: row.approved_by,
                        approved_at: row.approved_at || new Date(),
                        created_at: row.created_at || new Date(),
                    },
                    { upsert: true, new: true }
                );
            } catch (err) {
                console.error(`Failed to migrate disbursement ${row.id}:`, err);
            }
        }
        console.log(`✓ Migrated ${rows.length} disbursements`);
    } catch (err: any) {
        if (err.code === 'ER_NO_SUCH_TABLE') {
            console.log('✓ Disbursements table does not exist, skipping');
        } else {
            console.error('Failed to migrate disbursements:', err);
        }
    }
}

async function migrateApplications() {
    console.log('Migrating applications...');
    const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM applications');
    
    for (const row of rows) {
        try {
            await Application.findOneAndUpdate(
                { sqlId: row.id },
                {
                    sqlId: row.id,
                    student_uid: row.student_uid,
                    type: row.type,
                    payload: typeof row.payload === 'string' ? JSON.parse(row.payload || '{}') : row.payload,
                    status: row.status || 'pending',
                    created_at: row.created_at || new Date(),
                },
                { upsert: true, new: true }
            );
        } catch (err) {
            console.error(`Failed to migrate application ${row.id}:`, err);
        }
    }
    console.log(`✓ Migrated ${rows.length} applications`);
}

async function migrateChats() {
    console.log('Migrating chats...');
    const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM chats');
    
    for (const row of rows) {
        try {
            await Chat.findOneAndUpdate(
                { chat_id: row.chat_id },
                {
                    sqlId: row.id,
                    chat_id: row.chat_id,
                    participants: typeof row.participants === 'string' ? JSON.parse(row.participants || '[]') : (row.participants || []),
                    created_at: row.created_at || new Date(),
                },
                { upsert: true, new: true }
            );
        } catch (err) {
            console.error(`Failed to migrate chat ${row.id}:`, err);
        }
    }
    console.log(`✓ Migrated ${rows.length} chats`);
}

async function migrateEvents() {
    console.log('Migrating events...');
    const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM events');
    
    for (const row of rows) {
        try {
            await Event.findOneAndUpdate(
                { sqlId: row.id },
                {
                    sqlId: row.id,
                    title: row.title,
                    description: row.description,
                    image_url: row.image_url,
                    event_date: row.event_date || new Date(),
                    event_time: row.event_time,
                    location: row.location,
                    status: row.status,
                    organizer_id: row.organizer_id,
                    target_audience: row.target_audience || 'all',
                    audience: row.audience,
                    registration_fee: Number(row.registration_fee || 0),
                    image_data: row.image_data,
                    image_mime: row.image_mime,
                    created_at: row.created_at || new Date(),
                },
                { upsert: true, new: true }
            );
        } catch (err) {
            console.error(`Failed to migrate event ${row.id}:`, err);
        }
    }
    console.log(`✓ Migrated ${rows.length} events`);
}

async function migrateEventRegistrations() {
    console.log('Migrating event registrations...');
    try {
        const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM event_registrations');
        for (const row of rows) {
            try {
                await EventRegistration.findOneAndUpdate(
                    { sqlId: row.id },
                    {
                        sqlId: row.id,
                        event_sql_id: row.event_id,
                        student_uid: row.student_uid,
                        registered_at: row.registered_at || row.created_at || new Date(),
                    },
                    { upsert: true, new: true }
                );
            } catch (err) {
                console.error(`Failed to migrate event registration ${row.id}:`, err);
            }
        }
        console.log(`✓ Migrated ${rows.length} event registrations`);
    } catch (err: any) {
        if (err?.code === 'ER_NO_SUCH_TABLE') {
            console.log('✓ event_registrations table does not exist, skipping');
        } else {
            console.error('Failed to migrate event registrations:', err);
        }
    }
}

async function migrateFootprints() {
    console.log('Migrating footprints...');
    const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM footprints');
    
    for (const row of rows) {
        try {
            await Footprint.create({
                sqlId: row.id,
                user_uid: row.user_uid,
                action: row.action,
                target_type: row.target_type,
                target_id: row.target_id,
                meta: typeof row.meta === 'string' ? JSON.parse(row.meta || '{}') : row.meta,
                ts: row.ts || new Date(),
            });
        } catch (err: any) {
            if (err.code !== 11000) {
                console.error(`Failed to migrate footprint ${row.id}:`, err);
            }
        }
    }
    console.log(`✓ Migrated ${rows.length} footprints`);
}

async function migrateMessages() {
    console.log('Migrating messages...');
    const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM messages');
    
    for (const row of rows) {
        try {
            await Message.create({
                sqlId: row.id,
                chat_id: row.chat_id,
                sender_uid: row.sender_uid,
                text: row.text,
                ts: row.ts || new Date(),
            });
        } catch (err: any) {
            if (err.code !== 11000) {
                console.error(`Failed to migrate message ${row.id}:`, err);
            }
        }
    }
    console.log(`✓ Migrated ${rows.length} messages`);
}

async function migrateNews() {
    console.log('Migrating news...');
    const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM news');
    
    for (const row of rows) {
        try {
            await News.findOneAndUpdate(
                { sqlId: row.id },
                {
                    sqlId: row.id,
                    title: row.title,
                    content: row.content,
                    author_id: row.author_id,
                    target_audience: row.target_audience || 'all',
                    status: row.status || 'published',
                    image_data: row.image_data,
                    image_mime: row.image_mime,
                    audience: row.audience,
                    created_at: row.created_at || new Date(),
                },
                { upsert: true, new: true }
            );
        } catch (err) {
            console.error(`Failed to migrate news ${row.id}:`, err);
        }
    }
    console.log(`✓ Migrated ${rows.length} news`);
}

async function migrateSupportRequests() {
    console.log('Migrating support requests...');
    const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM support_requests');
    
    for (const row of rows) {
        try {
            await SupportRequest.findOneAndUpdate(
                { sqlId: row.id },
                {
                    sqlId: row.id,
                    student_uid: row.student_uid,
                    amount_requested: Number(row.amount_requested || 0),
                    reason: row.reason,
                    attachments: typeof row.attachments === 'string' ? JSON.parse(row.attachments || '[]') : (row.attachments || []),
                    status: row.status || 'pending',
                    requested_fields: typeof row.requested_fields === 'string' ? JSON.parse(row.requested_fields || '{}') : row.requested_fields,
                    rejection_reason: row.rejection_reason,
                    created_at: row.created_at || new Date(),
                },
                { upsert: true, new: true }
            );
        } catch (err) {
            console.error(`Failed to migrate support request ${row.id}:`, err);
        }
    }
    console.log(`✓ Migrated ${rows.length} support requests`);
}

async function runMigration() {
    try {
        console.log('Starting MySQL → MongoDB migration...\n');
        
        const ok = await connectMongoDB();
        // Ensure the default mongoose connection is actually ready
        if (!ok || mongooseDefault.connection.readyState !== 1) {
            console.error('MongoDB is not connected. Please verify MONGODB_URI and network access.');
            process.exit(1);
        }
        console.log('MongoDB connection verified\n');
        
        await migrateUsers();
        await migrateLoans();
        await migratePayments();
        await migrateNotifications();
        await migrateDisbursements();
        await migrateApplications();
        await migrateChats();
        await migrateEvents();
        await migrateFootprints();
        await migrateMessages();
        await migrateNews();
        await migrateSupportRequests();
        await migrateEventRegistrations();
        
        console.log('\n✅ Migration completed successfully!');
        console.log('You can now enable MongoDB reads by setting USE_MONGODB=true in .env');
        
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

runMigration();
