import { Room } from './room.model';
import { Booking } from './booking.model';

/**
 * Explicit enumeration of all possible booking form modes.
 * Each mode represents a distinct user workflow with specific behavior.
 */
export enum FormMode {
  /**
   * NEW: Fresh booking with no prefilled data.
   * - User selects date/time manually
   * - Shows suggested slots based on current time
   * - No special UI indicators
   */
  NEW = 'NEW',

  /**
   * NEW_WITH_SUGGESTION: New booking with auto-selected time slot.
   * - Triggered when user clicks a suggested time slot chip
   * - Pre-fills date/time but NOT title/comment
   * - Highlights the selected slot
   */
  NEW_WITH_SUGGESTION = 'NEW_WITH_SUGGESTION',

  /**
   * RESCHEDULE: Rescheduling an existing booking.
   * - Pre-fills ALL fields (date, time, title, comment)
   * - Shows visual indicator: "Umbuchung von [original date/time]"
   * - User can modify any field
   * - Creates NEW booking (original remains until manually deleted)
   */
  RESCHEDULE = 'RESCHEDULE',

  /**
   * SMART_RECOVERY: Recovery from booking conflict.
   * - User attempted booking, got conflict
   * - System found alternative room(s)
   * - Pre-fills date/time/title from failed attempt
   * - Shows special "Smart Rebooking" UI with rainbow highlight
   * - Different room than original attempt
   */
  SMART_RECOVERY = 'SMART_RECOVERY',

  /**
   * EDIT_EXISTING (Future enhancement)
   * - Direct editing of existing booking
   * - Would update booking instead of creating new one
   * - Requires backend PUT endpoint enhancement
   */
  // EDIT_EXISTING = 'EDIT_EXISTING'
}

/**
 * Data payload structure for different modes.
 * Not all fields are used in all modes.
 */
export interface BookingFormData {
  // Date/Time fields (used by RESCHEDULE, SMART_RECOVERY, NEW_WITH_SUGGESTION)
  date?: string;        // Format: 'YYYY-MM-DD'
  startTime?: string;   // Format: 'HH:mm'
  endTime?: string;     // Format: 'HH:mm'

  // Booking details (used by RESCHEDULE, SMART_RECOVERY)
  title?: string;
  comment?: string | null;

  // Metadata (used by RESCHEDULE)
  bookingId?: number;   // Original booking ID being rescheduled

  // Conflict info (used by SMART_RECOVERY)
  conflict?: Booking;   // The conflicting booking that triggered recovery
  originalRoomId?: number; // Room user originally tried to book
}

/**
 * Complete state specification for BookingFormComponent.
 * This is the ONLY input the component needs.
 */
export interface BookingFormState {
  /** The operational mode determining form behavior */
  mode: FormMode;

  /** The room ID for this booking */
  roomId: number;

  /** Optional data payload (structure depends on mode) */
  data?: BookingFormData;

  /** Room details (fetched by parent, passed down) */
  room?: Room;
}
