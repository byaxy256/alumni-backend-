# Deploy Alumni Circle Backend to Render

## Prerequisites
- GitHub repository with your backend code
- MongoDB Atlas cluster (already configured)
- Render account (free tier works)

## Step-by-Step Deployment

### 1. Push Your Code to GitHub
```bash
git add .
git commit -m "Prepare backend for Render deployment"
git push origin main
```

### 2. Create New Web Service on Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Select the **alumni-server** folder (or root if backend is in root)

### 3. Configure Build Settings

**Basic Settings:**
- **Name:** `alumni-circle-backend` (or your preferred name)
- **Region:** Choose closest to your users
- **Branch:** `main`
- **Root Directory:** `alumni backend/alumni-server` (adjust to your structure)
- **Runtime:** `Node`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`

### 4. Set Environment Variables

In Render dashboard, add these environment variables:

**Required:**
```
NODE_ENV=production
MONGO_URI=mongodb+srv://Alumni_admin:MoJo256@alumni-cluster.crytcoj.mongodb.net/?appName=alumni-cluster
JWT_SECRET=ucu_alumni_secret_2025
BASE_URL=https://your-app-name.onrender.com
```

**Optional (if using MTN payments):**
```
MTN_COLLECTION_PRIMARY_KEY=f32285886f5d4105bde4fdcec39511d5
MTN_API_USER=9c3d8666-f783-4f28-a2bd-29e1e51e4d3c
MTN_API_KEY=72e0bccc0f20425d9a85514c1c3c02d0
```

**For file uploads:**
```
UPLOAD_DIR=uploads
```

### 5. Configure MongoDB Atlas

1. Go to your MongoDB Atlas dashboard
2. Navigate to **Network Access**
3. Click **"Add IP Address"**
4. Select **"Allow Access from Anywhere"** (0.0.0.0/0)
   - Or add Render's specific IP ranges if you prefer tighter security

### 6. Deploy

1. Click **"Create Web Service"**
2. Render will automatically:
   - Clone your repository
   - Install dependencies
   - Build TypeScript
   - Start your server
3. Wait for deployment to complete (~5-10 minutes)

### 7. Verify Deployment

Once deployed, you'll get a URL like: `https://alumni-circle-backend.onrender.com`

Test endpoints:
```bash
# Health check
curl https://your-app-name.onrender.com/

# Test auth endpoint
curl https://your-app-name.onrender.com/api/auth/test
```

### 8. Update Frontend Configuration

Update your frontend's API base URL to point to Render:
```javascript
const API_BASE_URL = 'https://your-app-name.onrender.com';
```

## Important Notes

### Free Tier Limitations
- Service spins down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds
- 750 hours/month free (enough for 1 service)

### Upgrade to Keep Always On
- Paid plans start at $7/month
- Keeps service running 24/7
- Faster cold starts

### Monitoring
- Check logs in Render dashboard
- View deployment history
- Set up alerts for failures

## Troubleshooting

### Build Fails
- Check build logs in Render dashboard
- Verify `package.json` scripts are correct
- Ensure all dependencies are listed

### MongoDB Connection Issues
- Verify MONGO_URI is correct in environment variables
- Check MongoDB Atlas IP whitelist includes 0.0.0.0/0
- Confirm cluster is active and not paused

### Server Won't Start
- Check start command: `npm start`
- Verify PORT binding (server binds to 0.0.0.0)
- Review application logs for errors

## Current Working Routes
✅ `/api/auth` - Authentication
✅ `/api/loans` - Loan management
✅ `/api/notifications` - Notifications
✅ `/api/upload` - File uploads

## Routes To Be Converted (Currently Disabled)
⏳ `/api/support` - Support requests
⏳ `/api/applications` - Applications
⏳ `/api/chat` - Chat
⏳ `/api/disburse` - Disbursements
⏳ `/api/payments` - Payments
⏳ `/api/content` - Content management
⏳ `/api/mentors` - Mentorship

## Support
For issues, check:
1. Render dashboard logs
2. MongoDB Atlas metrics
3. Application error logs
