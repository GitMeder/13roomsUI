import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, delay, map, of, throwError, switchMap } from 'rxjs';

export interface Room {
  id: number;
  name: string;
  capacity: number;
  status: 'available' | 'occupied' | 'maintenance' | string;
  statusRaw?: 'active' | 'inactive' | 'maintenance';
  location?: string | null;
  amenities?: string[] | null;
  icon?: string | null;
  nextAvailableTime?: Date | null;
  remainingTimeMinutes?: number | null;
  currentBooking?: Booking;
  nextBooking?: Booking;
  totalBookingsToday?: number;
  totalBookedMinutesToday?: number;
  allBookingsToday?: Booking[];
}

export interface BookingPayload {
  roomId: number;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  comment?: string;
}

interface ApiRoom {
  id: number;
  name: string;
  capacity: number;
  status: string;
  location?: string | null;
  amenities?: string[] | string | null;
  icon?: string | null;
  nextAvailableTime?: string | null; // Backend sends as string
  remainingTimeMinutes?: number | null;
  currentBooking?: Booking | null;
  nextBooking?: Booking | null;
  totalBookingsToday?: number;
  totalBookedMinutesToday?: number;
  allBookingsToday?: Booking[];
}

interface CreateBookingRequest {
  room_id: number;
  title: string;
  start_time: string;
  end_time: string;
  comment?: string | null;
}

export interface BookingResponse {
  message: string;
  bookingId?: number;
}

export interface CreateRoomPayload {
  name: string;
  capacity: number;
  status: string;
  location?: string;
  amenities?: string[];
  icon?: string;
}

export interface UpdateRoomPayload {
  name?: string;
  capacity?: number;
  status?: 'active' | 'inactive' | 'maintenance';
  location?: string | null;
  amenities?: string[];
  icon?: string | null;
}

export interface Booking {
  id: number;
  room_id: number;
  title: string;
  start_time: string;
  end_time: string;
  comment: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:3000/api';

  private readonly knownStatuses = new Set(['available', 'occupied', 'maintenance', 'active', 'inactive']);

  get<T>(endpoint: string, options?: {
    headers?: HttpHeaders | {
      [header: string]: string | string[];
    };
    params?: HttpParams | {
      [param: string]: string | number | boolean | ReadonlyArray<string | number | boolean>;
    };
  }): Observable<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    console.log(`API GET: ${url}`);
    return this.http.get<T>(url, options).pipe(
      catchError((error) => {
        console.error(`API GET Error for ${url}:`, error);
        return throwError(() => error);
      })
    );
  }

  post<T>(endpoint: string, body: unknown, options?: {
    headers?: HttpHeaders | {
      [header: string]: string | string[];
    };
  }): Observable<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    console.log(`API POST: ${url}`, body);
    return this.http.post<T>(url, body, options).pipe(
      catchError((error) => {
        console.error(`API POST Error for ${url}:`, error);
        return throwError(() => error);
      })
    );
  }

  put<T>(endpoint: string, body: unknown, options?: {
    headers?: HttpHeaders | {
      [header: string]: string | string[];
    };
  }): Observable<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    console.log(`API PUT: ${url}`, body);
    return this.http.put<T>(url, body, options).pipe(
      catchError((error) => {
        console.error(`API PUT Error for ${url}:`, error);
        return throwError(() => error);
      })
    );
  }

  delete<T>(endpoint: string, options?: {
    headers?: HttpHeaders | {
      [header: string]: string | string[];
    };
  }): Observable<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    console.log(`API DELETE: ${url}`);
    return this.http.delete<T>(url, options).pipe(
      catchError((error) => {
        console.error(`API DELETE Error for ${url}:`, error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Fetches all available rooms from the backend API.
   * Falls back to mock data if the API is unavailable.
   * @returns Observable emitting an array of Room objects with current booking information
   */
  getRooms(): Observable<Room[]> {
    console.log('Fetching rooms...');
    // Attempt to reach the real API first, otherwise fall back to the mock data.
    return this.get<ApiRoom[]>('rooms').pipe(
      map((rooms) => rooms.map((room) => this.normalizeRoom(room))),
      catchError((error) => {
        console.error('Error fetching rooms:', error);
        return throwError(() => error);
      })
    );
  }

  createRoom(roomData: CreateRoomPayload): Observable<Room> {
    console.log('Creating room:', roomData);
    return this.post<Room>('rooms', roomData);
  }

  deleteBooking(id: number): Observable<void> {
    console.log(`Deleting booking with ID: ${id}`);
    return this.delete<void>(`bookings/${id}`);
  }

  updateRoom(id: number, payload: UpdateRoomPayload): Observable<Room> {
    console.log(`Updating room ${id}:`, payload);
    return this.put<{ message: string; room: ApiRoom }>(`rooms/${id}`, payload).pipe(
      map(response => this.normalizeRoom(response.room))
    );
  }

  deleteRoom(id: number): Observable<void> {
    console.log(`Deleting room with ID: ${id}`);
    return this.delete<void>(`rooms/${id}`);
  }

  /**
   * Fetches all bookings for a specific room, optionally filtered by date.
   * @param roomId - The ID of the room to fetch bookings for
   * @param date - Optional date string in YYYY-MM-DD format to filter bookings
   * @returns Observable emitting an array of Booking objects
   */
  getRoomBookings(roomId: number, date?: string): Observable<Booking[]> {
    console.log(`Fetching bookings for room ID: ${roomId}${date ? ' on ' + date : ''}`);

    if (date) {
      const params = new HttpParams().set('date', date);
      return this.get<any[]>(`bookings/room/${roomId}`, { params }).pipe(
        map((rows) =>
          rows
            .map((raw) => this.mapBooking(raw))
            .filter((booking): booking is Booking => booking !== null)
        )
      );
    }

    return this.get<any[]>(`bookings/room/${roomId}`).pipe(
      map((rows) =>
        rows
          .map((raw) => this.mapBooking(raw))
          .filter((booking): booking is Booking => booking !== null)
      )
    );
  }

  /**
   * Checks if a booking would conflict with existing bookings for a room.
   * @param roomId - The ID of the room to check
   * @param date - Date string in YYYY-MM-DD format
   * @param startTime - Start time in HH:mm format
   * @param endTime - End time in HH:mm format
   * @returns Observable emitting the conflicting Booking or null if no conflict exists
   */
  checkBookingConflict(roomId: number, date: string, startTime: string, endTime: string): Observable<Booking | null> {
    console.log(`Checking for conflicts for room: ${roomId} on ${date} from ${startTime} to ${endTime}`);

    // Call the backend API to check for conflicts
    const params = new HttpParams()
      .set('date', date)
      .set('startTime', startTime)
      .set('endTime', endTime);

    return this.http
      .get<any>(`${this.baseUrl}/bookings/check-conflict/${roomId}`, { params })
      .pipe(
        map((raw) => this.mapBooking(raw)),
        catchError(error => {
          console.error('Error checking booking conflict:', error);
          // Return null on error instead of throwing
          return of(null);
        })
      );
  }

  getRoom(roomId: number): Observable<Room> {
    return this.http.get<ApiRoom>(`${this.baseUrl}/rooms/${roomId}`).pipe(
      map((room) => this.normalizeRoom(room)),
      catchError(err => {
        console.error('Error fetching room:', err);
        // throwError is important to let the component know the call failed
        return throwError(() => new Error('Room not found'));
      })
    );
  }

  getBookingPageData(roomId: number): Observable<{ room: Room; conflict: Booking | null }> {
    return this.getRoom(roomId).pipe(
      switchMap(room => 
        this.checkBookingConflict(roomId, new Date().toISOString().split('T')[0], '00:00', '23:59').pipe(
          map(conflict => ({ room, conflict }))
        )
      )
    );
  }

  /**
   * Creates a new booking for a room.
   * @param payload - Booking details including roomId, date, time range, title, and optional comment
   * @returns Observable emitting a BookingResponse with success message and booking ID
   */
  createBooking(payload: BookingPayload): Observable<BookingResponse> {
    const requestBody: CreateBookingRequest = {
      room_id: payload.roomId,
      title: payload.title,
      start_time: this.combineDateAndTime(payload.date, payload.startTime),
      end_time: this.combineDateAndTime(payload.date, payload.endTime),
      comment: payload.comment?.trim() || null
    };

    return this.post<BookingResponse>('bookings', requestBody);
  }

  /**
   * PHASE 3: Smart Failure Recovery
   * Searches for alternative rooms that are available for the specified time slot.
   *
   * @param date Date in ISO format (YYYY-MM-DD)
   * @param startTime Time in HH:mm format
   * @param endTime Time in HH:mm format
   * @returns Observable of available rooms
   */
  getAvailableRooms(date: string, startTime: string, endTime: string): Observable<Room[]> {
    console.log(`Searching for available rooms on ${date} from ${startTime} to ${endTime}`);

    const params = new HttpParams()
      .set('date', date)
      .set('startTime', startTime)
      .set('endTime', endTime);

    return this.get<ApiRoom[]>('rooms/available', { params }).pipe(
      map((rooms) => rooms.map((room) => this.normalizeRoom(room))),
      catchError((error) => {
        console.error('Error fetching available rooms:', error);
        // Return empty array on error instead of throwing
        return of([]);
      })
    );
  }

  private normalizeRoom(room: ApiRoom): Room {
    const rawStatus = room.status?.toString().toLowerCase();
    const status = this.normalizeStatus(rawStatus);
    const statusRaw = this.toInternalStatus(rawStatus);

    const amenitiesArray = Array.isArray(room.amenities)
      ? room.amenities
      : typeof room.amenities === 'string' && room.amenities.length
        ? room.amenities.split(',').map((item) => item.trim()).filter(Boolean)
        : [];

    const currentBooking = this.mapBooking(room.currentBooking);
    const nextBooking = this.mapBooking(room.nextBooking);
    const allBookingsToday = Array.isArray(room.allBookingsToday)
      ? room.allBookingsToday
          .map((raw) => this.mapBooking(raw))
          .filter((booking): booking is Booking => booking !== null)
      : [];

    return {
      id: room.id,
      name: room.name,
      capacity: room.capacity,
      status: status ?? 'available',
      statusRaw,
      location: room.location ?? null,
      amenities: amenitiesArray.length ? amenitiesArray : null,
      icon: room.icon ?? null,
      nextAvailableTime: room.nextAvailableTime ? new Date(room.nextAvailableTime) : null,
      remainingTimeMinutes: room.remainingTimeMinutes ?? null,
      currentBooking: currentBooking ?? undefined,
      nextBooking: nextBooking ?? undefined,
      totalBookingsToday: room.totalBookingsToday ?? 0,
      totalBookedMinutesToday: room.totalBookedMinutesToday ?? 0,
      allBookingsToday
    };
  }

  private mapBooking(raw: any | null | undefined): Booking | null {
    if (!raw) {
      return null;
    }

    return {
      id: raw.id,
      room_id: raw.room_id,
      title: raw.title ?? raw.name ?? 'Ohne Titel',
      start_time: raw.start_time,
      end_time: raw.end_time,
      comment: raw.comment ?? null
    };
  }

  private combineDateAndTime(dateIso: string, time: string): string {
    const [datePart] = dateIso.split('T');
    const [hours, minutes] = time.split(':');
    const normalizedHours = hours?.padStart(2, '0') ?? '00';
    const normalizedMinutes = minutes?.padStart(2, '0') ?? '00';
    return `${datePart ?? ''} ${normalizedHours}:${normalizedMinutes}:00`;
  }

  private normalizeStatus(status?: string | null): string | null {
    if (!status) {
      return null;
    }

    switch (status.toLowerCase()) {
      case 'active':
        return 'available';
      case 'inactive':
        return 'occupied';
      case 'maintenance':
        return 'maintenance';
      case 'available':
      case 'occupied':
        return status.toLowerCase();
      default:
        return status;
    }
  }

  private toInternalStatus(status?: string | null): 'active' | 'inactive' | 'maintenance' {
    const normalized = status?.toLowerCase();
    switch (normalized) {
      case 'maintenance':
        return 'maintenance';
      case 'inactive':
      case 'occupied':
        return 'inactive';
      default:
        return 'active';
    }
  }
}
