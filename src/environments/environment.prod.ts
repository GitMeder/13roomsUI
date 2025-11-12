// Production environment configuration
export const environment = {
  production: true,

  // API Configuration
  // TODO: Update this URL for production deployment
  apiUrl: 'http://localhost:3000/api',

  // Production mode: Enforce business hours restrictions (08:00 - 20:00)
  unrestrictedBookingTimes: false
};
