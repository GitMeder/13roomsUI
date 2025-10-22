import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, delay, of, throwError } from 'rxjs';

export interface Room {
  id: number;
  name: string;
  capacity: number;
  location: string;
  amenities: string[];
  status: 'available' | 'occupied' | 'maintenance';
}

export interface BookingPayload {
  roomId: number;
  date: string;
  startTime: string;
  endTime: string;
  name: string;
  comment?: string;
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
      status: 'available'
    },
    {
      id: 2,
      name: 'Atlas',
      capacity: 12,
      location: '2. Etage · Ostflügel',
      amenities: ['Videokonferenz', 'Projektor', 'Höhenverstellbare Tische'],
      status: 'occupied'
    },
    {
      id: 3,
      name: 'Nova',
      capacity: 4,
      location: 'EG · Nord',
      amenities: ['Whiteboard', 'Ruhezonen-Licht', 'USB-C Charging'],
      status: 'maintenance'
    }
  ];

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
      catchError((error) => throwError(() => error))
    );
  }

  post<T>(endpoint: string, body: unknown, options?: {
    headers?: HttpHeaders | {
      [header: string]: string | string[];
    };
  }): Observable<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    return this.http.post<T>(url, body, options).pipe(
      catchError((error) => throwError(() => error))
    );
  }

  put<T>(endpoint: string, body: unknown, options?: {
    headers?: HttpHeaders | {
      [header: string]: string | string[];
    };
  }): Observable<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    return this.http.put<T>(url, body, options).pipe(
      catchError((error) => throwError(() => error))
    );
  }

  delete<T>(endpoint: string, options?: {
    headers?: HttpHeaders | {
      [header: string]: string | string[];
    };
  }): Observable<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    return this.http.delete<T>(url, options).pipe(
      catchError((error) => throwError(() => error))
    );
  }

  getRooms(): Observable<Room[]> {
    // Attempt to reach the real API first, otherwise fall back to the mock data.
    return this.get<Room[]>('rooms').pipe(
      catchError(() => of(this.mockRooms).pipe(delay(300)))
    );
  }

  createBooking(payload: BookingPayload): Observable<BookingPayload> {
    // Submit to the backend in production; the mock keeps the flow interactive for now.
    return this.post<BookingPayload>('bookings', payload).pipe(
      catchError(() =>
        of(payload).pipe(
          delay(300)
        )
      )
    );
  }
}
