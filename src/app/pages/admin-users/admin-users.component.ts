import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
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
})
export class AdminUsersComponent implements OnInit {
  private readonly apiService = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly deletingId = signal<number | null>(null);

  dataSource = new MatTableDataSource<AdminUser>([]);
  displayedColumns = ['fullName', 'email', 'role', 'is_active', 'actions'];

  ngOnInit(): void {
    this.loadUsers();
  }

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
  }

  loadUsers(): void {
    this.loading.set(true);
    this.error.set(null);

    this.apiService.getAllUsers().subscribe({
      next: (users) => {
        const formatted = users.map(u => ({
          ...u,
          fullName: `${u.firstname} ${u.surname}`
        }));
        this.dataSource.data = formatted;
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
    this.dataSource.filter = filterValue.trim().toLowerCase();

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
      if (result) {
        this.updateUser(user.id, result);
      }
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
}
