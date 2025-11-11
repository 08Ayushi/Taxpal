import { Schema, model, Types, Document } from 'mongoose';

export interface TaxPaymentReminderDoc extends Document {
  userId: Types.ObjectId;
  financialYear: string;      // e.g. "FY 2025-26"
  quarter: string;            // "Q1" | "Q2" | "Q3" | "Q4"
  label: string;              // e.g. "Q1 2025"
  period: string;             // e.g. "Apr - Jun 2025"
  dueDate: Date;
  amount: number;
  isPaid: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TaxPaymentReminderSchema = new Schema<TaxPaymentReminderDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    financialYear: { type: String, required: true },
    quarter: { type: String, required: true },
    label: { type: String, required: true },
    period: { type: String, required: true },
    dueDate: { type: Date, required: true },
    amount: { type: Number, required: true },
    isPaid: { type: Boolean, default: false },
  },
  { timestamps: true }
);

TaxPaymentReminderSchema.index({ userId: 1, financialYear: 1 });
TaxPaymentReminderSchema.index(
  { userId: 1, financialYear: 1, quarter: 1 },
  { unique: true }
);

const TaxPaymentReminder = model<TaxPaymentReminderDoc>('TaxPaymentReminder', TaxPaymentReminderSchema);
export default TaxPaymentReminder;
