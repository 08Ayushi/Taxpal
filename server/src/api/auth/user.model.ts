// server/src/api/auth/user.model.ts
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    password: { type: String, required: true, minlength: 6 },

    // Only 4 supported countries (codes).
    country: {
      type: String,
      enum: ['US', 'CA', 'IN', 'AU'],
      default: 'US',
    },

    // Currency derived from country:
    // - 'INR' if IN
    // - 'USD' if US/CA/AU
    currency: {
      type: String,
      enum: ['INR', 'USD'],
      default: 'USD',
    },

    income_bracket: {
      type: String,
      enum: ['low', 'middle', 'high'],
      default: 'middle',
    },

    resetPasswordToken: { type: String, default: undefined },
    resetPasswordExpires: { type: Date, default: undefined },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });

export default mongoose.model('User', userSchema);
