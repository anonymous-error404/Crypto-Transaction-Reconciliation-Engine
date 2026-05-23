import { Router } from 'express';
import {
    triggerReconciliation,
    fetchFullReport,
    fetchSummary,
    fetchUnmatched,
    downloadReport,
} from '../controllers/reconciliation.controller.js';

const router = Router();

router.post('/reconcile', triggerReconciliation);
router.get('/report/:runId', fetchFullReport);
router.get('/report/:runId/summary', fetchSummary);
router.get('/report/:runId/unmatched', fetchUnmatched);
router.get('/report/:runId/export', downloadReport);

export default router;