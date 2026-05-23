import fs from 'fs';
import csvParser from 'csv-parser';
import UserTransaction from '../models/userTransaction.model.js';
import ExchangeTransaction from '../models/exchangeTransaction.model.js';
import IngestionLog from '../models/ingestionLog.model.js';

const ASSET_ALIASES = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  solana: 'SOL',
  cardano: 'ADA',
};

const TYPE_ALIASES = {
  buy: 'BUY',
  sell: 'SELL',
  transfer_in: 'TRANSFER_IN',
  transfer_out: 'TRANSFER_OUT',
};

const VALID_TYPES = ['BUY', 'SELL', 'TRANSFER_IN', 'TRANSFER_OUT'];
const REQUIRED_FIELDS = ['transaction_id', 'timestamp', 'type', 'asset', 'quantity'];

function normalizeAsset(raw) {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  return ASSET_ALIASES[trimmed] || raw.trim().toUpperCase();
}

function normalizeType(raw) {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return TYPE_ALIASES[key] || raw.trim().toUpperCase();
}

// ── Read CSV from disk path ───────────────────────────────────────
function parseCSVFromPath(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function validateRow(row) {
  const issues = [];

  for (const field of REQUIRED_FIELDS) {
    if (!row[field] || String(row[field]).trim() === '') {
      issues.push(`Missing required field: ${field}`);
    }
  }

  if (row.timestamp && isNaN(new Date(row.timestamp))) {
    issues.push(`Invalid timestamp: "${row.timestamp}"`);
  }

  const qty = parseFloat(row.quantity);
  if (row.quantity && (isNaN(qty) || qty <= 0)) {
    issues.push(`Invalid quantity: "${row.quantity}"`);
  }

  if (row.price_usd?.trim()) {
    const price = parseFloat(row.price_usd);
    if (isNaN(price) || price < 0) {
      issues.push(`Invalid price_usd: "${row.price_usd}"`);
    }
  }

  if (row.fee?.trim()) {
    const fee = parseFloat(row.fee);
    if (isNaN(fee) || fee < 0) {
      issues.push(`Invalid fee: "${row.fee}"`);
    }
  }

  const normalizedType = normalizeType(row.type);
  if (row.type && !VALID_TYPES.includes(normalizedType)) {
    issues.push(`Invalid type: "${row.type}"`);
  }

  return issues;
}

async function ingestFile(filePath, source) {
  const Model = source === 'user' ? UserTransaction : ExchangeTransaction;
  const rows = await parseCSVFromPath(filePath);

  let clean = 0;
  let flagged = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2;

    const issues = validateRow(row);

    // best-effort clean the row regardless
    const cleaned = {
      transaction_id: row.transaction_id?.trim() || `UNKNOWN_${rowNumber}`,
      timestamp:      isNaN(new Date(row.timestamp)) ? null : new Date(row.timestamp),
      type:           normalizeType(row.type) || row.type?.trim() || null,
      asset:          normalizeAsset(row.asset) || null,
      quantity:       parseFloat(row.quantity) || null,
      price_usd:      row.price_usd?.trim() ? parseFloat(row.price_usd) : null,
      fee:            row.fee?.trim() ? parseFloat(row.fee) : 0,
      note:           row.note?.trim() || null,
      status:         issues.length > 0 ? 'flagged' : 'clean',
      flags:          issues,
    };

    try {
      await Model.create(cleaned);
      issues.length > 0 ? flagged++ : clean++;
    } catch (err) {
      // only truly unrecoverable rows (e.g. duplicate transaction_id) go to IngestionLog
      await IngestionLog.create({
        source,
        raw_row: row,
        row_number: rowNumber,
        reason: `DB insert failed: ${err.message}`
      });
      flagged++;
    }
  }

  return { source, total_rows: rows.length, clean, flagged };
}

export async function ingestBothFiles(userFilePath, exchangeFilePath) {
  const [userResult, exchangeResult] = await Promise.all([
    ingestFile(userFilePath, 'user'),
    ingestFile(exchangeFilePath, 'exchange'),
  ]);

  return { user: userResult, exchange: exchangeResult };
}