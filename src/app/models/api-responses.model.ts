import { Booking } from './booking.model';
import { Room } from './room.model';

/**
 * API Response Interfaces
 *
 * This file contains typed interfaces for all API responses,
 * eliminating the need for 'any' types throughout the application.
 */

/**
 * Raw booking response from API before normalization
 */
export interface RawBookingResponse {
  id: number;
  room_id: number;
  title?: string;
  name?: string;
  start_time: string;
  end_time: string;
  comment?: string | null;
  created_by?: number | null;
  createdBy?: number | null;
  creator_firstname?: string | null;
  creatorFirstname?: string | null;
  creator_surname?: string | null;
  creatorSurname?: string | null;
  creator_email?: string | null;
  creatorEmail?: string | null;
  guest_name?: string | null;
  guestName?: string | null;
}

/**
 * Extended booking response with room information (used in admin views)
 */
export interface BookingWithRoomInfo extends Booking {
  room_name: string;
  room_icon: string | null;
  status: string;
}

/**
 * User entity from API
 */
export interface ApiUser {
  id: number;
  email: string;
  firstname: string;
  surname: string;
  role: 'user' | 'admin' | 'guest';
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * API response for user list
 */
export interface GetUsersResponse {
  message: string;
  users: ApiUser[];
}

/**
 * API response for single user operations
 */
export interface UserResponse {
  message: string;
  user: ApiUser;
}

/**
 * Booking page resolver data
 */
export interface BookingPageResolverData {
  room: Room;
  conflict: Booking | null;
  isSmartRebooking?: boolean;
  prefillData?: {
    date: string;
    startTime: string;
    endTime: string;
    title: string;
    comment?: string;
  } | null;
}

/**
 * Available rooms query response
 */
export interface AvailableRoomsResponse {
  rooms: Room[];
  requestedTimeSlot: {
    date: string;
    startTime: string;
    endTime: string;
  };
}
