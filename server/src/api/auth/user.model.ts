import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  country?: string;
  income_bracket?: 'low' | 'middle' | 'high';
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },

    country: { type: String, default: 'US' },
    income_bracket: { type: String, enum: ['low', 'middle', 'high'], default: 'middle' },

    resetPasswordToken: { type: String, index: true },
    resetPasswordExpires: { type: Date, index: true }
  },
  { timestamps: true, versionKey: false, strict: true }
);

// IMPORTANT: keep strong typing even when reusing an existing model in watch/reload.
const User: Model<IUser> =
  (mongoose.models.User as Model<IUser>) || mongoose.model<IUser>('User', UserSchema);

export default User;
