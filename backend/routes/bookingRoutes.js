const express = require('express');
const { 
  createBooking, 
  getBookings, 
  updateBookingStatus, 
  deleteBooking,
  markPaymentDone,
  confirmPayment
} = require('../controllers/bookingController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.route('/')
  .post(protect, createBooking)
  .get(protect, getBookings);

router.route('/:id')
  .put(protect, updateBookingStatus)
  .delete(protect, deleteBooking);

router.post('/:id/payment-done', protect, markPaymentDone);
router.post('/:id/confirm-payment', protect, confirmPayment);

module.exports = router;
