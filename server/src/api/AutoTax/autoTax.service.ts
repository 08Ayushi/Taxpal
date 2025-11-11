// server/src/api/AutoTax/autoTax.service.ts

import mongoose, { Types } from 'mongoose';
import Transaction from '../transaction/Transaction.model';
import TaxPaymentReminder, {
  TaxPaymentReminderDoc,
} from './TaxPaymentReminder.model';

const TAX_FREE_THRESHOLD = 1200000; // ₹12,00,000

type SlabConfig = { from: number; to?: number; rate: number };

const SLABS: SlabConfig[] = [
  { from: 0, to: 250000, rate: 0 }, // 0% up to 2.5L
  { from: 250000, to: 500000, rate: 0.05 }, // 5%
  { from: 500000, to: 750000, rate: 0.1 }, // 10%
  { from: 750000, to: 1000000, rate: 0.15 }, // 15%
  { from: 1000000, to: 1250000, rate: 0.2 }, // 20%
  { from: 1250000, to: 1500000, rate: 0.25 }, // 25%
  { from: 1500000, rate: 0.3 }, // 30% above 15L
];

/* ========= Shared interfaces (mirror frontend) ========= */

export interface TaxSlabLine {
  from: number;
  to: number | null;
  rate: number; // 0.05 => 5%
  taxablePortion: number;
  tax: number;
}

export interface TaxScheduleItem {
  id: string;
  label: string;
  period: string;
  dueDate: Date;
  amount: number;
}

export interface AutoTaxSummary {
  totalIncome: number;
  totalExpenses: number;
  taxableIncome: number;
  taxPayable: number;
  noTax: boolean;
  noTaxMessage?: string;
  slabs: TaxSlabLine[];
  schedule: TaxScheduleItem[];
  financialYear: string;
}

/* ========= Internal helpers ========= */

function toObjectId(id: string): Types.ObjectId | null {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

function getFinancialYearRange(now = new Date()) {
  const m = now.getMonth(); // 0-based
  const y = now.getFullYear();

  // FY: 1 Apr -> 31 Mar
  if (m < 3) {
    // Jan–Mar: current FY started last year
    const startYear = y - 1;
    const endYear = y;
    return {
      start: new Date(startYear, 3, 1, 0, 0, 0, 0),
      end: new Date(endYear, 2, 31, 23, 59, 59, 999),
      fyLabel: `FY ${startYear}-${String(endYear).slice(-2)}`,
      fyStartYear: startYear,
    };
  }

  const startYear = y;
  const endYear = y + 1;
  return {
    start: new Date(startYear, 3, 1, 0, 0, 0, 0),
    end: new Date(endYear, 2, 31, 23, 59, 59, 999),
    fyLabel: `FY ${startYear}-${String(endYear).slice(-2)}`,
    fyStartYear: startYear,
  };
}

function computeTaxBreakdown(taxableIncome: number): {
  totalTax: number;
  slabs: TaxSlabLine[];
} {
  let totalTax = 0;
  const slabs: TaxSlabLine[] = [];

  for (const slab of SLABS) {
    const lower = slab.from;
    const upper = slab.to ?? taxableIncome;

    if (taxableIncome <= lower) break;

    const taxablePortion = Math.min(taxableIncome, upper) - lower;
    if (taxablePortion <= 0) continue;

    const tax = taxablePortion * slab.rate;
    totalTax += tax;

    if (slab.rate > 0) {
      slabs.push({
        from: lower + 1, // e.g. 2,50,001
        to: slab.to ?? null, // null => "Above"
        rate: slab.rate,
        taxablePortion,
        tax: Math.round(tax),
      });
    }

    if (!slab.to) break;
  }

  return {
    totalTax: Math.round(totalTax),
    slabs,
  };
}

/**
 * Ensure quarterly reminders exist for the given FY and tax amount.
 * Returns only unpaid reminders.
 */
async function ensureQuarterReminders(
  userId: Types.ObjectId,
  fyLabel: string,
  fyStartYear: number,
  taxPayable: number
): Promise<TaxPaymentReminderDoc[]> {
  if (taxPayable <= 0) {
    await TaxPaymentReminder.deleteMany({ userId, financialYear: fyLabel });
    return [];
  }

  let reminders = await TaxPaymentReminder.find({
    userId,
    financialYear: fyLabel,
  })
    .sort({ dueDate: 1 })
    .exec();

  if (!reminders.length) {
    const base = Math.round(taxPayable / 4);
    const q1 = base;
    const q2 = base;
    const q3 = base;
    const q4 = taxPayable - (q1 + q2 + q3); // adjust last quarter

    const defs = [
      {
        quarter: 'Q1',
        label: `Q1 ${fyStartYear}`,
        period: `Apr - Jun ${fyStartYear}`,
        dueDate: new Date(fyStartYear, 6, 15), // 15 Jul
        amount: q1,
      },
      {
        quarter: 'Q2',
        label: `Q2 ${fyStartYear}`,
        period: `Jul - Sep ${fyStartYear}`,
        dueDate: new Date(fyStartYear, 8, 15), // 15 Sep
        amount: q2,
      },
      {
        quarter: 'Q3',
        label: `Q3 ${fyStartYear}`,
        period: `Oct - Dec ${fyStartYear}`,
        dueDate: new Date(fyStartYear + 1, 0, 15), // 15 Jan next year
        amount: q3,
      },
      {
        quarter: 'Q4',
        label: `Q4 ${fyStartYear}`,
        period: `Jan - Mar ${fyStartYear + 1}`,
        dueDate: new Date(fyStartYear + 1, 2, 15), // 15 Mar next year
        amount: q4,
      },
    ];

    reminders = await TaxPaymentReminder.insertMany(
      defs.map((d) => ({
        userId,
        financialYear: fyLabel,
        quarter: d.quarter,
        label: d.label,
        period: d.period,
        dueDate: d.dueDate,
        amount: d.amount,
        isPaid: false,
      }))
    );
  }

  return reminders.filter((r) => !r.isPaid);
}

/* ========= Public service API (used by controller) ========= */

/**
 * Build automatic tax summary for a given authenticated user id.
 * This is what your controller calls.
 */
export async function getAutoTaxSummaryForUser(
  rawUserId: string
): Promise<AutoTaxSummary> {
  const userId = toObjectId(rawUserId);
  if (!userId) {
    throw new Error('Invalid user id');
  }

  const { start, end, fyLabel, fyStartYear } = getFinancialYearRange();

  // Aggregate total income & expenses for current FY
  const totals = await Transaction.aggregate([
    {
      $match: {
        userId,
        date: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: '$type',
        total: { $sum: '$amount' },
      },
    },
  ]);

  let totalIncome = 0;
  let totalExpenses = 0;
  for (const t of totals) {
    if (t._id === 'income') totalIncome = t.total;
    if (t._id === 'expense') totalExpenses = t.total;
  }

  const taxableIncome = Math.max(totalIncome - totalExpenses, 0);

  let taxPayable = 0;
  let slabs: TaxSlabLine[] = [];
  let noTax = false;
  let noTaxMessage: string | undefined;

  if (taxableIncome < TAX_FREE_THRESHOLD) {
    noTax = true;
    taxPayable = 0;
    noTaxMessage = `No Tax Payable — Your taxable income of ₹${taxableIncome.toLocaleString(
      'en-IN'
    )} is below the threshold of ₹12,00,000. No tax is due.`;

    // Clear any old reminders for this FY
    await TaxPaymentReminder.deleteMany({ userId, financialYear: fyLabel });
  } else {
    const result = computeTaxBreakdown(taxableIncome);
    taxPayable = result.totalTax;
    slabs = result.slabs;
  }

  let schedule: TaxScheduleItem[] = [];

  if (!noTax && taxPayable > 0) {
    const reminders = await ensureQuarterReminders(
      userId,
      fyLabel,
      fyStartYear,
      taxPayable
    );

    schedule = reminders.map((r) => ({
      id: r._id.toString(),
      label: r.label,
      period: r.period,
      dueDate: r.dueDate,
      amount: r.amount,
    }));
  }

  return {
    totalIncome,
    totalExpenses,
    taxableIncome,
    taxPayable,
    noTax,
    noTaxMessage,
    slabs,
    schedule,
    financialYear: fyLabel,
  };
}

/**
 * Mark a given reminder as paid for a specific user.
 * Controller can call this directly.
 */
export async function markReminderPaidForUser(
  rawUserId: string,
  reminderId: string
): Promise<{ message: string; id: string }> {
  const userId = toObjectId(rawUserId);
  if (!userId) {
    throw new Error('Invalid user id');
  }

  if (!mongoose.Types.ObjectId.isValid(reminderId)) {
    throw new Error('Invalid reminder id');
  }

  const reminder = await TaxPaymentReminder.findOneAndUpdate(
    { _id: reminderId, userId },
    { isPaid: true },
    { new: true }
  ).lean();

  if (!reminder) {
    const err: any = new Error('Reminder not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  return { message: 'Marked as paid', id: reminderId };
}
