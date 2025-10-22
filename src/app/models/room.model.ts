import { Booking } from './booking.model';

export interface Room {
  id: number;
  name: string;
  capacity: number;
  status: 'available' | 'occupied' | 'maintenance' | string;
  location?: string | null;
  amenities?: string[] | null;
  icon?: string | null;
  nextAvailableTime?: Date | null;
  remainingTimeMinutes?: number | null;
  currentBooking?: Booking;
  nextBooking?: Booking;
}
