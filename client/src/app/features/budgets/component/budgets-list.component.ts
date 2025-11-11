import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { BudgetsComponent } from './budgets.component';
import { BudgetService, BudgetDTO } from '../../../core/services/budget.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-budgets-list',
  standalone: true,
  imports: [
    CommonModule,
    HttpClientModule,
    FormsModule,
    MatSnackBarModule,
    BudgetsComponent
  ],
  templateUrl: './budgets-list.component.html',
  styleUrls: ['./budgets-list.component.css'],
})
export class BudgetsListComponent implements OnInit {
  loading = false;
  showForm = false;

  rows: BudgetDTO[] = [];
  total = 0;

  limit = 20;
  skip = 0;

  month = '';     // 'YYYY-MM'
  category = '';

  // Display currency symbol (based on user country; defaults to $)
  currencySymbol = '$';

  private reloadTick = signal(0);

  constructor(
    private api: BudgetService,
    private snack: MatSnackBar,
    private auth: AuthService
  ) {
    this.currencySymbol = this.resolveCurrencySymbol();
  }

  ngOnInit(): void {
    this.fetch();
  }

  fetch(): void {
    this.loading = true;
    this.api.list({
      month: this.month || undefined,
      category: this.category || undefined,
      limit: this.limit,
      skip: this.skip,
    })
    .subscribe({
      next: (data) => {
        this.rows = Array.isArray(data) ? data : [];
        this.total = this.rows.length;
        this.loading = false;
      },
      error: (e: HttpErrorResponse) => {
        this.loading = false;
        console.error('[budgets:list] failed', e);
        this.snack.open('Failed to load budgets', 'Dismiss', {
          duration: 3000,
          panelClass: ['snack-error'],
        });
      },
    });
  }

  openForm(): void {
    this.showForm = true;
  }

  onFormClosed(): void {
    this.showForm = false;
    this.fetch();
  }

  clearFilters(): void {
    this.month = '';
    this.category = '';
    this.skip = 0;
    this.fetch();
  }

  delete(row: BudgetDTO): void {
    if (!row?._id) return;
    const yes = confirm(`Delete budget "${row.category}" for ${row.month}?`);
    if (!yes) return;

    this.api.remove(row._id).subscribe({
      next: () => {
        this.snack.open('Budget deleted', 'Close', {
          duration: 2000,
          panelClass: ['snack-success'],
        });
        this.fetch();
      },
      error: (e: HttpErrorResponse) => {
        console.error('[budgets:delete] failed', e);
        this.snack.open('Failed to delete budget', 'Dismiss', {
          duration: 3000,
          panelClass: ['snack-error'],
        });
      },
    });
  }

  trackById = (_: number, r: BudgetDTO) => r?._id;

  /** Determine currency symbol from the authenticated user's country. */
  private resolveCurrencySymbol(): string {
    try {
      const user = this.auth.getCurrentUser?.() ?? null;
      const country = (user?.country || '').toString().trim().toLowerCase();

      switch (country) {
        case 'india':
        case 'in':
          return '₹';
        case 'united kingdom':
        case 'uk':
        case 'gb':
        case 'great britain':
          return '£';
        case 'eurozone':
        case 'de':
        case 'fr':
        case 'es':
        case 'it':
        case 'ie':
        case 'nl':
        case 'be':
        case 'pt':
        case 'fi':
        case 'at':
        case 'gr':
        case 'lu':
        case 'si':
        case 'sk':
        case 'lv':
        case 'lt':
        case 'ee':
        case 'cy':
          return '€';
        case 'canada':
        case 'ca':
          return 'CA$';
        case 'australia':
        case 'au':
          return 'A$';
        case 'new zealand':
        case 'nz':
          return 'NZ$';
        default:
          return '$';
      }
    } catch {
      return '$';
    }
  }
}
