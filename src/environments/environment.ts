// Development environment configuration
export const environment = {
  production: false,

  // API Configuration
  apiUrl: 'http://localhost:3000/api',

  // Developer mode: Allow bookings at any time (24/7) for testing purposes
  // When true, bypasses business hours restrictions (08:00 - 20:00)
  unrestrictedBookingTimes: true
};
