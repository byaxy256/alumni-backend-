# MongoDB Migration Guide

## Environment Variables

Add these to your `.env` file:

```bash
# MongoDB Atlas connection string
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/alumni_aid?retryWrites=true&w=majority

# Feature flag: enable MongoDB reads (set to 'true' after migration)
USE_MONGODB=false

# IMPORTANT: Target Atlas instead of local Mongo for migration
USE_LOCAL_MONGO=false
```

## Migration Steps

### 1. Set up MongoDB Atlas
1. Create account at https://www.mongodb.com/cloud/atlas
2. Create a new cluster (free tier is fine for testing)
3. Create database user with read/write permissions
4. Add your IP to Network Access whitelist
5. Get connection string and add to `.env` as `MONGODB_URI`

### 2. Run Initial Migration
```bash
cd alumni-server
npm run migrate
```

This will:
- Copy all users, loans, payments, notifications, and disbursements from MySQL to MongoDB
- Preserve original SQL IDs as `sqlId` fields
- Create appropriate indexes

Notes:
- Ensure `MONGODB_URI` includes the intended database name (e.g. `/alumni_aid`).
- Set `USE_LOCAL_MONGO=false` so migration writes to Atlas, not your local Mongo.
- Provide MySQL source environment variables for the migration: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_DATABASE`.

### 3. Verify Migration
Check MongoDB Atlas Data Explorer to confirm data was migrated.

### 4. Enable Dual-Write (Automatic)
The server now writes to both MySQL and MongoDB automatically.
- MySQL remains the primary read source
- MongoDB receives all new writes

### 5. Test MongoDB Reads
Set `USE_MONGODB=true` in `.env` and restart server.
- Routes will read from MongoDB
- Falls back to MySQL if MongoDB fails

### 6. Monitor
- Check server logs for MongoDB connection status
- Verify data consistency between MySQL and MongoDB
- Test all critical flows (auth, payments, loans)

### 7. Full Cutover (Future)
Once confident:
1. Set `USE_MONGODB=true` permanently
2. Remove MySQL schema guards from code
3. Eventually deprecate MySQL dependency

## Rollback Plan
If issues occur:
1. Set `USE_MONGODB=false` in `.env`
2. Restart server - will use MySQL only
3. Debug MongoDB issues
4. Re-run migration if needed

## Current Status
- ✅ MongoDB schemas created
- ✅ Migration script ready
- ✅ Dual-write enabled
- ⏳ Awaiting MongoDB Atlas connection string
- ⏳ Awaiting migration run
- ⏳ Read flag still disabled (USE_MONGODB=false)
