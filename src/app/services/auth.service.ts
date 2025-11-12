import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { UserRole } from '../models/enums';

interface AuthApiResponse {
  message: string;
  token: string;
  user: AuthUser;
}

export interface AuthUser {
  id?: number;
  email?: string;
  firstname?: string;
  surname?: string;
  role: UserRole;
  name?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/auth`;
  private readonly tokenKey = 'auth_token';
  private readonly userKey = 'auth_user';

  private readonly guestUser: AuthUser = { role: UserRole.GUEST };

  readonly currentUser = signal<AuthUser>(this.readStoredUser());
  readonly isGuest = computed(() => this.currentUser().role === UserRole.GUEST);
  readonly isAuthenticated = computed(() => this.currentUser().role !== UserRole.GUEST);

  get token(): string | null {
    return localStorage.getItem(this.tokenKey);
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
    role: UserRole.USER | UserRole.ADMIN;
  }): Observable<AuthUser> {
    return this.http.post<AuthApiResponse>(`${this.baseUrl}/register`, payload).pipe(
      tap((response) => this.persistSession(response)),
      map((response) => response.user)
    );
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.currentUser.set(this.guestUser);
  }

  private persistSession(response: AuthApiResponse): void {
    localStorage.setItem(this.tokenKey, response.token);
    localStorage.setItem(this.userKey, JSON.stringify(response.user));
    this.currentUser.set(response.user);
  }

  private readStoredUser(): AuthUser {
    const raw = localStorage.getItem(this.userKey);
    if (!raw) {
      return this.guestUser;
    }
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return this.guestUser;
    }
  }
}
