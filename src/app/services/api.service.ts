import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, delay, map, of, throwError, switchMap } from 'rxjs';
import { Room } from '../models/room.model';
import { Booking, BookingPayload } from '../models/booking.model';
import { ErrorHandlingService } from '../core/services/error-handling.service';
import { environment } from '@env/environment';
import {
  RawBookingResponse,
  BookingWithRoomInfo,
  ApiUser,
  GetUsersResponse,
  UserResponse
} from '../models/api-responses.model';

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

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly errorHandler = inject(ErrorHandlingService);
  private readonly baseUrl = environment.apiUrl;

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
    return this.http.get<T>(url, options).pipe(
      catchError((error) => this.errorHandler.handleHttpError(error, `GET ${endpoint}`))
    );
  }

  post<T>(endpoint: string, body: unknown, options?: {
    headers?: HttpHeaders | {
      [header: string]: string | string[];
    };
  }): Observable<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    return this.http.post<T>(url, body, options).pipe(
      catchError((error) => this.errorHandler.handleHttpError(error, `POST ${endpoint}`))
    );
  }

  put<T>(endpoint: string, body: unknown, options?: {
    headers?: HttpHeaders | {
      [header: string]: string | string[];
    };
  }): Observable<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    return this.http.put<T>(url, body, options).pipe(
      catchError((error) => this.errorHandler.handleHttpError(error, `PUT ${endpoint}`))
    );
  }

  delete<T>(endpoint: string, options?: {
    headers?: HttpHeaders | {
      [header: string]: string | string[];
    };
  }): Observable<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    return this.http.delete<T>(url, options).pipe(
      catchError((error) => this.errorHandler.handleHttpError(error, `DELETE ${endpoint}`))
    );
  }

  getRooms(): Observable<Room[]> {
    return this.get<ApiRoom[]>('rooms').pipe(
      map((rooms) => rooms.map((room) => this.normalizeRoom(room)))
    );
  }

  createRoom(roomData: CreateRoomPayload): Observable<Room> {
    return this.post<Room>('rooms', roomData);
  }

  getMyBookings(): Observable<BookingWithRoomInfo[]> {
    return this.get<BookingWithRoomInfo[]>('bookings/my-bookings');
  }

  updateBooking(id: number, payload: { title: string; comment?: string | null }): Observable<{ message: string }> {
    return this.put<{ message: string }>(`bookings/${id}`, payload);
  }

  rescheduleBooking(id: number, payload: BookingPayload): Observable<{ message: string }> {

    const requestBody = {
      room_id: payload.roomId,
      title: payload.title,
      start_time: this.combineDateAndTime(payload.date, payload.startTime),
      end_time: this.combineDateAndTime(payload.date, payload.endTime),
      comment: payload.comment?.trim() || null
    };

    return this.put<{ message: string }>(`bookings/${id}`, requestBody);
  }

  deleteBooking(id: number): Observable<void> {
    return this.delete<void>(`bookings/${id}`);
  }

  getAllBookings(): Observable<BookingWithRoomInfo[]> {
    return this.get<BookingWithRoomInfo[]>('bookings');
  }

  updateRoom(id: number, payload: UpdateRoomPayload): Observable<Room> {
    return this.put<{ message: string; room: ApiRoom }>(`rooms/${id}`, payload).pipe(
      map(response => this.normalizeRoom(response.room))
    );
  }

  deleteRoom(id: number): Observable<void> {
    return this.delete<void>(`rooms/${id}`);
  }

  getRoomBookings(roomId: number, date?: string): Observable<Booking[]> {

    if (date) {
      const params = new HttpParams().set('date', date);
      return this.get<RawBookingResponse[]>(`bookings/room/${roomId}`, { params }).pipe(
        map((rows) =>
          rows
            .map((raw) => this.mapBooking(raw))
            .filter((booking): booking is Booking => booking !== null)
        )
      );
    }

    return this.get<RawBookingResponse[]>(`bookings/room/${roomId}`).pipe(
      map((rows) =>
        rows
          .map((raw) => this.mapBooking(raw))
          .filter((booking): booking is Booking => booking !== null)
      )
    );
  }

  checkBookingConflict(roomId: number, date: string, startTime: string, endTime: string): Observable<Booking | null> {

    // Call the backend API to check for conflicts
    const params = new HttpParams()
      .set('date', date)
      .set('startTime', startTime)
      .set('endTime', endTime);

    return this.http
      .get<RawBookingResponse | null>(`${this.baseUrl}/bookings/check-conflict/${roomId}`, { params })
      .pipe(
        map((raw) => this.mapBooking(raw)),
        catchError(error => this.errorHandler.handleHttpErrorSilently(error, 'Checking booking conflict', null))
      );
  }

  getRoom(roomId: number): Observable<Room> {
    return this.http.get<ApiRoom>(`${this.baseUrl}/rooms/${roomId}`).pipe(
      map((room) => this.normalizeRoom(room)),
      catchError(err => this.errorHandler.handleHttpError(err, `Loading room ${roomId}`))
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

  getAvailableRooms(date: string, startTime: string, endTime: string): Observable<Room[]> {

    const params = new HttpParams()
      .set('date', date)
      .set('startTime', startTime)
      .set('endTime', endTime);

    return this.get<ApiRoom[]>('rooms/available', { params }).pipe(
      map((rooms) => rooms.map((room) => this.normalizeRoom(room))),
      catchError((error) => this.errorHandler.handleHttpErrorSilently(error, 'Loading available rooms', []))
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

  private mapBooking(raw: RawBookingResponse | null | undefined): Booking | null {
    if (!raw) {
      return null;
    }

    const createdBy =
      typeof raw.created_by === 'number'
        ? raw.created_by
        : typeof raw.createdBy === 'number'
          ? raw.createdBy
          : null;

    const creatorFirstname: string | null =
      typeof raw.creator_firstname === 'string'
        ? raw.creator_firstname
        : typeof raw.creatorFirstname === 'string'
          ? raw.creatorFirstname
          : null;

    const creatorSurname: string | null =
      typeof raw.creator_surname === 'string'
        ? raw.creator_surname
        : typeof raw.creatorSurname === 'string'
          ? raw.creatorSurname
          : null;

    const creatorEmail: string | null =
      typeof raw.creator_email === 'string'
        ? raw.creator_email
        : typeof raw.creatorEmail === 'string'
          ? raw.creatorEmail
          : null;

    const guestName: string | null =
      typeof raw.guest_name === 'string' && raw.guest_name.trim()
        ? raw.guest_name.trim()
        : typeof raw.guestName === 'string' && raw.guestName.trim()
          ? raw.guestName.trim()
          : null;

    const createdByName = creatorFirstname || creatorSurname
      ? [creatorFirstname, creatorSurname].filter(Boolean).join(' ').trim() || null
      : null;

    return {
      id: raw.id,
      room_id: raw.room_id,
      title: raw.title ?? raw.name ?? 'Ohne Titel',
      start_time: raw.start_time,
      end_time: raw.end_time,
      comment: raw.comment ?? null,
      createdBy,
      createdByName,
      createdByEmail: creatorEmail,
      guestName
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

  /**
   * Normalizes room status to internal canonical values.
   * Maps various status representations to 'active' | 'inactive' | 'maintenance'.
   * This is the single source of truth for status normalization across the application.
   */
  toInternalStatus(status?: string | null): 'active' | 'inactive' | 'maintenance' {
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

  /**
   * Normalizes booking fields from raw API response.
   * This method handles field name variations (snake_case vs camelCase) and creates computed fields.
   * Components should use this to normalize bookings that include extra fields beyond the base Booking interface.
   *
   * @param raw - Raw booking data from API (may include extra fields like room_name, status, etc.)
   * @returns Normalized booking with standardized field names and computed fields, preserving any extra fields
   */
  normalizeBookingFields<T extends Record<string, unknown>>(raw: T): T & {
    createdBy: number | null;
    createdByName: string | null;
    createdByEmail: string | null;
    guestName: string | null;
  } {
    const createdBy =
      typeof raw['created_by'] === 'number'
        ? raw['created_by']
        : typeof raw['createdBy'] === 'number'
          ? raw['createdBy']
          : null;

    const creatorFirstname: string | null =
      typeof raw['creator_firstname'] === 'string'
        ? raw['creator_firstname']
        : typeof raw['creatorFirstname'] === 'string'
          ? raw['creatorFirstname']
          : null;

    const creatorSurname: string | null =
      typeof raw['creator_surname'] === 'string'
        ? raw['creator_surname']
        : typeof raw['creatorSurname'] === 'string'
          ? raw['creatorSurname']
          : null;

    const creatorEmail: string | null =
      typeof raw['creator_email'] === 'string'
        ? raw['creator_email']
        : typeof raw['creatorEmail'] === 'string'
          ? raw['creatorEmail']
          : null;

    const guestName: string | null =
      typeof raw['guest_name'] === 'string' && raw['guest_name'].trim()
        ? raw['guest_name'].trim()
        : typeof raw['guestName'] === 'string' && raw['guestName'].trim()
          ? raw['guestName'].trim()
          : null;

    const createdByName = creatorFirstname || creatorSurname
      ? [creatorFirstname, creatorSurname].filter(Boolean).join(' ').trim() || null
      : null;

    return {
      ...raw,
      createdBy,
      createdByName,
      createdByEmail: creatorEmail,
      guestName
    };
  }

  getAllUsers(): Observable<ApiUser[]> {
    return this.get<GetUsersResponse>('users').pipe(
      map(response => response.users)
    );
  }

  createUser(payload: {
    email: string;
    firstname: string;
    surname: string;
    password: string;
    role?: 'user' | 'admin';
    is_active?: boolean;
  }): Observable<ApiUser> {
    return this.post<UserResponse>('users', payload).pipe(
      map(response => response.user)
    );
  }

  updateUser(id: number, payload: {
    email?: string;
    firstname?: string;
    surname?: string;
    password?: string;
    role?: 'user' | 'admin';
    is_active?: boolean;
  }): Observable<ApiUser> {
    return this.put<UserResponse>(`users/${id}`, payload).pipe(
      map(response => response.user)
    );
  }

  deleteUser(id: number): Observable<void> {
    return this.delete<void>(`users/${id}`);
  }
}
