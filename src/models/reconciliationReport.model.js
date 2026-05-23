import mongoose from 'mongoose';

const entrySchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['matched', 'conflicting', 'unmatched_user_transaction', 'unmatched_exchange_transaction'],
    required: true,
  },
  confidence_score: {
    type: Number,
    min: 0,
    max: 100,
    default: null, // null for unmatched entries
  },
  reason: {
    type: String,
    required: true,
  },
  user_transaction: {
    type: mongoose.Schema.Types.Mixed, // full row, null if unmatched_exchange_transaction
    default: null,
  },
  exchange_transaction: {
    type: mongoose.Schema.Types.Mixed, // full row, null if unmatched_user_transaction
    default: null,
  },
  discrepancies: {
    // only populated for conflicting entries
    quantity_diff_pct: { type: Number, default: null },
    timestamp_diff_seconds: { type: Number, default: null },
  },
});

const reconciliationReportSchema = new mongoose.Schema(
  {
    // ── Run metadata ──────────────────────────────────────────
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
    },
    config: {
      timestamp_tolerance_seconds: { type: Number, default: 300 },
      quantity_tolerance_pct: { type: Number, default: 0.01 },
    },
    error: {
      type: String,
      default: null, // populated if status === 'failed'
    },

    // ── Summary counts ────────────────────────────────────────
    summary: {
      total_user: { type: Number, default: 0 },
      total_exchange: { type: Number, default: 0 },
      matched: { type: Number, default: 0 },
      conflicting: { type: Number, default: 0 },
      unmatched_user_transaction: { type: Number, default: 0 },
      unmatched_exchange_transaction: { type: Number, default: 0 },
    },

    // ── The actual report entries ─────────────────────────────
    entries: [entrySchema],
  },
  { timestamps: true } // createdAt = when run was triggered
);

export default mongoose.model('ReconciliationReport', reconciliationReportSchema);