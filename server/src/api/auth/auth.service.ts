// server/src/api/auth/auth.service.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from './user.model';

export type CurrencyCode = 'INR' | 'USD';
type AllowedCountry = 'US' | 'CA' | 'IN' | 'AU';

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  country?: AllowedCountry;
  income_bracket?: 'low' | 'middle' | 'high';
  currency: CurrencyCode;
};

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const RESET_WINDOW_MS = 30 * 60 * 1000;

// Normalize to our 4 allowed country codes.
function normalizeCountry(country?: string): AllowedCountry {
  if (!country) return 'US';

  const c = country.trim().toLowerCase();

  if (c === 'in' || c === 'india' || c === 'bharat') return 'IN';
  if (c === 'ca' || c === 'canada') return 'CA';
  if (c === 'au' || c === 'aus' || c === 'australia') return 'AU';
  if (
    c === 'us' ||
    c === 'usa' ||
    c === 'united states' ||
    c === 'united states of america'
  ) {
    return 'US';
  }

  // Fallback: keep within allowed set
  return 'US';
}

function deriveCurrency(country?: string): CurrencyCode {
  const norm = normalizeCountry(country);
  return norm === 'IN' ? 'INR' : 'USD';
}

function toPublic(u: any): PublicUser {
  const country = normalizeCountry(u.country);
  const currency = deriveCurrency(country);

  return {
    id: String(u._id ?? u.id),
    name: u.name,
    email: u.email,
    country,
    income_bracket: u.income_bracket,
    currency,
  };
}

function sign(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}
async function comparePassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export const authService = {
  async register(input: {
    name: string;
    email: string;
    password: string;
    country?: string; // expects one of US/CA/IN/AU from frontend
    income_bracket?: 'low' | 'middle' | 'high';
  }): Promise<{ token: string; user: PublicUser }> {
    const { name, email, password, country, income_bracket } = input;

    const existing = await User.findOne({ email });
    if (existing) throw new Error('USER_EXISTS');

    const hashed = await hashPassword(password);

    const normalizedCountry = normalizeCountry(country);
    const currency = deriveCurrency(normalizedCountry);

    const user = await User.create({
      name,
      email,
      password: hashed,
      country: normalizedCountry,
      income_bracket: income_bracket || 'middle',
      currency,
    });

    const token = sign(user._id.toString());
    return { token, user: toPublic(user) };
  },

  async login(
    email: string,
    password: string
  ): Promise<{ token: string; user: PublicUser } | null> {
    const user = await User.findOne({ email });
    if (!user) return null;

    const ok = await comparePassword(password, user.password);
    if (!ok) return null;

    const token = sign(user._id.toString());

    // Ensure country+currency are normalized for ALL users.
    const normalizedCountry = normalizeCountry(user.country);
    const expectedCurrency = deriveCurrency(normalizedCountry);

    if (
      user.country !== normalizedCountry ||
      user.currency !== expectedCurrency
    ) {
      user.country = normalizedCountry;
      user.currency = expectedCurrency;
      await user.save();
    }

    return { token, user: toPublic(user) };
  },

  async issueResetToken(
    email: string
  ): Promise<{ user: PublicUser; resetToken: string } | null> {
    const user = await User.findOne({ email });
    if (!user) return null;

    const resetToken = crypto.randomBytes(32).toString('hex');
    (user as any).resetPasswordToken = resetToken;
    (user as any).resetPasswordExpires = new Date(
      Date.now() + RESET_WINDOW_MS
    );
    await user.save();

    return { user: toPublic(user), resetToken };
  },

  async resetPassword(
    resetToken: string,
    newPassword: string
  ): Promise<{ token: string; user: PublicUser } | null> {
    const user = await User.findOne({
      resetPasswordToken: resetToken,
      resetPasswordExpires: { $gt: new Date() },
    } as any);

    if (!user) return null;

    (user as any).password = await hashPassword(newPassword);
    (user as any).resetPasswordToken = undefined;
    (user as any).resetPasswordExpires = undefined;
    await user.save();

    const token = sign(user._id.toString());
    return { token, user: toPublic(user) };
  },

  async getPublicById(id: string): Promise<PublicUser | null> {
    const user = await User.findById(id).select('-password').lean();
    if (!user) return null;
    return toPublic(user);
  },

  async updateProfile(
    id: string,
    input: Partial<{
      name: string;
      email: string;
      country: string;
      income_bracket: 'low' | 'middle' | 'high';
    }>
  ): Promise<PublicUser> {
    const payload: any = {};

    if (typeof input.name === 'string' && input.name.trim()) {
      payload.name = input.name.trim();
    }

    if (typeof input.country === 'string') {
      const normalized = normalizeCountry(input.country);
      payload.country = normalized;
      payload.currency = deriveCurrency(normalized);
    }

    if (input.income_bracket) {
      const ok = ['low', 'middle', 'high'].includes(input.income_bracket);
      if (!ok) throw new Error('Invalid income_bracket');
      payload.income_bracket = input.income_bracket;
    }

    if (typeof input.email === 'string' && input.email.trim()) {
      const email = input.email.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email))
        throw new Error('Invalid email format');

      const exists = await User.findOne({ email, _id: { $ne: id } }).lean();
      if (exists) throw new Error('Email already in use');
      payload.email = email;
    }

    const updated = await User.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
      context: 'query',
    }).lean();

    if (!updated) throw new Error('User not found');

    return toPublic(updated);
  },
};
