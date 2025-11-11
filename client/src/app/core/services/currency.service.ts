// src/app/core/services/currency.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type CurrencyCode = 'INR' | 'USD';

@Injectable({ providedIn: 'root' })
export class CurrencyService {
  private codeSubject = new BehaviorSubject<CurrencyCode>('USD');
  code$ = this.codeSubject.asObservable();

  get code(): CurrencyCode {
    return this.codeSubject.value;
  }

  get symbol(): string {
    return this.code === 'INR' ? '₹' : '$';
  }

  /**
   * Set currency.
   * - If explicit code passed → use it.
   * - Else derive from country:
   *     IN  / "india"/"bharat" → INR
   *     US/CA/AU (and their common names) → USD
   * - Fallback → USD
   */
  setCurrency(code?: CurrencyCode, country?: string | null | undefined) {
    if (code === 'INR' || code === 'USD') {
      this.codeSubject.next(code);
      return;
    }

    const c = (country || '').trim().toLowerCase();
    if (!c) {
      this.codeSubject.next('USD');
      return;
    }

    if (c === 'in' || c === 'india' || c === 'bharat') {
      this.codeSubject.next('INR');
      return;
    }

    if (
      c === 'us' ||
      c === 'usa' ||
      c === 'united states' ||
      c === 'united states of america' ||
      c === 'ca' ||
      c === 'canada' ||
      c === 'au' ||
      c === 'aus' ||
      c === 'australia'
    ) {
      this.codeSubject.next('USD');
      return;
    }

    this.codeSubject.next('USD');
  }
}
