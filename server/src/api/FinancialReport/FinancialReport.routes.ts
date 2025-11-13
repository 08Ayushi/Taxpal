// src/api/FinancialReport/FinancialReport.routes.ts
import { Router } from 'express';
import * as ctrl from './FinancialReport.controller';
import { authenticateToken } from '../auth/auth';

const router = Router();

// ✅ all financial-report routes now require auth
router.use(authenticateToken);

router.get('/', ctrl.list);
router.get('/:id', ctrl.byId);
router.post('/generate', ctrl.generate);
router.delete('/:id', ctrl.remove);

export default router;
