// server/src/api/AutoTax/autoTax.controller.ts

import { Response } from 'express';
import { AuthedRequest } from '../auth/auth';
import {
  getAutoTaxSummaryForUser,
  markReminderPaidForUser,
} from './autoTax.service';

export const getAutoTaxSummary = async (
  req: AuthedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const summary = await getAutoTaxSummaryForUser(req.user.id);
    res.json(summary);
  } catch (err: any) {
    if (err?.message === 'Invalid user id') {
      res.status(400).json({ error: err.message });
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[autoTax.summary] error', err);
    res.status(500).json({ error: 'Failed to compute automatic tax summary' });
  }
};

export const markReminderPaid = async (
  req: AuthedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    const result = await markReminderPaidForUser(req.user.id, id);
    res.json(result);
  } catch (err: any) {
    if (err?.message === 'Invalid user id' || err?.message === 'Invalid reminder id') {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err?.code === 'NOT_FOUND') {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[autoTax.markPaid] error', err);
    res.status(500).json({ error: 'Failed to mark reminder as paid' });
  }
};
