import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
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
import { ConfirmationDialogComponent } from '../../components/confirmation-dialog/confirmation-dialog.component';

interface AdminBooking {
  id: number;
  room_id: number;
  room_name: string;
  title: string;
  start_time: string;
  end_time: string;
  comment: string | null;
  created_by: number | null;
  guest_name: string | null;
  creator_firstname: string | null;
  creator_surname: string | null;
  creator_email: string | null;
  status: 'confirmed' | 'canceled';
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
  private readonly snackBar = inject(MatSnackBar);
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
        const formatted = bookings.map(b => this.formatBooking(b));
        this.dataSource.data = formatted;
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load bookings:', err);
        this.error.set(err.error?.message || 'Fehler beim Laden der Buchungen.');
        this.loading.set(false);
      }
    });
  }

  formatBooking(booking: any): AdminBooking {
    const startDate = new Date(booking.start_time);
    const endDate = new Date(booking.end_time);

    const formattedDate = startDate.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    const formattedTime = `${this.formatTime(startDate)} – ${this.formatTime(endDate)}`;

    let bookedBy = 'Unbekannt';
    if (booking.creator_firstname && booking.creator_surname) {
      bookedBy = `${booking.creator_firstname} ${booking.creator_surname}`;
    } else if (booking.guest_name) {
      bookedBy = `Gast: ${booking.guest_name}`;
    }

    return {
      ...booking,
      formattedDate,
      formattedTime,
      bookedBy
    };
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

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
        this.snackBar.open('Buchung erfolgreich gelöscht.', 'OK', {
          duration: 3000,
          panelClass: 'snackbar-success'
        });
        this.deletingId.set(null);
        this.loadBookings();
      },
      error: (err) => {
        console.error('Failed to delete booking:', err);
        this.snackBar.open(
          err.error?.message || 'Fehler beim Löschen der Buchung.',
          'OK',
          { duration: 5000, panelClass: 'snackbar-error' }
        );
        this.deletingId.set(null);
      }
    });
  }

  exportCsv() {
  const data = this.dataSource.filteredData.length
    ? this.dataSource.filteredData
    : this.dataSource.data;
  if (!data.length) return;

  const header = ['Raum', 'Titel', 'Datum', 'Zeit', 'Gebucht von', 'Kommentar'];
  const rows = data.map(b => [
    `"${b.room_name}"`,
    `"${b.title}"`,
    `"${b.formattedDate}"`,
    `"${b.formattedTime}"`,
    `"${b.bookedBy}"`,
    `"${b.comment || ''}"`
  ]);

  const csvContent = [header, ...rows].map(e => e.join(';')).join('\n');
  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = 'bookings.csv';
  link.click();
  URL.revokeObjectURL(url);
}

}
