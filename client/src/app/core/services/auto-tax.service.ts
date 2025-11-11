import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface TaxSlabLine {
  from: number;
  to: number | null;
  rate: number;           // 0.05 => 5%
  taxablePortion: number;
  tax: number;
}

export interface TaxScheduleItem {
  id: string;
  label: string;          // e.g. "Q1 2025"
  period: string;         // e.g. "Apr - Jun 2025"
  dueDate: string;        // ISO string from backend
  amount: number;
}

export interface AutoTaxSummary {
  totalIncome: number;
  totalExpenses: number;
  taxableIncome: number;
  taxPayable: number;
  noTax: boolean;
  noTaxMessage?: string;
  slabs: TaxSlabLine[];
  schedule: TaxScheduleItem[];
  financialYear: string;
}

@Injectable({ providedIn: 'root' })
export class AutoTaxService {
  // Use the same pattern as your other services
  private readonly BASE = `/api/v1/tax/auto`;

  constructor(private http: HttpClient) {}

  getSummary(): Observable<AutoTaxSummary> {
    return this.http.get<AutoTaxSummary>(`${this.BASE}/summary`);
  }

  markReminderPaid(id: string): Observable<{ message: string; id: string }> {
    return this.http.patch<{ message: string; id: string }>(
      `${this.BASE}/reminders/${encodeURIComponent(id)}/mark-paid`,
      {}
    );
  }
}
