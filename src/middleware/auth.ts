// src/middleware/auth.ts
import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

console.log('=== AUTH MIDDLEWARE INIT ===');
console.log('JWT_SECRET env var exists:', !!process.env.JWT_SECRET);
console.log('JWT_SECRET value:', process.env.JWT_SECRET ? `${process.env.JWT_SECRET.substring(0, 10)}...` : 'UNDEFINED - USING FALLBACK');
console.log('================================');

export const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        console.error('AUTH MIDDLEWARE - No token provided');
        return res.sendStatus(401);
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error('AUTH MIDDLEWARE - JWT verification failed:', err.message);
            console.error('AUTH MIDDLEWARE - Error type:', err.name);
            console.error('Using secret (first 10 chars):', JWT_SECRET === process.env.JWT_SECRET ? `ENV: ${process.env.JWT_SECRET?.substring(0, 10)}...` : `FALLBACK`);
            return res.sendStatus(403);
        }
        
        console.log('AUTH MIDDLEWARE - Token verified successfully');
        console.log('AUTH MIDDLEWARE - Decoded user:', JSON.stringify(user, null, 2));
        
        (req as any).user = user;
        next();
    });
};

export const authorize = (roles: string[]) => {
    return (req, res, next) => {
        const userRole = (req as any).user.role;
        if (!roles.includes(userRole)) {
            return res.status(403).json({ error: 'Forbidden: Insufficient permissions.' });
        }
        next();
    };
};