import mongoose from 'mongoose';

const ingestionLogSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ['user', 'exchange'],
      required: true,
    },
    raw_row: {
      type: mongoose.Schema.Types.Mixed, // original CSV row as-is
      required: true,
    },
    row_number: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      required: true, // e.g. "Missing required field: quantity"
    },
    severity: {
      type: String,
      enum: ['error', 'warning'],
      default: 'error',
    },
  },
  { timestamps: true }
);

export default mongoose.model('IngestionLog', ingestionLogSchema);