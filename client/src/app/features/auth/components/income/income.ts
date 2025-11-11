import { Component, EventEmitter, Output, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CurrencyService } from '@/app/core/services/currency.service';

type IncomePayload = {
  description: string;
  amount: number | null;
  category: string;
  date: string;   // yyyy-mm-dd
  notes: string;
};

@Component({
  selector: 'app-income-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './income-modal.html',
  styleUrls: ['./income-modal.css']
})
export class IncomeModalComponent {
  @Input() isOpen = false;
  @Output() closeModal = new EventEmitter<void>();
  @Output() save = new EventEmitter<IncomePayload>();

  constructor(public currencyService: CurrencyService) {}

  formData: IncomePayload = {
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
      this.save.emit({ ...d });
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
