// Production environment configuration
export const environment = {
  production: true,

  // API Configuration
  // Dynamically determine API URL based on environment variable or window location
  // This can be overridden at container runtime or use the same origin as the frontend
  apiUrl: (typeof window !== 'undefined' && (window as any).__API_URL__)
    ? (window as any).__API_URL__
    : (typeof window !== 'undefined' && window.location.origin.includes('localhost'))
      ? 'http://localhost:3000/api'
      : `${typeof window !== 'undefined' ? window.location.origin : ''}/api`,

  // Production mode: Enforce business hours restrictions (08:00 - 20:00)
  unrestrictedBookingTimes: false
};
