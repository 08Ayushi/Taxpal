import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface TaxSlabLine {
  from: number;
  to: number | null;
  rate: number;
  taxablePortion: number;
  tax: number;
}

export interface TaxScheduleItem {
  id: string;
  label: string;
  period: string;
  dueDate: string;
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
  private readonly BASE = `${environment.API_URL}/api/v1/tax/auto`;

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
