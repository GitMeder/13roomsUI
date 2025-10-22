import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { NgFor, NgIf } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatNativeDateModule } from '@angular/material/core';
import { BookingPayload, Room } from '../../services/api.service';

@Component({
  selector: 'app-booking-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonModule,
    MatIconModule,
    NgFor,
    NgIf
  ],
  templateUrl: './booking-form.component.html',
  styleUrls: ['./booking-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookingFormComponent {
  private readonly fb = inject(FormBuilder);

  private readonly ensureEndAfterStart: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const start = control.get('startTime')?.value as string | null;
    const end = control.get('endTime')?.value as string | null;

    if (!start || !end) {
      return null;
    }

    const isValidRange = start < end;
    return isValidRange ? null : { invalidTimeRange: true };
  };

  @Input({ required: true }) rooms: Room[] = [];
  @Output() submitted = new EventEmitter<BookingPayload>();
  @Output() resetForm = new EventEmitter<void>();

  readonly form: FormGroup = this.fb.nonNullable.group({
    roomId: this.fb.control<number | null>(null, Validators.required),
    date: this.fb.control<Date | null>(null, Validators.required),
    startTime: this.fb.control<string>('', Validators.required),
    endTime: this.fb.control<string>('', Validators.required),
    name: this.fb.control<string>('', [Validators.required, Validators.minLength(2)]),
    comment: this.fb.control<string>(''),
  }, { validators: this.ensureEndAfterStart });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();

    this.submitted.emit({
      roomId: value.roomId!,
      date: value.date!.toISOString(),
      startTime: value.startTime,
      endTime: value.endTime,
      name: value.name,
      comment: value.comment?.trim() || undefined
    });
  }

  reset(): void {
    this.form.reset();
    this.resetForm.emit();
  }
}
