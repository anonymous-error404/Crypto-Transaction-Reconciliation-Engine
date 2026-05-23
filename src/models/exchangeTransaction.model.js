import mongoose from 'mongoose';
import transactionBaseSchema from './transactionBase.js';

const exchangeTransactionSchema = new mongoose.Schema(
  {
    ...transactionBaseSchema,
    // exchange-specific fields (e.g. exchange_ref_id) can go here
  },
  { timestamps: true }
);

// Same compound index — matching engine queries both collections the same way
exchangeTransactionSchema.index({ asset: 1, type: 1, timestamp: 1 });

export default mongoose.model('ExchangeTransaction', exchangeTransactionSchema);