// src/api/FinancialReport/FinancialReport.controller.ts
import { Response } from 'express';
import { AuthedRequest } from '../auth/auth';
import {
  createReport,
  listReports,
  getReport,
  deleteReport,
} from './FinancialReport.service';

export async function generate(req: AuthedRequest, res: Response) {
  try {
    const { reportType, period, format } = req.body || {};
    if (!reportType || !period || !format) {
      return res
        .status(400)
        .json({ success: false, message: 'reportType, period, format are required' });
    }

    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: 'Unauthorized' });
    }

    // ✅ store the logged-in user id as createdBy
    const doc = await createReport(reportType, period, format, req.user.id);
    res.json({ success: true, data: doc });
  } catch (err) {
    console.error('[FinancialReport.generate]', err);
    res.status(500).json({ success: false, message: 'Failed to create report' });
  }
}

export async function list(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: 'Unauthorized' });
    }

    // ✅ only list reports created by this user
    const items = await listReports(req.user.id);
    res.json({ success: true, data: items });
  } catch (err) {
    console.error('[FinancialReport.list]', err);
    res.status(500).json({ success: false, message: 'Failed to list reports' });
  }
}

export async function byId(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: 'Unauthorized' });
    }

    const item = await getReport(req.params.id);
    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: 'Not found' });
    }

    // ✅ report must belong to this user (if createdBy is set)
    if (item.createdBy && item.createdBy.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, message: 'Forbidden' });
    }

    res.json({ success: true, data: item });
  } catch (err) {
    console.error('[FinancialReport.byId]', err);
    res.status(500).json({ success: false, message: 'Failed to fetch report' });
  }
}

export async function remove(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: 'Unauthorized' });
    }

    const item = await getReport(req.params.id);
    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: 'Not found' });
    }

    // ✅ user can only delete their own reports
    if (item.createdBy && item.createdBy.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, message: 'Forbidden' });
    }

    await deleteReport(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[FinancialReport.remove]', err);
    res.status(500).json({ success: false, message: 'Failed to delete report' });
  }
}
