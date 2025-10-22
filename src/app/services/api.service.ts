import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, delay, map, of, throwError } from 'rxjs';

export interface Room {
  id: number;
  name: string;
  capacity: number;
  status: 'available' | 'occupied' | 'maintenance' | string;
  location?: string | null;
  amenities?: string[] | null;
  icon?: string | null;
}

export interface BookingPayload {
  roomId: number;
  date: string;
  startTime: string;
  endTime: string;
  name: string;
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
}

interface CreateBookingRequest {
  room_id: number;
  name: string;
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

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:3000/api';

  /**
   * Mocked room list until the MySQL-backed API is ready.
   * Replace this with real API data once the backend endpoints are available.
   */
  private readonly mockRooms: Room[] = [
    {
      id: 1,
      name: 'Aurora',
      capacity: 6,
      location: '1. Etage · Westflügel',
      amenities: ['Bildschirm', 'Konferenztelefon', 'Whiteboard'],
      status: 'available',
      icon: 'meeting_room'
    },
    {
      id: 2,
      name: 'Atlas',
      capacity: 12,
      location: '2. Etage · Ostflügel',
      amenities: ['Videokonferenz', 'Projektor', 'Höhenverstellbare Tische'],
      status: 'occupied',
      icon: 'business'
    },
    {
      id: 3,
      name: 'Nova',
      capacity: 4,
      location: 'EG · Nord',
      amenities: ['Whiteboard', 'Ruhezonen-Licht', 'USB-C Charging'],
      status: 'maintenance',
      icon: 'lightbulb'
    }
  ];

  private readonly knownStatuses = new Set(['available', 'occupied', 'maintenance']);

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

  getRooms(): Observable<Room[]> {
    console.log('Fetching rooms...');
    // Attempt to reach the real API first, otherwise fall back to the mock data.
    return this.get<ApiRoom[]>('rooms').pipe(
      map((rooms) => rooms.map((room) => this.normalizeRoom(room))),
      catchError((error) => {
        console.error('Error fetching rooms, falling back to mock data:', error);
        return of(this.mockRooms).pipe(delay(300));
      })
    );
  }

  createRoom(roomData: CreateRoomPayload): Observable<Room> {
    console.log('Creating room:', roomData);
    return this.post<Room>('rooms', roomData);
  }

  deleteRoom(id: number): Observable<void> {
    console.log(`Deleting room with ID: ${id}`);
    return this.delete<void>(`rooms/${id}`);
  }

  createBooking(payload: BookingPayload): Observable<BookingResponse> {
    const requestBody: CreateBookingRequest = {
      room_id: payload.roomId,
      name: payload.name,
      start_time: this.combineDateAndTime(payload.date, payload.startTime),
      end_time: this.combineDateAndTime(payload.date, payload.endTime),
      comment: payload.comment?.trim() || null
    };

    return this.post<BookingResponse>('bookings', requestBody);
  }

  private normalizeRoom(room: ApiRoom): Room {
    const rawStatus = room.status?.toString().toLowerCase();
    const status = rawStatus && this.knownStatuses.has(rawStatus)
      ? rawStatus
      : room.status;

    const amenitiesArray = Array.isArray(room.amenities)
      ? room.amenities
      : typeof room.amenities === 'string' && room.amenities.length
        ? room.amenities.split(',').map((item) => item.trim()).filter(Boolean)
        : [];

    return {
      id: room.id,
      name: room.name,
      capacity: room.capacity,
      status: status ?? 'available',
      location: room.location ?? null,
      amenities: amenitiesArray.length ? amenitiesArray : null,
      icon: room.icon ?? null
    };
  }

  private combineDateAndTime(dateIso: string, time: string): string {
    const [datePart] = dateIso.split('T');
    const [hours, minutes] = time.split(':');
    const normalizedHours = hours?.padStart(2, '0') ?? '00';
    const normalizedMinutes = minutes?.padStart(2, '0') ?? '00';
    return `${datePart ?? ''} ${normalizedHours}:${normalizedMinutes}:00`;
  }
}