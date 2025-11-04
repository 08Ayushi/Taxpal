// server/src/api/auth/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { Types } from 'mongoose';
import User from './user.model';

export interface AuthedRequest extends Request {
  user?: {
    id: string;
    userId: string;
    _id?: Types.ObjectId | string;
    name?: string;
    email?: string;
    country?: string;
    income_bracket?: 'low' | 'middle' | 'high';
  } & Record<string, any>;
}

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

function extractToken(req: Request): string | null {
  const header = (req.headers['authorization'] || req.headers['Authorization']) as string | undefined;
  if (header && /^Bearer\s+/i.test(header)) return header.split(' ')[1];
  const cookie = (req as any).cookies?.token;
  if (cookie) return cookie;
  return null;
}

function getUserIdFromPayload(payload: JwtPayload | string): string | null {
  if (typeof payload === 'string') return null;
  return (
    (payload.userId as string) ||
    (payload.id as string) ||
    (payload.sub as string) ||
    null
  );
}

/** Robustly convert a Mongo ObjectId-ish value to a string id */
function toIdString(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  // Mongoose ObjectId and many id-like types implement toString()
  try {
    const s = value.toString?.();
    if (typeof s === 'string' && s.length) return s;
  } catch {}
  return String(value);
}

export const authenticateToken = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ message: 'Access token required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const uid = getUserIdFromPayload(decoded);
    if (!uid) {
      res.status(401).json({ message: 'Invalid token payload' });
      return;
    }

    // Fetch as hydrated document (NO .lean()) so _id is well-typed and present
    const doc = await (User as any).findById(uid).select('-password');
    if (!doc) {
      res.status(401).json({ message: 'Invalid token' });
      return;
    }

    // Convert to a plain object if available
    const plain = typeof doc.toObject === 'function' ? doc.toObject() : (doc as any);

    // Normalize id string from various possible shapes
    const idStr =
      toIdString((plain as any)._id) ??
      toIdString((plain as any).id) ??
      toIdString((doc as any)._id) ??
      toIdString((doc as any).id);

    if (!idStr) {
      res.status(401).json({ message: 'Invalid token (no user id)' });
      return;
    }

    req.user = { ...plain, id: idStr, userId: idStr };
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = (req.headers['authorization'] || req.headers['Authorization']) as string | undefined;
  const token = header?.startsWith('Bearer ') ? header.split(' ')[1] : undefined;
  if (!token) {
    res.status(401).json({ message: 'No token' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const uid = getUserIdFromPayload(decoded);
    if (!uid) {
      res.status(401).json({ message: 'Invalid token payload' });
      return;
    }

    // Minimal normalized identity; your routes can fully load the user if needed
    req.user = { id: String(uid), userId: String(uid) };
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}
