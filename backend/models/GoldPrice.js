// backend/models/GoldPrice.js

const mongoose = require('mongoose');

// Define the schema for the historical gold price data.
// This acts as a blueprint for how data will be stored in the 'goldprices' collection.
const goldPriceSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true, // Ensures you don't have duplicate entries for the same day.
    index: true   // Improves performance for any queries filtering or sorting by date.
  },
  lkrPerOz: {
    type: Number,
    required: true
  },
  lkrPerGram: {
    type: Number,
    required: true
  }
}, {
  // Automatically add 'createdAt' and 'updatedAt' fields.
  // This is a best practice for tracking when records are created or modified.
  timestamps: true,
  collection: 'goldprices'
});

// Create the Mongoose model from the schema.
// Mongoose will automatically create a MongoDB collection named 'goldprices' (plural and lowercase).
const GoldPrice = mongoose.model('GoldPrice', goldPriceSchema);

module.exports = GoldPrice;