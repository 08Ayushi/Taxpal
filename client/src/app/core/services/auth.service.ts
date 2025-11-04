// src/app/core/services/auth.service.ts
import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { environment } from 'src/environments/environment';

export interface User {
  id: string;
  name: string;
  email: string;
  country?: string;
  income_bracket?: 'low' | 'middle' | 'high';
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

export interface LoginRequest { email: string; password: string; }
export interface RegisterRequest {
  name: string; email: string; password: string;
  country?: string; income_bracket?: 'low' | 'middle' | 'high';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'token';
  private readonly USER_KEY  = 'user';

  // Build a clean base:
  // - production: environment.API_URL MUST be 'https://taxpal-8.onrender.com'
  // - dev: environment.API_URL can be 'http://localhost:3000'
  // We append `/api/v1/auth` exactly once here.
  private readonly BASE = (() => {
    const root = (environment as any)?.API_URL
      ? String((environment as any).API_URL).replace(/\/+$/, '')
      : '';
    return `${root}/api/v1/auth`;
  })();

  private tokenSubject = new BehaviorSubject<string | null>(null);
  private currentUserSubject = new BehaviorSubject<User | null>(null);

  /** Streams */
  public token$ = this.tokenSubject.asObservable();
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.loadFromStorage();
  }

  // ---------- Auth actions ----------
  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.BASE}/login`, credentials).pipe(
      tap(res => this.saveAuth(res))
    );
  }

  register(userData: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.BASE}/register`, userData).pipe(
      tap(res => this.saveAuth(res))
    );
  }

  forgotPassword(email: string) {
    return this.http.post<{ message: string }>(`${this.BASE}/forgot-password`, { email });
  }

  resetPassword(token: string, password: string) {
    return this.http.post<AuthResponse>(`${this.BASE}/reset-password`, { token, password })
      .pipe(tap(res => this.saveAuth(res)));
  }

  /** Uses your auth middleware to return the user from token */
  verifyToken(): Observable<{ user: User }> {
    return this.http.get<{ user: User }>(`${this.BASE}/me`).pipe(
      tap(r => this.saveUser(r.user))
    );
  }

  logout(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
    }
    this.tokenSubject.next(null);
    this.currentUserSubject.next(null);
    this.router.navigate(['/login']);
  }

  // ---------- Consumers rely on these ----------
  getToken(): string | null {
    return isPlatformBrowser(this.platformId) ? localStorage.getItem(this.TOKEN_KEY) : null;
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  // ---------- Storage helpers ----------
  private saveAuth(res: AuthResponse) {
    this.setToken(res.token);
    this.saveUser(res.user);
  }

  private setToken(token: string) {
    if (isPlatformBrowser(this.platformId)) localStorage.setItem(this.TOKEN_KEY, token);
    this.tokenSubject.next(token);
  }

  private saveUser(user: User) {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    }
    this.currentUserSubject.next(user);
  }

  private loadFromStorage() {
    if (!isPlatformBrowser(this.platformId)) return;
    const token = localStorage.getItem(this.TOKEN_KEY);
    const userStr = localStorage.getItem(this.USER_KEY);

    if (token) this.tokenSubject.next(token);
    if (userStr) {
      try { this.currentUserSubject.next(JSON.parse(userStr) as User); }
      catch { /* corrupted storage */ this.logout(); }
    }
  }
}
