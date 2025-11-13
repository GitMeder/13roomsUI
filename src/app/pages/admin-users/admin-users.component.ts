import { ChangeDetectionStrategy, Component, OnInit, ViewChild, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
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
import { ConfirmationDialogComponent } from '../../components/confirmation-dialog/confirmation-dialog.component';
import { UserFormDialogComponent, UserFormData } from '../../components/user-form-dialog/user-form-dialog.component';
import { ApiUser } from '../../models/api-responses.model';
import { CsvExportService } from '../../utils/csv-export.service';

interface AdminUser extends ApiUser {
  fullName: string;
}

@Component({
  selector: 'app-admin-users',
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
    MatChipsModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminUsersComponent implements OnInit {
  private readonly apiService = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly csvExportService = inject(CsvExportService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly deletingId = signal<number | null>(null);

  // Data signals
  readonly allUsers = signal<AdminUser[]>([]);

  // Filter signals
  readonly textFilter = signal<string>('');

  // Computed filtered data
  readonly filteredUsers = computed(() => {
    const users = this.allUsers();
    const text = this.textFilter().toLowerCase();

    return users.filter(user => {
      // Text filter matches fullName, email, role, or status
      const textMatch = !text ||
        user.fullName.toLowerCase().includes(text) ||
        user.email.toLowerCase().includes(text) ||
        this.getRoleLabel(user.role).toLowerCase().includes(text) ||
        (user.is_active ? 'aktiv' : 'inaktiv').includes(text);

      return textMatch;
    });
  });

  dataSource = new MatTableDataSource<AdminUser>([]);
  displayedColumns = ['fullName', 'email', 'role', 'is_active', 'actions'];

  // Fix: Paginator & Sort als Setter, damit DataSource-Verknüpfung sicher nach Rendern erfolgt
  @ViewChild(MatPaginator) set matPaginator(p: MatPaginator) {
    if (p) this.dataSource.paginator = p;
  }
  @ViewChild(MatSort) set matSort(s: MatSort) {
    if (s) this.dataSource.sort = s;
  }

  constructor() {
    // Update dataSource whenever filteredUsers changes
    effect(() => {
      this.dataSource.data = this.filteredUsers();
    });
  }

  ngOnInit(): void {
    this.loadUsers();

    // Custom Filter: sucht über Name, Email und Rolle
    this.dataSource.filterPredicate = (data: AdminUser, filter: string) => {
      const f = filter.trim().toLowerCase();
      return (
        data.fullName.toLowerCase().includes(f) ||
        data.email.toLowerCase().includes(f) ||
        this.getRoleLabel(data.role).toLowerCase().includes(f)
      );
    };
  }

  loadUsers(): void {
    this.loading.set(true);
    this.error.set(null);

    this.apiService.getAllUsers().subscribe({
      next: (users) => {
        this.dataSource.data = users.map(u => ({
          ...u,
          fullName: `${u.firstname} ${u.surname}`
        }));
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Fehler beim Laden der Benutzer.');
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

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  onCreateUser(): void {
    const dialogRef = this.dialog.open(UserFormDialogComponent, {
      width: '500px',
      data: null
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.createUser(result);
      }
    });
  }

  onEdit(user: AdminUser): void {
    const dialogRef = this.dialog.open(UserFormDialogComponent, {
      width: '500px',
      data: {
        id: user.id,
        email: user.email,
        firstname: user.firstname,
        surname: user.surname,
        role: user.role,
        is_active: user.is_active
      } as UserFormData
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) this.updateUser(user.id, result);
    });
  }

  onDelete(user: AdminUser): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Benutzer löschen?',
        message: `Möchten Sie den Benutzer "${user.fullName}" (${user.email}) wirklich löschen? Alle zugehörigen Buchungen werden ebenfalls gelöscht.`,
        confirmText: 'Löschen',
        cancelText: 'Abbrechen',
        type: 'danger'
      }
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.deleteUser(user.id);
      }
    });
  }

  private createUser(payload: any): void {
    this.apiService.createUser(payload).subscribe({
      next: () => {
        this.snackBar.open('Benutzer erfolgreich angelegt.', 'OK', {
          duration: 3000,
          panelClass: 'snackbar-success'
        });
        this.loadUsers();
      },
      error: (err) => {
        this.snackBar.open(
          err.error?.message || 'Fehler beim Anlegen des Benutzers.',
          'OK',
          { duration: 5000, panelClass: 'snackbar-error' }
        );
      }
    });
  }

  private updateUser(id: number, payload: any): void {
    this.apiService.updateUser(id, payload).subscribe({
      next: () => {
        this.snackBar.open('Benutzer erfolgreich aktualisiert.', 'OK', {
          duration: 3000,
          panelClass: 'snackbar-success'
        });
        this.loadUsers();
      },
      error: (err) => {
        this.snackBar.open(
          err.error?.message || 'Fehler beim Aktualisieren des Benutzers.',
          'OK',
          { duration: 5000, panelClass: 'snackbar-error' }
        );
      }
    });
  }

  private deleteUser(id: number): void {
    this.deletingId.set(id);

    this.apiService.deleteUser(id).subscribe({
      next: () => {
        this.snackBar.open('Benutzer erfolgreich gelöscht.', 'OK', {
          duration: 3000,
          panelClass: 'snackbar-success'
        });
        this.deletingId.set(null);
        this.loadUsers();
      },
      error: (err) => {
        this.snackBar.open(
          err.error?.message || 'Fehler beim Löschen des Benutzers.',
          'OK',
          { duration: 5000, panelClass: 'snackbar-error' }
        );
        this.deletingId.set(null);
      }
    });
  }

  getRoleLabel(role: string): string {
    return role === 'admin' ? 'Administrator' : 'Benutzer';
  }

  getRoleIcon(role: string): string {
    return role === 'admin' ? 'admin_panel_settings' : 'person';
  }

  exportCsv(): void {
    // Use the current filtered data
    const dataToExport = this.filteredUsers();

    // Map data to row arrays with formatted values
    const rows = dataToExport.map(user => [
      user.fullName,
      user.email,
      this.getRoleLabel(user.role),
      user.is_active ? 'Aktiv' : 'Inaktiv'
    ]);

    const headers = ['Name', 'E-Mail', 'Rolle', 'Status'];
    this.csvExportService.exportToCsv(rows, 'users', headers);
  }
}
