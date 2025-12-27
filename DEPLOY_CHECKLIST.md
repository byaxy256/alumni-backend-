# Quick Render Deployment Checklist

## ✅ Pre-Deployment Checklist

- [x] MongoDB-only backend (MySQL removed)
- [x] Server binds to `0.0.0.0` in production
- [x] PORT parsed as number for Render
- [x] Supports both `MONGO_URI` and `MONGODB_URI` env vars
- [x] Build command configured: `npm install && npm run build`
- [x] Start command configured: `npm start`
- [x] TypeScript compilation working
- [x] Local development tested

## 🚀 Render Configuration

### Environment Variables (Required)
```
NODE_ENV=production
MONGO_URI=mongodb+srv://Alumni_admin:MoJo256@alumni-cluster.crytcoj.mongodb.net/?appName=alumni-cluster
JWT_SECRET=ucu_alumni_secret_2025
BASE_URL=https://your-app.onrender.com
UPLOAD_DIR=uploads
FRONTEND_URL=https://your-app.vercel.app
```

### Service Settings
- **Runtime:** Node
- **Build:** `npm install && npm run build`
- **Start:** `npm start`
- **Root Directory:** (adjust based on your repo structure)

## 🔧 MongoDB Atlas Setup

1. Go to Network Access
2. Add IP: `0.0.0.0/0` (Allow all)
3. Save changes

## 📝 After Deployment

1. Copy your Render URL: `https://your-app.onrender.com`
2. Update `BASE_URL` environment variable with this URL
3. Test endpoints:
   - `GET /` - Should return "UCU Alumni Circle Server Running - MongoDB Only"
   - `GET /api/auth/test` - Should work
4. Update frontend API configuration to use new URL

## ⚡ Important Notes

- Free tier spins down after 15 min inactivity
- First request after spin-down: ~30 seconds
- Working routes: auth, loans, notifications, upload
- Disabled routes will need MongoDB conversion later

## 🐛 Quick Debug

**Build fails?**
- Check Render logs
- Verify package.json scripts

**Can't connect to MongoDB?**
- Check MONGO_URI format
- Verify Atlas IP whitelist
- Confirm cluster is running

**Server starts but crashes?**
- Check application logs in Render
- Verify all environment variables set
- Test locally with `NODE_ENV=production npm start`
