import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  AbstractControl,
  ValidationErrors
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService, RegisterRequest } from '@/app/core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent {
  registerForm: FormGroup;
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  showPassword = signal(false);
  showConfirmPassword = signal(false);

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.registerForm = this.fb.group(
      {
        name: ['', [Validators.required, Validators.minLength(2)]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(8)]],
        confirmPassword: ['', [Validators.required]],
        country: ['US', [Validators.required]],
        income_bracket: ['middle', [Validators.required]],
      },
      { validators: this.passwordMatchValidator }
    );
  }

  /** Cross-field validator to ensure password & confirmPassword match */
  private passwordMatchValidator = (control: AbstractControl): ValidationErrors | null => {
    const group = control as FormGroup;
    const password = group.get('password');
    const confirmPassword = group.get('confirmPassword');
    if (!password || !confirmPassword) return null;

    const mismatch =
      !!password.value &&
      !!confirmPassword.value &&
      password.value !== confirmPassword.value;

    if (mismatch) {
      const existing = confirmPassword.errors || {};
      confirmPassword.setErrors({ ...existing, passwordMismatch: true });
      return { passwordMismatch: true };
    } else {
      // remove only passwordMismatch, preserve other errors if any
      if (confirmPassword.errors && confirmPassword.errors['passwordMismatch']) {
        const { passwordMismatch, ...rest } = confirmPassword.errors;
        const nextErrors = Object.keys(rest).length ? rest : null;
        confirmPassword.setErrors(nextErrors);
      }
      return null;
    }
  };

  onSubmit(): void {
    if (this.registerForm.invalid) {
      this.markFormGroupTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const v = this.registerForm.value;

    const registerData: RegisterRequest = {
      name: v.name,
      email: v.email,
      password: v.password,
      country: v.country,
      income_bracket: v.income_bracket,
    };

    this.authService.register(registerData).subscribe({
      next: () => {
        this.isLoading.set(false);
        // AuthService already stores token+user; go straight to dashboard
        this.router.navigate(['/dashboard']);
      },
      error: (error: any) => {
        this.isLoading.set(false);
        const msg = error?.error?.message;

        this.errorMessage.set(
          msg === 'User already exists'
            ? 'An account with this email already exists. Try signing in instead.'
            : msg || 'Registration failed. Please try again.'
        );
      }
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword.set(!this.showPassword());
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword.set(!this.showConfirmPassword());
  }

  private markFormGroupTouched(): void {
    Object.keys(this.registerForm.controls).forEach(key => {
      this.registerForm.get(key)?.markAsTouched();
    });
  }

  getFieldError(fieldName: string): string | null {
    const field = this.registerForm.get(fieldName);
    if (field?.errors && (field.touched || field.dirty)) {
      if (field.errors['required']) {
        return `${this.prettyName(fieldName)} is required`;
      }
      if (field.errors['email']) {
        return 'Please enter a valid email address';
      }
      if (field.errors['minlength']) {
        if (fieldName === 'password') {
          return 'Password must be at least 8 characters long';
        }
        const len = field.errors['minlength'].requiredLength;
        return `${this.prettyName(fieldName)} must be at least ${len} characters long`;
      }
      if (field.errors['passwordMismatch']) {
        return 'Passwords do not match';
      }
    }
    return null;
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.registerForm.get(fieldName);
    return !!(field && field.invalid && (field.touched || field.dirty));
  }

  private prettyName(field: string): string {
    if (field === 'income_bracket') return 'Income bracket';
    if (field === 'confirmPassword') return 'Confirm password';
    return field.charAt(0).toUpperCase() + field.slice(1);
  }
}
