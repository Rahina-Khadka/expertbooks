import api from './api';

/**
 * Booking Service
 * Handles booking operations
 */
const bookingService = {
  /**
   * Create new booking
   */
  createBooking: async (bookingData) => {
    const response = await api.post('/bookings', bookingData);
    return response.data;
  },

  /**
   * Get user bookings
   */
  getBookings: async () => {
    const response = await api.get('/bookings');
    return response.data;
  },

  /**
   * Update booking status
   */
  updateBookingStatus: async (id, status) => {
    const response = await api.put(`/bookings/${id}`, { status });
    return response.data;
  },

  /**
   * Cancel booking
   */
  cancelBooking: async (id) => {
    const response = await api.delete(`/bookings/${id}`);
    return response.data;
  },

  /**
   * Learner marks payment as done
   */
  markPaymentDone: async (id, paymentProof = '') => {
    const response = await api.post(`/bookings/${id}/payment-done`, { paymentProof });
    return response.data;
  },

  /**
   * Expert confirms payment received
   */
  confirmPayment: async (id) => {
    const response = await api.post(`/bookings/${id}/confirm-payment`);
    return response.data;
  }
};

export default bookingService;
