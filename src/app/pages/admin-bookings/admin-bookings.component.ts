import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { formatToHHMM, formatToGermanDate } from '../../utils/date-time.utils';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { ApiService } from '../../services/api.service';
import { Booking } from '../../models/booking.model';
import { ErrorHandlingService } from '../../core/services/error-handling.service';
import { ConfirmationDialogComponent } from '../../components/confirmation-dialog/confirmation-dialog.component';
import { BookingWithRoomInfo } from '../../models/api-responses.model';

/**
 * Extended booking interface for admin table display.
 * Includes presentation-specific fields (formattedDate, formattedTime, bookedBy).
 */
interface AdminBooking extends Booking {
  room_name: string;
  status: string;
  formattedDate: string;
  formattedTime: string;
  bookedBy: string;
}

@Component({
  selector: 'app-admin-bookings',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './admin-bookings.component.html',
  styleUrl: './admin-bookings.component.css',
})
export class AdminBookingsComponent implements OnInit {
  private readonly apiService = inject(ApiService);
  private readonly errorHandler = inject(ErrorHandlingService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly deletingId = signal<number | null>(null);

  dataSource = new MatTableDataSource<AdminBooking>([]);
  displayedColumns = ['room_name', 'title', 'formattedDate', 'formattedTime', 'bookedBy', 'actions'];

  ngOnInit(): void {
    this.loadBookings();
  }

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
  }

  loadBookings(): void {
    this.loading.set(true);
    this.error.set(null);

    this.apiService.getAllBookings().subscribe({
      next: (bookings) => {
        // BookingWithRoomInfo is already normalized by ApiService
        const formatted = bookings.map(b => this.formatBooking(b));
        this.dataSource.data = formatted;
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Fehler beim Laden der Buchungen.');
        this.loading.set(false);
        // ErrorHandlingService already displays error via ApiService
      }
    });
  }

  /**
   * Adds presentation-specific fields to a booking.
   * The ApiService handles all data normalization, this method only adds display formatting.
   */
  formatBooking(booking: BookingWithRoomInfo): AdminBooking {
    const startDate = new Date(booking.start_time);
    const endDate = new Date(booking.end_time);

    const formattedDate = formatToGermanDate(startDate);
    const formattedTime = `${this.formatTime(startDate)} – ${this.formatTime(endDate)}`;

    // Use normalized data from ApiService (createdByName, guestName)
    const bookedBy = booking.createdByName
      ? booking.createdByName
      : booking.guestName
        ? `Gast: ${booking.guestName}`
        : 'Unbekannt';

    return {
      ...booking,
      formattedDate,
      formattedTime,
      bookedBy
    };
  }

  formatTime = formatToHHMM;

  applyFilter(event: Event): void {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  onEdit(booking: AdminBooking): void {
    // Navigate to the booking page with prefill data
    this.router.navigate(['/bookings', booking.room_id], {
      state: {
        reschedulingBookingId: booking.id,
        prefillData: {
          title: booking.title,
          comment: booking.comment || '',
          date: booking.start_time.split('T')[0],
          startTime: this.formatTime(new Date(booking.start_time)),
          endTime: this.formatTime(new Date(booking.end_time))
        }
      }
    });
  }

  onDelete(booking: AdminBooking): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Buchung löschen?',
        message: `Möchten Sie die Buchung "${booking.title}" für ${booking.room_name} wirklich löschen?`,
        confirmText: 'Löschen',
        cancelText: 'Abbrechen',
        type: 'danger'
      }
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.deleteBooking(booking.id);
      }
    });
  }

  private deleteBooking(id: number): void {
    this.deletingId.set(id);

    this.apiService.deleteBooking(id).subscribe({
      next: () => {
        this.errorHandler.showSuccess('Buchung erfolgreich gelöscht.');
        this.deletingId.set(null);
        this.loadBookings();
      },
      error: () => {
        this.deletingId.set(null);
        // ErrorHandlingService already displays error via ApiService
      }
    });
  }
}
