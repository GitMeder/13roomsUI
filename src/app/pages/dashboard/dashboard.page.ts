import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService, Room } from '../../services/api.service';
import { RoomCardComponent } from '../../components/room-card/room-card.component';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    NgIf,
    NgFor,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    RoomCardComponent
  ],
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardPageComponent {
  private readonly api = inject(ApiService);

  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly rooms = signal<Room[]>([]);

  // Keep the dashboard subtitle contextual to current state (loading vs. stats).
  readonly subtitle = computed(() => {
    if (this.loading()) {
      return 'Wir sammeln aktuelle Raumdaten …';
    }
    const list = this.rooms();
    if (!list.length) {
      return 'Noch keine Räume verfügbar.';
    }
    const available = list.filter((room) => room.status === 'available').length;
    return `${list.length} Räume · ${available} sofort verfügbar`;
  });

  constructor() {
    this.loadRooms();
  }

  reload(): void {
    this.loadRooms();
  }

  private loadRooms(): void {
    // Fetch data once now and on demand; destroyRef handling lives in takeUntilDestroyed.
    this.loading.set(true);
    this.error.set(null);

    this.api.getRooms()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (rooms) => {
          this.rooms.set(rooms);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Die Räume konnten nicht geladen werden. Bitte versuchen Sie es erneut.');
          this.loading.set(false);
        }
      });
  }
}
