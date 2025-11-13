import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

export interface RenameBookingDialogData {
  currentTitle: string;
  currentComment: string | null;
}

export interface RenameBookingDialogResult {
  title: string;
  comment: string | null;
}

@Component({
  selector: 'app-rename-booking-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule
  ],
  templateUrl: './rename-booking-dialog.component.html',
  styleUrls: ['./rename-booking-dialog.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RenameBookingDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<RenameBookingDialogComponent>);
  private readonly data = inject<RenameBookingDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);

  readonly form: FormGroup;

  constructor() {
    this.form = this.fb.group({
      title: [this.data.currentTitle, [Validators.required, Validators.minLength(2)]],
      comment: [this.data.currentComment || '']
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    if (this.form.valid) {
      const result: RenameBookingDialogResult = {
        title: this.form.value.title.trim(),
        comment: this.form.value.comment?.trim() || null
      };
      this.dialogRef.close(result);
    }
  }
}
