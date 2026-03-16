const mongoose = require('mongoose');

/**
 * Booking Schema
 * Stores booking information between users and experts
 */
const bookingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  expertId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: [true, 'Please provide a booking date']
  },
  startTime: {
    type: String,
    required: [true, 'Please provide start time']
  },
  endTime: {
    type: String,
    required: [true, 'Please provide end time']
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'rejected', 'cancelled', 'completed', 'payment_pending', 'paid'],
    default: 'pending'
  },
  topic: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },
  // Payment fields
  sessionPrice: {
    type: Number,
    default: 0
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'payment_pending', 'paid'],
    default: 'unpaid'
  },
  paymentProof: {
    type: String,  // base64 screenshot uploaded by learner
    default: ''
  },
  paymentConfirmedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for faster queries
bookingSchema.index({ userId: 1, expertId: 1, date: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
