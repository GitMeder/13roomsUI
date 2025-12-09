import { Booking } from './booking.model';

export interface Room {
  id: number;
  name: string;
  capacity: number;
  status: 'available' | 'occupied' | 'maintenance' | string;
  statusRaw?: 'active' | 'inactive' | 'maintenance';
  location?: string | null;
  amenities?: string[] | null;
  icon?: string | null;
  // TIME ARCHITECTURE: nextAvailableTime is a timezone-naive datetime string
  nextAvailableTime?: string | null;
  remainingTimeMinutes?: number | null;
  currentBooking?: Booking;
  nextBooking?: Booking;
  totalBookingsToday?: number;
  totalBookedMinutesToday?: number;
  allBookingsToday?: Booking[];
}
