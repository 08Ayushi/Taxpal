import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyService } from '@/app/core/services/currency.service';

type ExpensePayload = {
  description: string;
  amount: number | null;
  category: string;
  date: string;
  notes: string;
};

export type ExpenseEmit = Omit<ExpensePayload, 'amount'> & { amount: number };

@Component({
  selector: 'app-expense-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './expense-modal.html',
  styleUrls: ['./expense.css']
})
export class ExpenseModalComponent {
  @Input() isOpen = false;
  @Output() closeModal = new EventEmitter<void>();
  @Output() save = new EventEmitter<ExpenseEmit>();

  constructor(public currencyService: CurrencyService) {}

  formData: ExpensePayload = {
    description: '',
    amount: null,
    category: '',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  };

  onClose() {
    this.closeModal.emit();
    this.resetForm();
  }

  onSave() {
    const d = this.formData;
    if (d.description?.trim() && d.amount != null && d.amount > 0 && d.category && d.date) {
      const emitPayload: ExpenseEmit = {
        description: d.description.trim(),
        amount: d.amount as number,
        category: d.category,
        date: d.date,
        notes: d.notes
      };
      this.save.emit(emitPayload);
      this.onClose();
    }
  }

  blockInvalidAmountKeys(evt: KeyboardEvent) {
    const blocked = ['-', '+', 'e', 'E'];
    if (blocked.includes(evt.key)) evt.preventDefault();
  }

  onAmountInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const cleaned = input.value.replace(/-/g, '');
    input.value = cleaned;

    const n = parseFloat(cleaned);
    if (!Number.isFinite(n)) {
      this.formData.amount = null;
      return;
    }
    this.formData.amount = Math.max(0, n);
  }

  private resetForm() {
    this.formData = {
      description: '',
      amount: null,
      category: '',
      date: new Date().toISOString().split('T')[0],
      notes: ''
    };
  }
}
