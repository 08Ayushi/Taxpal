// server/src/api/AutoTax/autoTax.service.ts

import mongoose, { Types } from 'mongoose';
import Transaction from '../transaction/Transaction.model';
import TaxPaymentReminder, {
  TaxPaymentReminderDoc,
} from './TaxPaymentReminder.model';

const TAX_FREE_THRESHOLD = 1200000; // 12,00,000

type SlabConfig = { from: number; to?: number; rate: number };

const SLABS: SlabConfig[] = [
  { from: 0, to: 250000, rate: 0 },
  { from: 250000, to: 500000, rate: 0.05 },
  { from: 500000, to: 750000, rate: 0.1 },
  { from: 750000, to: 1000000, rate: 0.15 },
  { from: 1000000, to: 1250000, rate: 0.2 },
  { from: 1250000, to: 1500000, rate: 0.25 },
  { from: 1500000, rate: 0.3 },
];

/* ========= Shared interfaces (mirror frontend) ========= */

export interface TaxSlabLine {
  from: number;
  to: number | null;
  rate: number;
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

/* ========= Helpers ========= */

function toObjectId(id: string): Types.ObjectId | null {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

function getFinancialYearRange(now = new Date()) {
  const m = now.getMonth();
  const y = now.getFullYear();

  // FY: 1 Apr – 31 Mar
  if (m < 3) {
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
        from: lower + 1,
        to: slab.to ?? null,
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
 * Ensure reminders reflect the CURRENT tax:
 * - Paid reminders are treated as already-settled tax.
 * - Unpaid reminders are always rebuilt from scratch for the remaining amount.
 * - If tax goes up, new reminders are added for the extra.
 * - If tax goes down or is fully covered, unpaid reminders are removed.
 */
async function ensureQuarterReminders(
  userId: Types.ObjectId,
  fyLabel: string,
  fyStartYear: number,
  taxPayable: number
): Promise<TaxPaymentReminderDoc[]> {
  const existing = await TaxPaymentReminder.find({
    userId,
    financialYear: fyLabel,
  }).exec();

  const paidTotal = existing
    .filter((r) => r.isPaid)
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  // If no tax => clear everything
  if (taxPayable <= 0) {
    if (existing.length) {
      await TaxPaymentReminder.deleteMany({ userId, financialYear: fyLabel });
    }
    return [];
  }

  const remaining = taxPayable - paidTotal;

  // Nothing more to schedule; clean any stale unpaid & exit
  if (remaining <= 0) {
    if (existing.some((r) => !r.isPaid)) {
      await TaxPaymentReminder.deleteMany({
        userId,
        financialYear: fyLabel,
        isPaid: false,
      });
    }
    return [];
  }

  // Always rebuild unpaid reminders from scratch for the remaining amount
  await TaxPaymentReminder.deleteMany({
    userId,
    financialYear: fyLabel,
    isPaid: false,
  });

  // Split remaining across 4 installments; last one adjusted
  const base = Math.floor(remaining / 4);
  const q1 = base;
  const q2 = base;
  const q3 = base;
  const q4 = remaining - (q1 + q2 + q3);

  const suffix = Date.now().toString(); // avoid unique index clashes
  const defs = [
    {
      quarterKey: `Q1-${suffix}`,
      label: `Q1 ${fyStartYear}`,
      period: `Apr - Jun ${fyStartYear}`,
      dueDate: new Date(fyStartYear, 6, 15),
      amount: q1,
    },
    {
      quarterKey: `Q2-${suffix}`,
      label: `Q2 ${fyStartYear}`,
      period: `Jul - Sep ${fyStartYear}`,
      dueDate: new Date(fyStartYear, 8, 15),
      amount: q2,
    },
    {
      quarterKey: `Q3-${suffix}`,
      label: `Q3 ${fyStartYear}`,
      period: `Oct - Dec ${fyStartYear}`,
      dueDate: new Date(fyStartYear + 1, 0, 15),
      amount: q3,
    },
    {
      quarterKey: `Q4-${suffix}`,
      label: `Q4 ${fyStartYear}`,
      period: `Jan - Mar ${fyStartYear + 1}`,
      dueDate: new Date(fyStartYear + 1, 2, 15),
      amount: q4,
    },
  ].filter((d) => d.amount > 0);

  if (!defs.length) {
    return [];
  }

  const newReminders = await TaxPaymentReminder.insertMany(
    defs.map((d) => ({
      userId,
      financialYear: fyLabel,
      quarter: d.quarterKey,
      label: d.label,
      period: d.period,
      dueDate: d.dueDate,
      amount: d.amount,
      isPaid: false,
    }))
  );

  return newReminders;
}

/* ========= Public API ========= */

export async function getAutoTaxSummaryForUser(
  rawUserId: string
): Promise<AutoTaxSummary> {
  const userId = toObjectId(rawUserId);
  if (!userId) throw new Error('Invalid user id');

  const { start, end, fyLabel, fyStartYear } = getFinancialYearRange();

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

    schedule = reminders
      .filter((r) => !r.isPaid)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .map((r) => ({
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

export async function markReminderPaidForUser(
  rawUserId: string,
  reminderId: string
): Promise<{ message: string; id: string }> {
  const userId = toObjectId(rawUserId);
  if (!userId) throw new Error('Invalid user id');

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
