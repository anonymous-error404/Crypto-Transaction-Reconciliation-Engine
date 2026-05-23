import mongoose from 'mongoose';
import transactionBaseSchema from './transactionBase.js';

const userTransactionSchema = new mongoose.Schema(
  {
    ...transactionBaseSchema,
    // user-specific fields can go here later
  },
  { timestamps: true }
);

// Compound index for matching engine lookups
userTransactionSchema.index({ asset: 1, type: 1, timestamp: 1 });

export default mongoose.model('UserTransaction', userTransactionSchema);