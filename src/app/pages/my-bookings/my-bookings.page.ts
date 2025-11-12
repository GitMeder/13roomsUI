import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../services/api.service';
import { ConfirmationDialogComponent } from '../../components/confirmation-dialog/confirmation-dialog.component';
import { RenameBookingDialogComponent } from '../../components/rename-booking-dialog/rename-booking-dialog.component';
import { FormMode, BookingFormState } from '../../models/booking-form-state.model';

interface MyBooking {
  id: number;
  room_id: number;
  room_name: string;
  room_icon: string | null;
  title: string;
  start_time: string;
  end_time: string;
  comment: string | null;
  created_by: number;
  status: string;
}

@Component({
  selector: 'app-my-bookings-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDialogModule,
    MatSnackBarModule
  ],
  providers: [DatePipe],
  templateUrl: './my-bookings.page.html',
  styleUrls: ['./my-bookings.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyBookingsPageComponent implements OnInit {
  private readonly apiService = inject(ApiService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly datePipe = inject(DatePipe);

  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly upcomingBookings = signal<MyBooking[]>([]);
  readonly pastBookings = signal<MyBooking[]>([]);
  readonly deletingBookingId = signal<number | null>(null);

  ngOnInit(): void {
    this.loadMyBookings();
  }

  private loadMyBookings(): void {
    this.loading.set(true);
    this.error.set(null);

    this.apiService.getMyBookings().subscribe({
      next: (bookings: MyBooking[]) => {
        console.log('[MyBookings] Received bookings:', bookings);
        this.groupBookings(bookings);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('[MyBookings] Error loading bookings:', err);
        this.error.set('Fehler beim Laden der Buchungen.');
        this.loading.set(false);
      }
    });
  }

  private groupBookings(bookings: MyBooking[]): void {
    const now = new Date();
    const upcoming: MyBooking[] = [];
    const past: MyBooking[] = [];

    bookings.forEach(booking => {
      const endTime = new Date(booking.end_time);
      if (endTime >= now) {
        upcoming.push(booking);
      } else {
        past.push(booking);
      }
    });

    this.upcomingBookings.set(upcoming);
    this.pastBookings.set(past);
    console.log(`[MyBookings] Grouped: ${upcoming.length} upcoming, ${past.length} past`);
  }

  /**
   * Formats a date/time to localized date and time display
   */
  formatDateTime(dateString: string): string {
    if (!dateString) return '';

    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Check if it's today or tomorrow
    const dateStr = date.toDateString();
    const todayStr = today.toDateString();
    const tomorrowStr = tomorrow.toDateString();

    let dayLabel = '';
    if (dateStr === todayStr) {
      dayLabel = 'Heute';
    } else if (dateStr === tomorrowStr) {
      dayLabel = 'Morgen';
    } else {
      dayLabel = this.datePipe.transform(date, 'EE, d. MMM', undefined, 'de-DE') || '';
    }

    const time = this.datePipe.transform(date, 'HH:mm') || '';
    return `${dayLabel}, ${time}`;
  }

  /**
   * Formats time range (e.g., "14:00 - 15:30 Uhr")
   */
  formatTimeRange(startTime: string, endTime: string): string {
    const start = this.datePipe.transform(startTime, 'HH:mm') || '';
    const end = this.datePipe.transform(endTime, 'HH:mm') || '';
    return `${start} - ${end} Uhr`;
  }

  /**
   * Opens rename dialog for a booking
   */
  onRenameBooking(booking: MyBooking): void {
    const dialogRef = this.dialog.open(RenameBookingDialogComponent, {
      width: '500px',
      data: {
        currentTitle: booking.title,
        currentComment: booking.comment
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        console.log('[MyBookings] Renaming booking:', result);
        this.apiService.updateBooking(booking.id, result).subscribe({
          next: () => {
            this.snackBar.open('Buchung erfolgreich umbenannt', 'OK', {
              duration: 3000,
              panelClass: ['success-snackbar']
            });
            this.loadMyBookings(); // Reload to show updated data
          },
          error: (err) => {
            console.error('[MyBookings] Error renaming booking:', err);
            this.snackBar.open('Fehler beim Umbenennen der Buchung', 'OK', {
              duration: 5000,
              panelClass: ['error-snackbar']
            });
          }
        });
      }
    });
  }

  /**
   * Navigates to booking form with pre-filled data for rescheduling
   */
  onRescheduleBooking(booking: MyBooking): void {
    console.log('[MyBookings] Rescheduling booking:', booking);

    // Create BookingFormState for RESCHEDULE mode
    const formState: BookingFormState = {
      mode: FormMode.RESCHEDULE,
      roomId: booking.room_id,
      data: {
        date: this.datePipe.transform(booking.start_time, 'yyyy-MM-dd') || '',
        startTime: this.datePipe.transform(booking.start_time, 'HH:mm') || '',
        endTime: this.datePipe.transform(booking.end_time, 'HH:mm') || '',
        title: booking.title,
        comment: booking.comment,
        bookingId: booking.id
      }
    };

    // Verify the data before navigation
    console.log('[MyBookings] BookingFormState being passed:', formState);

    // Navigate to the booking page, passing the formState in the router state
    this.router.navigate(['/bookings', booking.room_id], {
      state: { formState }
    });

    console.log('[MyBookings] Navigation initiated with new state machine API');
  }

  /**
   * Opens confirmation dialog and deletes booking
   */
  onDeleteBooking(booking: MyBooking): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Buchung löschen?',
        message: `Möchten Sie die Buchung "${booking.title}" wirklich löschen?`,
        confirmText: 'Löschen',
        cancelText: 'Abbrechen'
      }
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.deletingBookingId.set(booking.id);

        this.apiService.deleteBooking(booking.id).subscribe({
          next: () => {
            this.snackBar.open('Buchung erfolgreich gelöscht', 'OK', {
              duration: 3000,
              panelClass: ['success-snackbar']
            });
            this.deletingBookingId.set(null);
            this.loadMyBookings(); // Reload bookings list
          },
          error: (err) => {
            console.error('[MyBookings] Error deleting booking:', err);
            this.snackBar.open('Fehler beim Löschen der Buchung', 'OK', {
              duration: 5000,
              panelClass: ['error-snackbar']
            });
            this.deletingBookingId.set(null);
          }
        });
      }
    });
  }

  /**
   * Navigates back to dashboard
   */
  goBack(): void {
    this.router.navigate(['/']);
  }
}
