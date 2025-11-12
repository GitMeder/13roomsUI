import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
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

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly deletingId = signal<number | null>(null);

  dataSource = new MatTableDataSource<Room>([]);
  displayedColumns = ['icon', 'name', 'capacity', 'location', 'status', 'actions'];

  ngOnInit(): void {
    this.loadRooms();
  }

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
  }

  loadRooms(): void {
    this.loading.set(true);
    this.error.set(null);

    this.apiService.getRooms().subscribe({
      next: (rooms) => {
        this.dataSource.data = rooms;
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load rooms:', err);
        this.error.set(err.error?.message || 'Fehler beim Laden der Räume.');
        this.loading.set(false);
      }
    });
  }

  applyFilter(event: Event): void {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
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
        console.error('Failed to delete room:', err);
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
}
