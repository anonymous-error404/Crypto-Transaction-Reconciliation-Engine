import mongoose from 'mongoose';

const transactionBaseSchema = {
  transaction_id: {
    type: String,
    required: [true, 'Transaction ID is required'],
    unique: true,
    trim: true,
  },
  timestamp: {
    type: Date,
    required: [true, 'Timestamp is required'],
    index: true,        // matching engine queries heavily on this
  },
  type: {
    type: String,
    required: true,
    enum: ['BUY', 'SELL', 'TRANSFER_IN', 'TRANSFER_OUT'],
    index: true,
  },
  asset: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    index: true,        // matching engine filters by asset first
  },
  quantity: {
    type: Number,
    required: true,
    min: 0.00000001,
  },
  price_usd: {
    type: Number,
    min: 0,
    default: null,
  },
  fee: {
    type: Number,
    min: 0,
    default: 0,
  },
  note: {
    type: String,
    trim: true,
    maxlength: 500,
    default: null,
  },
  status: {
    type: String,
    enum: ['clean', 'flagged'],
    default: 'clean',
  },

  flags: {
    type: [String],  // list of reasons e.g. ['Missing required field: quantity']
    default: [],
  },
};

export default transactionBaseSchema;