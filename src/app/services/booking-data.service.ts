import { Injectable, signal } from '@angular/core';

/**
 * Interface for temporary booking data
 */
export interface TempBookingData {
  roomId: number;
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  comment: string;
}

/**
 * BookingDataService - Temporary storage for booking form data
 *
 * Used when a guest user chooses to register while making a booking.
 * The form data is preserved and restored after successful registration.
 */
@Injectable({
  providedIn: 'root'
})
export class BookingDataService {
  private readonly tempBookingData = signal<TempBookingData | null>(null);

  /**
   * Save booking form data temporarily
   */
  saveTempBooking(data: TempBookingData): void {
    this.tempBookingData.set(data);
  }

  /**
   * Retrieve and clear temporary booking data
   */
  getTempBooking(): TempBookingData | null {
    const data = this.tempBookingData();
    this.tempBookingData.set(null);
    return data;
  }

  /**
   * Clear temporary booking data without retrieving
   */
  clearTempBooking(): void {
    this.tempBookingData.set(null);
  }

  /**
   * Check if temporary booking data exists
   */
  hasTempBooking(): boolean {
    return this.tempBookingData() !== null;
  }
}
