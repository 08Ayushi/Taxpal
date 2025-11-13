import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { CurrencyCode } from '@/app/core/services/currency.service';

export type IncomeBracket = 'low' | 'middle' | 'high';
export type AllowedCountry = 'US' | 'CA' | 'IN' | 'AU';

export interface Profile {
  id: string;
  name: string;
  email: string;
  country: AllowedCountry;
  income_bracket: IncomeBracket;
  currency: CurrencyCode; // <- comes from backend, derived from country
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private http = inject(HttpClient);
  private base = '/api/v1/auth/me';

  getMe(): Observable<Profile> {
    return this.http.get<{ success: boolean; data: Profile }>(this.base).pipe(
      map((r) => r.data)
    );
  }

  updateMe(
    input: Partial<Pick<Profile, 'name' | 'email' | 'country' | 'income_bracket'>>
  ): Observable<Profile> {
    return this.http
      .put<{ success: boolean; data: Profile }>(this.base, input)
      .pipe(map((r) => r.data));
  }
}
