import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { formatDateTime, formatTimeRange, formatToYYYYMMDD, formatToHHMM } from '../../utils/date-time.utils';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../services/api.service';
import { ErrorHandlingService } from '../../core/services/error-handling.service';
import { ConfirmationDialogComponent } from '../../components/confirmation-dialog/confirmation-dialog.component';
import { RenameBookingDialogComponent } from '../../components/rename-booking-dialog/rename-booking-dialog.component';
import { FormMode, BookingFormState } from '../../models/booking-form-state.model';
import { BookingWithRoomInfo } from '../../models/api-responses.model';
import { Location } from '@angular/common';

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
  templateUrl: './my-bookings.page.html',
  styleUrls: ['./my-bookings.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyBookingsPageComponent implements OnInit {
  private readonly apiService = inject(ApiService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly errorHandler = inject(ErrorHandlingService);
  private readonly location = inject(Location);


  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly upcomingBookings = signal<BookingWithRoomInfo[]>([]);
  readonly pastBookings = signal<BookingWithRoomInfo[]>([]);
  readonly deletingBookingId = signal<number | null>(null);

  ngOnInit(): void {
    this.loadMyBookings();
  }

  private loadMyBookings(): void {
    this.loading.set(true);
    this.error.set(null);

    this.apiService.getMyBookings().subscribe({
      next: (bookings: BookingWithRoomInfo[]) => {
        this.groupBookings(bookings);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Fehler beim Laden der Buchungen.');
        this.loading.set(false);
        // ErrorHandlingService already displays error via ApiService
      }
    });
  }

  private groupBookings(bookings: BookingWithRoomInfo[]): void {
    const now = new Date();
    const upcoming: BookingWithRoomInfo[] = [];
    const past: BookingWithRoomInfo[] = [];

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
  }

  formatDateTime = formatDateTime;
  formatTimeRange = formatTimeRange;

  /**
   * Opens rename dialog for a booking
   */
  onRenameBooking(booking: BookingWithRoomInfo): void {
    const dialogRef = this.dialog.open(RenameBookingDialogComponent, {
      width: '500px',
      data: {
        currentTitle: booking.title,
        currentComment: booking.comment
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.apiService.updateBooking(booking.id, result).subscribe({
          next: () => {
            this.errorHandler.showSuccess('Buchung erfolgreich umbenannt');
            this.loadMyBookings();
          },
          error: () => {
            // ErrorHandlingService already displays error via ApiService
          }
        });
      }
    });
  }

  onRescheduleBooking(booking: BookingWithRoomInfo): void {
    const formState: BookingFormState = {
      mode: FormMode.RESCHEDULE,
      roomId: booking.room_id,
      data: {
        date: formatToYYYYMMDD(new Date(booking.start_time)),
        startTime: formatToHHMM(booking.start_time),
        endTime: formatToHHMM(booking.end_time),
        title: booking.title,
        comment: booking.comment,
        bookingId: booking.id
      }
    };

    this.router.navigate(['/bookings', booking.room_id], {
      state: { formState }
    });
  }

  onDeleteBooking(booking: BookingWithRoomInfo): void {
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
            this.errorHandler.showSuccess('Buchung erfolgreich gelöscht');
            this.deletingBookingId.set(null);
            this.loadMyBookings();
          },
          error: () => {
            this.deletingBookingId.set(null);
            // ErrorHandlingService already displays error via ApiService
          }
        });
      }
    });
  }

  /**
   * Navigates back to dashboard
   */
  goBack(): void {
    this.location.back();
  }

  /**
   * Erstellt eine ICS-Datei und startet den Download
   */
  onDownloadICS(booking: BookingWithRoomInfo): void {
    const start = new Date(booking.start_time).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const end = new Date(booking.end_time).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const uid = `${booking.id}@myapp.local`;
    const title = booking.title || 'Buchung';
    const description = booking.comment ? booking.comment.replace(/\n/g, '\\n') : '';
    const location = booking.room_name;

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//MyApp//Bookings//DE',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${booking.title || 'buchung'}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

}