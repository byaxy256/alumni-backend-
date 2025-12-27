# Quick Start: MongoDB Atlas Setup

## Get Your Connection String

### Step 1: Create MongoDB Atlas Account
1. Go to https://www.mongodb.com/cloud/atlas/register
2. Sign up (free tier available)
3. Create an organization and project

### Step 2: Create Cluster
1. Click "Build a Database"
2. Choose FREE tier (M0 Sandbox)
3. Select cloud provider & region (closest to you)
4. Cluster Name: `alumni-cluster` (or your choice)
5. Click "Create"

### Step 3: Create Database User
1. Security → Database Access → Add New Database User
2. Authentication: Username & Password
3. Username: `alumni_admin`
4. Password: Generate secure password (save it!)
5. Database User Privileges: "Read and write to any database"
6. Add User

### Step 4: Whitelist Your IP
1. Security → Network Access → Add IP Address
2. Options:
   - Add Current IP Address (for local dev)
   - OR Allow Access from Anywhere: `0.0.0.0/0` (less secure, testing only)
3. Confirm

### Step 5: Get Connection String
1. Database → Connect → Drivers
2. Driver: Node.js, Version: 6.7 or later
3. Copy connection string:
   ```
   mongodb+srv://alumni_admin:<password>@alumni-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
4. Replace `<password>` with your actual password
5. Add database name: `alumni_aid` after `.net/`:
   ```
   mongodb+srv://alumni_admin:yourpassword@alumni-cluster.xxxxx.mongodb.net/alumni_aid?retryWrites=true&w=majority
   ```

### Step 6: Update .env
Add to your `.env` file (create if doesn't exist):
```bash
MONGODB_URI=mongodb+srv://alumni_admin:yourpassword@alumni-cluster.xxxxx.mongodb.net/alumni_aid?retryWrites=true&w=majority
USE_MONGODB=false
```

### Step 7: Test Connection
```bash
cd alumni-server
npm run dev
```

Check logs for: `MongoDB connected successfully`

### Step 8: Run Migration
```bash
npm run migrate
```

This copies all MySQL data to MongoDB.

### Step 9: Verify
1. Go to MongoDB Atlas → Database → Browse Collections
2. You should see collections: users, loans, payments, notifications, disbursements
3. Check data looks correct

### Step 10: Enable MongoDB Reads (Optional)
Once confident:
```bash
# In .env
USE_MONGODB=true
```

Restart server. It will now read from MongoDB, write to both.

---

## Troubleshooting

**"MongoServerError: bad auth"**
- Check username/password in connection string
- Ensure database user has correct permissions

**"MongooseServerSelectionError"**
- Check IP whitelist in Network Access
- Verify connection string format

**"Migration fails"**
- Ensure MySQL is running and accessible
- Check MySQL credentials in .env
- Verify tables exist

**Connection keeps failing**
- Try `0.0.0.0/0` in Network Access temporarily
- Check firewall/VPN isn't blocking MongoDB ports

---

## Next Steps

1. Get Atlas connection string (Steps 1-5)
2. Add to `.env`
3. Run `npm run dev` (test connection)
4. Run `npm run migrate` (copy data)
5. Verify in Atlas dashboard
6. Keep `USE_MONGODB=false` until fully tested
7. Test all app features
8. Set `USE_MONGODB=true` when ready
