import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { BudgetsListComponent } from '../../../budgets/component/budgets-list.component';
import {
  AutoTaxService,
  AutoTaxSummary,
  TaxScheduleItem,
  TaxSlabLine,
} from '../../../../core/services/auto-tax.service';
import { AuthService, User } from '../../../../core/services/auth.service';
import { CurrencyService } from '../../../../core/services/currency.service';

interface DisplayState {
  totalIncome: number;
  totalExpenses: number;
  taxableIncome: number;
  taxPayable: number;
}

@Component({
  selector: 'app-automatic-tax-calculator',
  standalone: true,
  imports: [CommonModule, RouterLink, BudgetsListComponent],
  templateUrl: './automatic-tax-calculator.component.html',
  styleUrls: ['./automatic-tax-calculator.component.css'],
})
export class AutomaticTaxCalculatorComponent implements OnInit {
  user: User | null = null;

  mobileNavOpen = false;
  showBudget = false;

  loading = false;
  error: string | null = null;

  display: DisplayState = {
    totalIncome: 0,
    totalExpenses: 0,
    taxableIncome: 0,
    taxPayable: 0,
  };

  slabs: TaxSlabLine[] = [];
  schedule: TaxScheduleItem[] = [];
  noTaxMessage = '';

  constructor(
    private autoTax: AutoTaxService,
    public auth: AuthService,
    public currencyService: CurrencyService
  ) {
    this.auth.currentUser$.subscribe((u) => (this.user = u));
    this.user = this.auth.getCurrentUser();
  }

  ngOnInit(): void {
    this.loadSummary();
  }

  private loadSummary(): void {
    this.loading = true;
    this.error = null;

    this.autoTax.getSummary().subscribe({
      next: (res: AutoTaxSummary) => {
        this.display = {
          totalIncome: res.totalIncome || 0,
          totalExpenses: res.totalExpenses || 0,
          taxableIncome: res.taxableIncome || 0,
          taxPayable: res.taxPayable || 0,
        };
        this.slabs = res.slabs || [];
        this.schedule = res.schedule || [];

        const sym = this.currencyService.symbol;

        this.noTaxMessage =
          res.noTax && res.noTaxMessage
            ? res.noTaxMessage
            : res.noTax
            ? `No Tax Payable — Your taxable income of ${sym}${this.formatAmount(
                res.taxableIncome
              )} is below the threshold of ${sym}${this.formatAmount(
                1200000
              )}. No tax is due.`
            : '';

        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load automatic tax summary';
        this.loading = false;
      },
    });
  }

  // ===== Currency formatting helpers =====

  private getLocale(): string {
    // Match currency to sensible formatting.
    // INR → Indian grouping; USD (US/CA/AU) → standard US.
    return this.currencyService.code === 'INR' ? 'en-IN' : 'en-US';
  }

  formatAmount(value: number | null | undefined): string {
    const n =
      typeof value === 'number' && Number.isFinite(value) ? value : 0;

    return n.toLocaleString(this.getLocale(), {
      maximumFractionDigits: 0,
    });
  }

  // Legacy name kept in case anything else calls it
  asInr(value: number | null | undefined): string {
    return this.formatAmount(value);
  }

  // ===== UI helpers =====

  get firstInitial(): string {
    const s = (this.user?.name || this.user?.email || 'U').trim();
    return s ? s[0].toUpperCase() : 'U';
  }

  get secondInitial(): string {
    const n = this.user?.name?.trim();
    if (!n) return '';
    const parts = n.split(/\s+/);
    return (parts[1]?.[0] ?? '').toUpperCase();
  }

  toggleMobileNav(): void {
    this.mobileNavOpen = !this.mobileNavOpen;
    this.lockScroll(this.mobileNavOpen || this.showBudget);
  }

  closeMobileNav(): void {
    this.mobileNavOpen = false;
    this.lockScroll(this.showBudget);
  }

  closeMobileNavIfSmall(): void {
    if (window.innerWidth <= 1024) this.closeMobileNav();
  }

  openBudget(): void {
    this.showBudget = true;
    this.lockScroll(true);
  }

  closeBudget(): void {
    this.showBudget = false;
    this.lockScroll(this.mobileNavOpen);
  }

  onClose(): void {
    // Treat as overlay: go back to previous page
    window.history.back();
  }

  private lockScroll(lock: boolean) {
    try {
      document.body.style.overflow = lock ? 'hidden' : '';
    } catch {
      // ignore
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (this.showBudget) this.closeBudget();
      else if (this.mobileNavOpen) this.closeMobileNav();
    }
  }

  @HostListener('window:resize')
  onResize() {
    if (window.innerWidth > 1024 && this.mobileNavOpen) {
      this.closeMobileNav();
    }
  }

  // ===== Tax calendar actions =====

  markAsPaid(item: TaxScheduleItem): void {
    if (!item?.id) return;
    this.autoTax.markReminderPaid(item.id).subscribe({
      next: () => {
        this.schedule = this.schedule.filter((x) => x.id !== item.id);
      },
      error: () => {
        // optionally: this.error = 'Failed to mark as paid';
      },
    });
  }
}
