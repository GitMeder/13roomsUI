/**
 * Application Enums
 *
 * Centralized enums for consistent string literal types throughout the application.
 * This eliminates magic strings and provides type safety.
 */

/**
 * Room status enum for internal use
 */
export enum RoomStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  MAINTENANCE = 'maintenance'
}

/**
 * Room display status (for UI)
 */
export enum RoomDisplayStatus {
  AVAILABLE = 'available',
  OCCUPIED = 'occupied',
  MAINTENANCE = 'maintenance'
}

/**
 * User role enum
 */
export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  GUEST = 'guest'
}

/**
 * Booking status enum
 */
export enum BookingStatus {
  CONFIRMED = 'confirmed',
  CANCELED = 'canceled',
  PENDING = 'pending'
}

/**
 * Error snackbar type enum
 */
export enum SnackbarType {
  ERROR = 'error',
  SUCCESS = 'success',
  WARNING = 'warning',
  INFO = 'info'
}
