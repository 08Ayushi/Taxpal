import { Router } from 'express';
import { authenticateToken } from '../auth/auth';
import { getAutoTaxSummary, markReminderPaid } from './autoTax.controller';

const r = Router();

r.use(authenticateToken);

r.get('/summary', getAutoTaxSummary);
r.patch('/reminders/:id/mark-paid', markReminderPaid);

export default r;
