/**
 * Application Constants
 *
 * Centralized constants for magic numbers and configuration values
 * used throughout the application.
 */

/**
 * Dashboard configuration
 */
export const DASHBOARD_CONFIG = {
  /** Auto-refresh interval in milliseconds (30 seconds) */
  REFRESH_INTERVAL_MS: 30000,

  /** Countdown display refresh rate in milliseconds (1 second) */
  COUNTDOWN_TICK_MS: 1000,

  /** Highlight duration for room cards in milliseconds (3 seconds) */
  HIGHLIGHT_DURATION_MS: 3000,
} as const;

/**
 * Dialog configuration
 */
export const DIALOG_CONFIG = {
  /** Standard dialog width */
  WIDTH_STANDARD: '500px',

  /** Small dialog width */
  WIDTH_SMALL: '400px',

  /** Large dialog width */
  WIDTH_LARGE: '650px',

  /** Extra large dialog width */
  WIDTH_EXTRA_LARGE: '800px',
} as const;

/**
 * Form configuration
 */
export const FORM_CONFIG = {
  /** Debounce time for form inputs in milliseconds */
  DEBOUNCE_MS: 300,

  /** Minimum title length */
  MIN_TITLE_LENGTH: 2,

  /** Minimum password length */
  MIN_PASSWORD_LENGTH: 8,

  /** Minimum name length */
  MIN_NAME_LENGTH: 2,
} as const;

/**
 * Booking configuration
 */
export const BOOKING_CONFIG = {
  /** Availability check debounce in milliseconds */
  AVAILABILITY_CHECK_DEBOUNCE_MS: 500,

  /** Live status update interval in milliseconds */
  LIVE_STATUS_UPDATE_MS: 1000,

  /** Default booking duration in minutes */
  DEFAULT_DURATION_MINUTES: 60,
} as const;

/**
 * Animation durations
 */
export const ANIMATION_CONFIG = {
  /** Standard fade duration in milliseconds */
  FADE_DURATION_MS: 300,

  /** Slide animation duration in milliseconds */
  SLIDE_DURATION_MS: 300,

  /** Rainbow effect duration in milliseconds */
  RAINBOW_DURATION_MS: 2000,
} as const;

/**
 * Snackbar configuration
 */
export const SNACKBAR_CONFIG = {
  /** Default snackbar duration in milliseconds */
  DURATION_DEFAULT_MS: 3000,

  /** Success message duration in milliseconds */
  DURATION_SUCCESS_MS: 2500,

  /** Error message duration in milliseconds */
  DURATION_ERROR_MS: 5000,

  /** Warning message duration in milliseconds */
  DURATION_WARNING_MS: 4000,
} as const;
