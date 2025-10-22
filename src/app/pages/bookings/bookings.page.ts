import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NgIf } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService, BookingPayload, BookingResponse, Room } from '../../services/api.service';
import { BookingFormComponent } from '../../components/booking-form/booking-form.component';

@Component({
  selector: 'app-bookings-page',
  standalone: true,
  imports: [
    NgIf,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    BookingFormComponent
  ],
  templateUrl: './bookings.page.html',
  styleUrls: ['./bookings.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookingsPageComponent {
  private readonly api = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);

  readonly rooms = signal<Room[]>([]);
  readonly roomsLoading = signal<boolean>(true);
  readonly roomsError = signal<string | null>(null);
  readonly bookingInFlight = signal<boolean>(false);

  constructor() {
    this.loadRooms();
  }

  handleBooking(payload: BookingPayload): void {
    // Persist the booking; once the backend is live this will call the real endpoint.
    this.bookingInFlight.set(true);

    this.api.createBooking(payload)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (response: BookingResponse) => {
          this.bookingInFlight.set(false);
          const message = response?.message ?? 'Buchung gespeichert.';
          this.snackBar.open(message, 'Schließen', {
            duration: 4000,
            panelClass: ['snackbar-success']
          });
        },
        error: () => {
          this.bookingInFlight.set(false);
          this.snackBar.open('Die Buchung konnte nicht gespeichert werden.', 'Erneut versuchen', {
            duration: 5000,
            panelClass: ['snackbar-error']
          });
        }
      });
  }

  resetFeedback(): void {
    this.snackBar.dismiss();
  }

  private loadRooms(): void {
    this.roomsLoading.set(true);
    this.roomsError.set(null);

    this.api.getRooms()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (rooms) => {
          this.rooms.set(rooms);
          this.roomsLoading.set(false);
        },
        error: () => {
          this.roomsError.set('Die Räume konnten nicht geladen werden. Bitte versuchen Sie es später erneut.');
          this.roomsLoading.set(false);
        }
      });
  }
}
