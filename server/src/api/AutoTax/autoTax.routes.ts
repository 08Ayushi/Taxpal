import { Router } from 'express';
import { authenticateToken } from '../auth/auth';
import { getAutoTaxSummary, markReminderPaid } from './autoTax.controller';

export const autoTaxRouter = Router();

// Protect all auto-tax routes
autoTaxRouter.use(authenticateToken);

// GET /api/v1/tax/auto/summary
autoTaxRouter.get('/summary', getAutoTaxSummary);

// PATCH /api/v1/tax/auto/reminders/:id/mark-paid
autoTaxRouter.patch('/reminders/:id/mark-paid', markReminderPaid);
