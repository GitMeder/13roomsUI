import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';

export type AuthPromptResult =
  | 'register'
  | 'cancel'
  | { action: 'continue'; guestName: string };

/**
 * AuthPromptDialogComponent - Soft wall dialog for guest users
 *
 * Prompts guests to create an account before completing their booking,
 * with the option to continue as a guest (after providing name) or cancel.
 */
@Component({
  selector: 'app-auth-prompt-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule
  ],
  templateUrl: './auth-prompt-dialog.component.html',
  styleUrls: ['./auth-prompt-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AuthPromptDialogComponent {
  readonly showNameInput = signal<boolean>(false);

  readonly guestForm = new FormGroup({
    name: new FormControl('', [Validators.required, Validators.minLength(2)])
  });

  constructor(
    private readonly dialogRef: MatDialogRef<AuthPromptDialogComponent, AuthPromptResult>
  ) {}

  onRegister(): void {
    this.dialogRef.close('register');
  }

  onContinueAsGuest(): void {
    // First click: show name input
    if (!this.showNameInput()) {
      this.showNameInput.set(true);
      return;
    }

    // Second click: validate and submit
    if (this.guestForm.invalid) {
      this.guestForm.markAllAsTouched();
      return;
    }

    const guestName = this.guestForm.value.name!;
    this.dialogRef.close({ action: 'continue', guestName });
  }

  onCancel(): void {
    this.dialogRef.close('cancel');
  }
}
