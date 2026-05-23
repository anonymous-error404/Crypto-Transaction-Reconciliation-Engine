import { Router } from 'express';
import { ingestFiles } from '../controllers/ingestion.controller.js';
import { upload } from '../config/multer.config.js';

const router = Router();
  router.post(
    '/ingest',
    upload.fields([
      { name: 'user_transactions', maxCount: 1 },
      { name: 'exchange_transactions', maxCount: 1 },
    ]),
    ingestFiles
  );

export default router;