import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, map, tap } from 'rxjs';

interface AuthApiResponse {
  message: string;
  token: string;
  user: AuthUser;
}

export interface AuthUser {
  id: number;
  email: string;
  firstname: string;
  surname: string;
  role: 'user' | 'admin';
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:3000/api/auth';
  private readonly tokenKey = 'auth_token';
  private readonly userKey = 'auth_user';

  private readonly currentUserSubject = new BehaviorSubject<AuthUser | null>(this.readStoredUser());
  readonly currentUser$ = this.currentUserSubject.asObservable();

  get currentUserSnapshot(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  get token(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  login(email: string, password: string): Observable<AuthUser> {
    return this.http.post<AuthApiResponse>(`${this.baseUrl}/login`, { email, password }).pipe(
      tap((response) => this.persistSession(response)),
      map((response) => response.user)
    );
  }

  register(payload: {
    email: string;
    firstname: string;
    surname: string;
    password: string;
    role: 'user' | 'admin';
  }): Observable<AuthUser> {
    return this.http.post<AuthApiResponse>(`${this.baseUrl}/register`, payload).pipe(
      tap((response) => this.persistSession(response)),
      map((response) => response.user)
    );
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.currentUserSubject.next(null);
  }

  private persistSession(response: AuthApiResponse): void {
    localStorage.setItem(this.tokenKey, response.token);
    localStorage.setItem(this.userKey, JSON.stringify(response.user));
    this.currentUserSubject.next(response.user);
  }

  private readStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(this.userKey);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }
}
