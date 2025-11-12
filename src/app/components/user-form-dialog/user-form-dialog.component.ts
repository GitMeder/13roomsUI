import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface UserFormData {
  id?: number;
  email?: string;
  firstname?: string;
  surname?: string;
  role?: 'user' | 'admin';
  is_active?: boolean;
}

@Component({
  selector: 'app-user-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './user-form-dialog.component.html',
  styleUrl: './user-form-dialog.component.css',
})
export class UserFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<UserFormDialogComponent>);

  readonly isEditMode: boolean;
  readonly form: FormGroup;

  constructor(@Inject(MAT_DIALOG_DATA) public data: UserFormData | null) {
    this.isEditMode = !!data?.id;

    this.form = this.fb.group({
      email: [data?.email || '', [Validators.required, Validators.email]],
      firstname: [data?.firstname || '', Validators.required],
      surname: [data?.surname || '', Validators.required],
      password: ['', this.isEditMode ? [] : [Validators.required, Validators.minLength(6)]],
      role: [data?.role || 'user', Validators.required],
      is_active: [data?.is_active !== undefined ? data.is_active : true]
    });
  }

  onSubmit(): void {
    if (this.form.valid) {
      const formValue = this.form.value;

      // Remove password if empty in edit mode
      if (this.isEditMode && !formValue.password) {
        delete formValue.password;
      }

      this.dialogRef.close(formValue);
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
