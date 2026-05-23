import UserTransaction from '../models/userTransaction.model.js';
import ExchangeTransaction from '../models/exchangeTransaction.model.js';
import ReconciliationReport from '../models/reconciliationReport.model.js';

// ── Type equivalence map ──────────────────────────────────────────
const TYPE_EQUIVALENTS = {
    TRANSFER_IN: 'TRANSFER_OUT',
    TRANSFER_OUT: 'TRANSFER_IN',
};

function typesMatch(userType, exchangeType) {
    return (
        userType === exchangeType ||
        TYPE_EQUIVALENTS[userType] === exchangeType
    );
}

function timestampDiffSeconds(a, b) {
    return Math.abs(new Date(a) - new Date(b)) / 1000;
}

function quantityDiffPct(a, b) {
    if (a === 0 && b === 0) return 0;
    return (Math.abs(a - b) / ((a + b) / 2)) * 100;
}

function calculateConfidence(qtyDiff, timeDiff, config) {
  const qtyScore  = Math.max(0, 100 - (qtyDiff  / config.quantity_tolerance_pct)  * 100);
  const timeScore = Math.max(0, 100 - (timeDiff / config.timestamp_tolerance_seconds) * 100);
  return parseFloat(((qtyScore + timeScore) / 2).toFixed(2));
}

//Core matching algorithm
async function matchTransactions(config) {
    const { timestamp_tolerance_seconds, quantity_tolerance_pct } = config;

    const userTransactions = await UserTransaction.find({ status: 'clean' }).lean();
    const exchangeTransactions = await ExchangeTransaction.find({ status: 'clean' }).lean();

    const entries = [];
    const matchedExchangeIds = new Set(); // track which exchange rows got paired

    for (const userTx of userTransactions) {
        //narrow candidates by asset,type,timestamp window
        const windowStart = new Date(new Date(userTx.timestamp) - timestamp_tolerance_seconds * 1000);
        const windowEnd = new Date(new Date(userTx.timestamp) + timestamp_tolerance_seconds * 1000);

        const candidates = exchangeTransactions.filter((exTx) => {
            return (
                exTx.asset === userTx.asset &&
                typesMatch(userTx.type, exTx.type) &&
                new Date(exTx.timestamp) >= windowStart &&
                new Date(exTx.timestamp) <= windowEnd &&
                !matchedExchangeIds.has(String(exTx._id)) // not already paired
            );
        });

        if (candidates.length === 0) {
            // No candidate found at all
            entries.push({
                category: 'unmatched_user_transaction',
                reason: 'No matching transaction found in exchange data',
                user_transaction: userTx,
                exchange_transaction: null,
                discrepancies: { quantity_diff_pct: null, timestamp_diff_seconds: null },
            });
            continue;
        }

        //from candidates, pick the one with closest quantity
        const best = candidates.reduce((prev, curr) => {
            return quantityDiffPct(curr.quantity, userTx.quantity) < quantityDiffPct(prev.quantity, userTx.quantity) ? curr : prev;
        });

        const qtyDiff = quantityDiffPct(userTx.quantity, best.quantity);
        const timeDiff = timestampDiffSeconds(userTx.timestamp, best.timestamp);

        const qtyMatch = qtyDiff <= quantity_tolerance_pct;
        const timeMatch = timeDiff <= timestamp_tolerance_seconds;

        if (qtyMatch && timeMatch) {
            matchedExchangeIds.add(String(best._id));
            entries.push({
                category: 'matched',
                confidence_score: calculateConfidence(qtyDiff, timeDiff, config),
                reason: `Matched within tolerances — quantity diff: ${qtyDiff.toFixed(4)}%, time diff: ${timeDiff.toFixed(0)}s`,
                user_transaction: userTx,
                exchange_transaction: best,
                discrepancies: { quantity_diff_pct: qtyDiff, timestamp_diff_seconds: timeDiff },
            });
        } else {
            const reasons = [];
            if (!qtyMatch) reasons.push(`quantity diff ${qtyDiff.toFixed(4)}% exceeds tolerance of ${quantity_tolerance_pct}%`);
            if (!timeMatch) reasons.push(`timestamp diff ${timeDiff.toFixed(0)}s exceeds tolerance of ${timestamp_tolerance_seconds}s`);

            matchedExchangeIds.add(String(best._id));
            entries.push({
                category: 'conflicting',
                confidence_score: calculateConfidence(qtyDiff, timeDiff, config),
                reason: reasons.join(' | '),
                user_transaction: userTx,
                exchange_transaction: best,
                discrepancies: { quantity_diff_pct: qtyDiff, timestamp_diff_seconds: timeDiff },
            });
        }
    }

    // Step 4 — any exchange tx not paired = UNMATCHED (exchange only)
    for (const exTx of exchangeTransactions) {
        if (!matchedExchangeIds.has(String(exTx._id))) {
            entries.push({
                category: 'unmatched_exchange_transaction',
                reason: 'No matching transaction found in user data',
                user_transaction: null,
                exchange_transaction: exTx,
                discrepancies: { quantity_diff_pct: null, timestamp_diff_seconds: null },
            });
        }
    }

    return entries;
}

// ── Summary builder ───────────────────────────────────────────────
function buildSummary(entries, userTotal, exchangeTotal) {
    return {
        total_user: userTotal,
        total_exchange: exchangeTotal,
        matched: entries.filter(e => e.category === 'matched').length,
        conflicting: entries.filter(e => e.category === 'conflicting').length,
        unmatched_user_transaction: entries.filter(e => e.category === 'unmatched_user_transaction').length,
        unmatched_exchange_transaction: entries.filter(e => e.category === 'unmatched_exchange_transaction').length,
    };
}

// ── Main entry point ──────────────────────────────────────────────
export async function runReconciliation(configOverrides = {}) {
    const config = {
        timestamp_tolerance_seconds: Number(process.env.TIMESTAMP_TOLERANCE_SECONDS ?? 300),
        quantity_tolerance_pct: Number(process.env.QUANTITY_TOLERANCE_PCT ?? 0.01),
        ...configOverrides, // request body overrides env
    };

    // Create the report doc immediately so we have a runId to return
    const report = await ReconciliationReport.create({
        status: 'running',
        config,
    });

    try {
        const entries = await matchTransactions(config);

        const userTotal = await UserTransaction.countDocuments({ status: 'clean' });
        const exchangeTotal = await ExchangeTransaction.countDocuments({ status: 'clean' });
        const summary = buildSummary(entries, userTotal, exchangeTotal);

        // Save everything
        report.status = 'completed';
        report.entries = entries;
        report.summary = summary;
        await report.save();

        return report;
    } catch (err) {
        report.status = 'failed';
        report.error = err.message;
        await report.save();
        throw err;
    }
}

// ── Report fetchers ───────────────────────────────────────────────
export async function getFullReport(runId) {
    return ReconciliationReport.findById(runId).lean();
}

export async function getReportSummary(runId) {
    return ReconciliationReport.findById(runId).select('summary status config createdAt').lean();
}

export async function getUnmatchedEntries(runId) {
    const report = await ReconciliationReport.findById(runId)
        .select('entries summary status')
        .lean();

    if (!report) return null;

    return {
        ...report,
        entries: report.entries.filter(e =>
            e.category === 'unmatched_user_transaction' || e.category === 'unmatched_exchange_transaction'
        ),
    };
}

export async function exportReportAsCSV(runId) {
  const report = await ReconciliationReport.findById(runId).lean();
  if (!report) return null;

  const rows = report.entries.map(e => ({
    category:             e.category,
    reason:               e.reason,
    confidence_score:     e.confidence_score ?? null,
    user_tx_id:           e.user_transaction?.transaction_id ?? null,
    user_asset:           e.user_transaction?.asset ?? null,
    user_type:            e.user_transaction?.type ?? null,
    user_quantity:        e.user_transaction?.quantity ?? null,
    user_timestamp:       e.user_transaction?.timestamp ?? null,
    exchange_tx_id:       e.exchange_transaction?.transaction_id ?? null,
    exchange_asset:       e.exchange_transaction?.asset ?? null,
    exchange_type:        e.exchange_transaction?.type ?? null,
    exchange_quantity:    e.exchange_transaction?.quantity ?? null,
    exchange_timestamp:   e.exchange_transaction?.timestamp ?? null,
    quantity_diff_pct:    e.discrepancies?.quantity_diff_pct ?? null,
    timestamp_diff_secs:  e.discrepancies?.timestamp_diff_seconds ?? null,
  }));

  const parser = new Parser();
  return parser.parse(rows);
}