import {
  runReconciliation,
  getFullReport,
  getReportSummary,
  getUnmatchedEntries,
  exportReportAsCSV
} from '../services/matching.service.js';

export const triggerReconciliation = async (req, res) => {
  try {
    const configOverrides = req.body ?? {};
    const report = await runReconciliation(configOverrides);

    return res.status(200).json({
      success: true,
      message: 'Reconciliation completed.',
      runId: report._id,
      summary: report.summary,
    });
  } catch (err) {
    console.error('[ReconciliationController] triggerReconciliation:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const fetchFullReport = async (req, res) => {
  try {
    const report = await getFullReport(req.params.runId);
    if (!report) return res.status(404).json({ success: false, message: 'Run not found.' });

    return res.status(200).json({ success: true, data: report });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const fetchSummary = async (req, res) => {
  try {
    const summary = await getReportSummary(req.params.runId);
    if (!summary) return res.status(404).json({ success: false, message: 'Run not found.' });

    return res.status(200).json({ success: true, data: summary });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const fetchUnmatched = async (req, res) => {
  try {
    const data = await getUnmatchedEntries(req.params.runId);
    if (!data) return res.status(404).json({ success: false, message: 'Run not found.' });

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const downloadReport = async (req, res) => {
  try {
    const csv = await exportReportAsCSV(req.params.runId);
    if (!csv) return res.status(404).json({ success: false, message: 'Run not found.' });

    res.header('Content-Type', 'text/csv');
    res.attachment(`report_${req.params.runId}.csv`);
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};