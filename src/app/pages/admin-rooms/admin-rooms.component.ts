import { Component, OnInit, ViewChild, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { ApiService } from '../../services/api.service';
import { Room } from '../../models/room.model';
import { ConfirmationDialogComponent } from '../../components/confirmation-dialog/confirmation-dialog.component';
import { CsvExportService } from '../../utils/csv-export.service';

@Component({
  selector: 'app-admin-rooms',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatInputModule,
    MatFormFieldModule,
    MatChipsModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './admin-rooms.component.html',
  styleUrl: './admin-rooms.component.css',
})
export class AdminRoomsComponent implements OnInit {
  private readonly apiService = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly csvExportService = inject(CsvExportService);

  // DataSource einmalig instanziieren
  dataSource = new MatTableDataSource<Room>([]);
  displayedColumns = ['icon', 'name', 'capacity', 'location', 'status', 'actions'];

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly deletingId = signal<number | null>(null);

  // Data signals
  readonly allRooms = signal<Room[]>([]);

  // Filter signals
  readonly textFilter = signal<string>('');

  // Computed filtered data
  readonly filteredRooms = computed(() => {
    const rooms = this.allRooms();
    const text = this.textFilter().toLowerCase();

    return rooms.filter(room => {
      // Text filter matches name, location, or status
      const textMatch = !text ||
        room.name.toLowerCase().includes(text) ||
        (room.location && room.location.toLowerCase().includes(text)) ||
        this.getStatusLabel(room.status).toLowerCase().includes(text);

      return textMatch;
    });
  });

  // Setter binden sofort, wenn ViewChild verfügbar ist
  @ViewChild(MatPaginator) set matPaginator(p: MatPaginator) {
    if (p) {
      this.dataSource.paginator = p;
    }
  }
  @ViewChild(MatSort) set matSort(s: MatSort) {
    if (s) {
      this.dataSource.sort = s;
    }
  }

  constructor() {
    // Update dataSource whenever filteredRooms changes
    effect(() => {
      this.dataSource.data = this.filteredRooms();
    });
  }

  ngOnInit(): void {
    this.loadRooms();
    // optional: eigenes Filterverhalten
    this.dataSource.filterPredicate = (data: Room, filter: string) => {
      const f = filter.trim().toLowerCase();
      return (
        data.name.toLowerCase().includes(f) ||
        (data.location || '').toLowerCase().includes(f) ||
        this.getStatusLabel(data.status).toLowerCase().includes(f)
      );
    };
  }

  loadRooms(): void {
    this.loading.set(true);
    this.error.set(null);

    this.apiService.getRooms().subscribe({
      next: (rooms) => {
        this.allRooms.set(rooms); // keine neue Instanz erzeugen
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Fehler beim Laden der Räume.');
        this.loading.set(false);
      }
    });
  }

  applyFilter(event: Event): void {
    const filterValue = (event.target as HTMLInputElement).value;
    this.textFilter.set(filterValue.trim());

    this.dataSource.paginator?.firstPage();
  }

  clearFilters(): void {
    this.textFilter.set('');

    this.dataSource.paginator?.firstPage();
  }

  onEdit(room: Room): void {
    this.router.navigate(['/rooms', room.id, 'edit']);
  }

  onDelete(room: Room): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Raum löschen?',
        message: `Möchten Sie den Raum "${room.name}" wirklich löschen? Alle zugehörigen Buchungen werden ebenfalls gelöscht.`,
        confirmText: 'Löschen',
        cancelText: 'Abbrechen',
        type: 'danger'
      }
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.deleteRoom(room.id);
      }
    });
  }

  private deleteRoom(id: number): void {
    this.deletingId.set(id);

    this.apiService.deleteRoom(id).subscribe({
      next: () => {
        this.snackBar.open('Raum erfolgreich gelöscht.', 'OK', {
          duration: 3000,
          panelClass: 'snackbar-success'
        });
        this.deletingId.set(null);
        this.loadRooms();
      },
      error: (err) => {
        this.snackBar.open(
          err.error?.message || 'Fehler beim Löschen des Raums.',
          'OK',
          { duration: 5000, panelClass: 'snackbar-error' }
        );
        this.deletingId.set(null);
      }
    });
  }

  getStatusLabel(status: string): string {
    const statusMap: Record<string, string> = {
      'active': 'Aktiv',
      'inactive': 'Inaktiv',
      'maintenance': 'Wartung',
      'available': 'Verfügbar',
      'occupied': 'Besetzt'
    };
    return statusMap[status] || status;
  }

  getStatusColor(status: string): string {
    const colorMap: Record<string, string> = {
      'active': 'primary',
      'available': 'primary',
      'inactive': 'warn',
      'maintenance': 'accent',
      'occupied': 'warn'
    };
    return colorMap[status] || '';
  }

  exportCsv(): void {
    // Use the current filtered data
    const dataToExport = this.filteredRooms();

    // Map data to row arrays with formatted values
    const rows = dataToExport.map(room => [
      room.name,
      room.capacity,
      room.location || '',
      this.getStatusLabel(room.status)
    ]);

    const headers = ['Name', 'Kapazität', 'Standort', 'Status'];
    this.csvExportService.exportToCsv(rows, 'rooms', headers);
  }
}
