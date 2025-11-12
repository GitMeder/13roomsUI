import { Component, OnInit, ViewChild, inject, signal, computed, effect } from '@angular/core';
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
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { ApiService } from '../../services/api.service';
import { Booking } from '../../models/booking.model';
import { Room } from '../../models/room.model';
import { ErrorHandlingService } from '../../core/services/error-handling.service';
import { ConfirmationDialogComponent } from '../../components/confirmation-dialog/confirmation-dialog.component';
import { BookingWithRoomInfo, ApiUser } from '../../models/api-responses.model';
import { CsvExportService } from '../../utils/csv-export.service';

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
    MatProgressSpinnerModule,
    MatSelectModule
  ],
  templateUrl: './admin-bookings.component.html',
  styleUrl: './admin-bookings.component.css',
})
export class AdminBookingsComponent implements OnInit {
  private readonly apiService = inject(ApiService);
  private readonly errorHandler = inject(ErrorHandlingService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly csvExportService = inject(CsvExportService);

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly deletingId = signal<number | null>(null);

  // Data signals
  readonly allBookings = signal<AdminBooking[]>([]);
  readonly allUsers = signal<ApiUser[]>([]);
  readonly allRooms = signal<Room[]>([]);

  // Filter signals
  readonly selectedRoomId = signal<number | 'all'>('all');
  readonly selectedUserId = signal<number | 'all'>('all');
  readonly textFilter = signal<string>('');

  // Computed filtered data
  readonly filteredBookings = computed(() => {
    const bookings = this.allBookings();
    const roomId = this.selectedRoomId();
    const userId = this.selectedUserId();
    const text = this.textFilter().toLowerCase();

    return bookings.filter(booking => {
      const roomMatch = (roomId === 'all' || booking.room_id === roomId);
      const userMatch = (userId === 'all' || booking.createdBy === userId);

      // Text filter matches room name, title, or bookedBy
      const textMatch = !text ||
        booking.room_name.toLowerCase().includes(text) ||
        booking.title.toLowerCase().includes(text) ||
        booking.bookedBy.toLowerCase().includes(text);

      return roomMatch && userMatch && textMatch;
    });
  });

  dataSource = new MatTableDataSource<AdminBooking>([]);
  displayedColumns = ['room_name', 'title', 'formattedDate', 'formattedTime', 'bookedBy', 'actions'];

  constructor() {
    // Update dataSource whenever filteredBookings changes
    effect(() => {
      this.dataSource.data = this.filteredBookings();
    });
  }

  ngOnInit(): void {
    this.loadBookings();
    this.loadUsers();
    this.loadRooms();
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
        this.allBookings.set(formatted);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Fehler beim Laden der Buchungen.');
        this.loading.set(false);
        // ErrorHandlingService already displays error via ApiService
      }
    });
  }

  loadUsers(): void {
    this.apiService.getAllUsers().subscribe({
      next: (users) => {
        this.allUsers.set(users);
      },
      error: () => {
        // Silent fail - filter will just show no users
        this.allUsers.set([]);
      }
    });
  }

  loadRooms(): void {
    this.apiService.getRooms().subscribe({
      next: (rooms) => {
        this.allRooms.set(rooms);
      },
      error: () => {
        // Silent fail - filter will just show no rooms
        this.allRooms.set([]);
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
    this.textFilter.set(filterValue.trim());

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  clearFilters(): void {
    this.selectedRoomId.set('all');
    this.selectedUserId.set('all');
    this.textFilter.set('');

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

  exportCsv(): void {
    // Use the current filtered data
    const dataToExport = this.filteredBookings();

    // Map data to row arrays with formatted values
    const rows = dataToExport.map(booking => [
      booking.room_name,
      booking.title,
      booking.formattedDate,
      booking.formattedTime,
      booking.bookedBy,
      booking.comment || ''
    ]);

    const headers = ['Raum', 'Titel', 'Datum', 'Zeit', 'Gebucht von', 'Kommentar'];
    this.csvExportService.exportToCsv(rows, 'buchungen-export', headers);
  }

}
