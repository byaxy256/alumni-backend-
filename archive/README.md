# Archive - MySQL Legacy Files

This folder contains old MySQL-related files that are no longer used in production.

## Why these files are archived

The application has fully migrated from MySQL to MongoDB. All active routes now use the MongoDB versions (suffixed with `-mongo.ts`).

## Contents

### Migration Scripts
- `migrate-to-mongodb.ts` - Original one-time migration script from MySQL to MongoDB
- `update-missing-data.ts` - Script to update missing loan amounts and user data from MySQL

### Old MySQL Routes (Replaced by MongoDB versions)
- `applications.ts` → now using `applications-mongo.ts`
- `support.ts` → now using `support-mongo.ts`
- `payments.ts` → now using `payments-mongo.ts`

### Database Connection
- `db.js` - MySQL connection pool (no longer needed)

### Check Scripts
- `check_db.js` - MySQL database connection checker
- `check_mysql_schema.js` - MySQL schema validator

## Important Notes

⚠️ **Do not delete these files** - They may be needed for:
- Reference when debugging historical data issues
- Understanding the migration process
- Recovering data if needed in the future

The MySQL database credentials are still in `.env` but are not used by the running application.

## Current Production Setup

✅ **Active Database**: MongoDB Atlas  
✅ **Active Routes**: All routes ending in `-mongo.ts`  
✅ **Dependencies**: `mongoose`, `mongodb` (mysql2 removed)
