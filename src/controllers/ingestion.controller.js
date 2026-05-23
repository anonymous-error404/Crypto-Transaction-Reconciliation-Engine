import { ingestBothFiles } from '../services/ingestion.service.js';

export const ingestFiles = async (req, res) => {
  try {
    const userFile     = req.files?.user_transactions?.[0];
    const exchangeFile = req.files?.exchange_transactions?.[0];

    if (!userFile || !exchangeFile) {
      return res.status(400).json({
        success: false,
        message: 'Both user_transactions and exchange_transactions files are required.',
      });
    }

    const result = await ingestBothFiles(userFile.path, exchangeFile.path);

    return res.status(200).json({
      success: true,
      message: 'Ingestion complete.',
      data: result,
    });
  } catch (err) {
    console.error('[IngestController]', err.message);
    return res.status(500).json({
      success: false,
      message: 'Ingestion failed.',
      error: err.message,
    });
  }
};