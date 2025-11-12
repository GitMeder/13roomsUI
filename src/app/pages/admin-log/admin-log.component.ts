import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ApiService, ActivityLog } from '../../services/api.service';
import { CsvExportService } from '../../utils/csv-export.service';

// Define the response type for clarity
type ActivityLogResponse = {
  logs: ActivityLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

@Component({
  selector: 'app-admin-log',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatExpansionModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatInputModule
  ],
  templateUrl: './admin-log.component.html',
  styleUrl: './admin-log.component.css'
})
export class AdminLogComponent implements OnInit {
  private readonly apiService = inject(ApiService);
  private readonly csvExportService = inject(CsvExportService);

  logs = signal<ActivityLog[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  currentPage = signal(1);
  totalPages = signal(1);
  hasNextPage = signal(false);

  // View mode: 'visual' (default timeline view) or 'text' (plain text list)
  viewMode = signal<'visual' | 'text'>('visual');

  // Search/filter functionality
  searchText = signal('');

  // Computed signal for filtered logs based on search text
  filteredLogs = computed(() => {
    const search = this.searchText().toLowerCase().trim();
    const allLogs = this.logs();

    if (!search) {
      return allLogs;
    }

    return allLogs.filter(log => {
      const actionText = this.getActionText(log).toLowerCase();
      const userName = log.user
        ? `${log.user.firstname} ${log.user.surname}`.toLowerCase()
        : 'system/gast';
      const entityType = this.getEntityTypeLabel(log.entity_type).toLowerCase();
      const entityId = log.entity_id ? log.entity_id.toString() : '';

      return actionText.includes(search) ||
             userName.includes(search) ||
             entityType.includes(search) ||
             entityId.includes(search);
    });
  });

  ngOnInit(): void {
    this.loadLogs();
  }

  loadLogs(): void {
    this.loading.set(true);
    this.error.set(null);

    this.apiService.getActivityLogs(this.currentPage(), 50).subscribe({
      next: (response: ActivityLogResponse) => {
        this.logs.set(response.logs);
        this.totalPages.set(response.pagination.totalPages);
        this.hasNextPage.set(response.pagination.hasNextPage);
        this.loading.set(false);
      },
      error: (err: any) => {
        console.error('Error loading activity logs:', err);
        this.error.set('Fehler beim Laden des Aktivitätsprotokolls.');
        this.loading.set(false);
      }
    });
  }

  loadMore(): void {
    if (this.hasNextPage()) {
      this.currentPage.update(page => page + 1);
      this.loading.set(true);

      this.apiService.getActivityLogs(this.currentPage(), 50).subscribe({
        next: (response: ActivityLogResponse) => {
          this.logs.update(existingLogs => [...existingLogs, ...response.logs]);
          this.totalPages.set(response.pagination.totalPages);
          this.hasNextPage.set(response.pagination.hasNextPage);
          this.loading.set(false);
        },
        error: (err: any) => {
          console.error('Error loading more activity logs:', err);
          this.error.set('Fehler beim Laden weiterer Einträge.');
          this.loading.set(false);
        }
      });
    }
  }

  getActionIcon(actionType: string): string {
    switch (actionType) {
      case 'CREATE':
        return 'add_circle';
      case 'UPDATE':
        return 'edit';
      case 'DELETE':
        return 'delete';
      case 'LOGIN':
        return 'login';
      case 'LOGOUT':
        return 'logout';
      default:
        return 'info';
    }
  }

  getActionColor(actionType: string): string {
    switch (actionType) {
      case 'CREATE':
        return 'action-create';
      case 'UPDATE':
        return 'action-update';
      case 'DELETE':
        return 'action-delete';
      case 'LOGIN':
        return 'action-login';
      case 'LOGOUT':
        return 'action-logout';
      default:
        return 'action-default';
    }
  }

  getEntityTypeLabel(entityType: string): string {
    switch (entityType) {
      case 'BOOKING':
        return 'Buchung';
      case 'ROOM':
        return 'Raum';
      case 'USER':
        return 'Benutzer';
      default:
        return entityType;
    }
  }

  getActionText(log: ActivityLog): string {
    const userName = log.user
      ? `${log.user.firstname} ${log.user.surname}`
      : 'System/Gast';
    const entity = this.getEntityTypeLabel(log.entity_type);

    switch (log.action_type) {
      case 'CREATE':
        return `${userName} hat ${entity} erstellt`;
      case 'UPDATE':
        return `${userName} hat ${entity} aktualisiert`;
      case 'DELETE':
        return `${userName} hat ${entity} gelöscht`;
      case 'LOGIN':
        return `${userName} hat sich angemeldet`;
      case 'LOGOUT':
        return `${userName} hat sich abgemeldet`;
      default:
        return `${userName} - ${log.action_type} - ${entity}`;
    }
  }

  getRelativeTime(timestamp: string): string {
    const now = new Date();
    const logTime = new Date(timestamp);
    const diffMs = now.getTime() - logTime.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) {
      return 'gerade eben';
    } else if (diffMin < 60) {
      return `vor ${diffMin} ${diffMin === 1 ? 'Minute' : 'Minuten'}`;
    } else if (diffHour < 24) {
      return `vor ${diffHour} ${diffHour === 1 ? 'Stunde' : 'Stunden'}`;
    } else if (diffDay < 7) {
      return `vor ${diffDay} ${diffDay === 1 ? 'Tag' : 'Tagen'}`;
    } else {
      return new Intl.DateTimeFormat('de-DE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(logTime);
    }
  }

  formatTimestamp(timestamp: string): string {
    return new Intl.DateTimeFormat('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(timestamp));
  }

  hasDetails(log: ActivityLog): boolean {
    return log.details !== null && Object.keys(log.details).length > 0;
  }

  formatDetails(details: Record<string, any>): string {
    return JSON.stringify(details, null, 2);
  }

  /**
   * Exports all logs to CSV file using the centralized CsvExportService.
   * CSV columns: id, timestamp, user_email, user_name, action, entity_type, entity_id, details
   */
  exportToCsv(): void {
    const allLogs = this.logs();

    if (allLogs.length === 0) {
      console.warn('No logs to export');
      return;
    }

    const headers = [
      'ID',
      'Zeitstempel',
      'Benutzer E-Mail',
      'Benutzer Name',
      'Aktion',
      'Entitätstyp',
      'Entitäts-ID',
      'Details'
    ];

    const data = allLogs.map(log => [
      log.id,
      this.formatTimestamp(log.timestamp),
      log.user?.email ?? 'N/A',
      log.user ? `${log.user.firstname} ${log.user.surname}` : 'System/Gast',
      log.action_type,
      this.getEntityTypeLabel(log.entity_type),
      log.entity_id ?? 'N/A',
      log.details ? JSON.stringify(log.details) : ''
    ]);

    this.csvExportService.exportToCsv(data, 'aktivitaetsprotokoll-export', headers);
  }

  /**
   * Formats a log entry for text-only view.
   * Format: [YYYY-MM-DD HH:mm:ss] USER 'Name' ACTION ENTITY_TYPE (ID: X)
   */
  formatLogAsText(log: ActivityLog): string {
    const timestamp = new Intl.DateTimeFormat('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(log.timestamp));

    const userName = log.user
      ? `${log.user.firstname} ${log.user.surname}`
      : 'System/Gast';

    const actionVerb = this.getActionVerb(log.action_type);
    const entityType = this.getEntityTypeLabel(log.entity_type);
    const entityIdText = log.entity_id ? ` (ID: ${log.entity_id})` : '';

    return `[${timestamp}] BENUTZER '${userName}' ${actionVerb} ${entityType}${entityIdText}`;
  }

  /**
   * Returns the German action verb for text-only view
   */
  private getActionVerb(actionType: string): string {
    switch (actionType) {
      case 'CREATE':
        return 'hat erstellt';
      case 'UPDATE':
        return 'hat aktualisiert';
      case 'DELETE':
        return 'hat gelöscht';
      case 'LOGIN':
        return 'hat sich angemeldet';
      case 'LOGOUT':
        return 'hat sich abgemeldet';
      default:
        return actionType;
    }
  }
}
