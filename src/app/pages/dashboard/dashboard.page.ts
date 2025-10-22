import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, DestroyRef } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../services/api.service'; // Keep ApiService for API calls
import { Room } from '../../models/room.model'; // Import Room from the updated model
import { RoomCardComponent } from '../../components/room-card/room-card.component';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { timer, Observable } from 'rxjs'; // Import timer and Observable
import { map, filter } from 'rxjs/operators'; // Import map operator

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    NgIf,
    NgFor,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    RoomCardComponent,
    RouterLink
  ],
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly rooms = signal<Room[]>([]);

  readonly countdown$ = signal<number>(0); // Real-time countdown signal

  // Keep the dashboard subtitle contextual to current state (loading vs. stats).
  readonly subtitle = computed(() => {
    if (this.loading()) {
      return 'Wir sammeln aktuelle Raumdaten …';
    }
    const list = this.rooms();
    if (!list.length) {
      return 'Noch keine Räume verfügbar.';
    }
    const available = list.filter((room) => {
      const status = this.getRoomStatus(room);
      return status.cssClass === 'available';
    }).length;
    return `${list.length} Räume · ${available} sofort verfügbar`;
  });

  constructor() {
    console.log('DashboardPageComponent constructor called.');

    // Start timer to refresh status every second
    timer(0, 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(tick => {
        this.countdown$.set(tick);
      });

    // Reload rooms when navigating back to dashboard
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      filter((event: NavigationEnd) => event.url === '/' || event.url === ''),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      console.log('Dashboard route activated, reloading rooms...');
      this.loadRooms();
    });
  }

  ngOnInit(): void {
    console.log('DashboardPageComponent ngOnInit called.');
    this.loadRooms();
  }

  reload(): void {
    console.log('Reloading rooms...');
    this.loadRooms();
  }

  private loadRooms(): void {
    console.log('loadRooms called.');
    // Fetch data once now and on demand; destroyRef handling lives in takeUntilDestroyed.
    this.loading.set(true);
    this.error.set(null);

    this.api.getRooms()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rooms) => {
          console.log('Rooms loaded successfully:', rooms);
          this.rooms.set(rooms);
          this.loading.set(false);
        },
        error: (err) => {
          console.error('Error loading rooms:', err);
          this.error.set('Die Räume konnten nicht geladen werden. Bitte versuchen Sie es erneut.');
          this.loading.set(false);
        }
      });
  }

  onDeleteRoom(roomId: number): void {
    console.log(`Attempting to delete room with ID: ${roomId}`);
    this.api.deleteRoom(roomId)
      .subscribe({
        next: () => {
          console.log(`Room with ID: ${roomId} deleted successfully.`);
          this.loadRooms(); // Reload rooms after deletion
        },
        error: (err) => {
          console.error(`Error deleting room with ID: ${roomId}:`, err);
          // Optionally, display an error message to the user
        }
      });
  }

  onRoomCardClick(roomId: number): void {
    console.log(`Room card with ID ${roomId} clicked. Navigating to booking form.`);
    this.router.navigate(['/bookings', roomId]);
  }

  trackByRoomId(index: number, room: Room): number {
    return room.id;
  }

  getRoomStatus(room: Room): { text: string; cssClass: string } {
    // Access countdown$ to make this method reactive
    this.countdown$();

    const now = new Date();

    // Debug logging
    if (room.currentBooking || room.nextBooking) {
      console.log(`Room ${room.name} status:`, {
        currentBooking: room.currentBooking,
        nextBooking: room.nextBooking,
        now: now.toISOString()
      });
    }

    if (room.currentBooking) {
      const endTime = new Date(room.currentBooking.end_time);
      const diffMs = endTime.getTime() - now.getTime();
      const totalSeconds = Math.floor(diffMs / 1000);

      if (totalSeconds <= 0) {
        // Booking has ended, re-evaluate status
        return this.getRoomStatus({ ...room, currentBooking: undefined });
      }

      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      let countdownText = '';
      if (hours > 0) {
        countdownText += `${hours} Std. `;
      }
      if (minutes > 0) {
        countdownText += `${minutes} Min. `;
      }
      countdownText += `${seconds} Sek.`;

      return {
        text: `NICHT BUCHBAR · Wieder verfügbar in: ${countdownText.trim()}`,
        cssClass: 'booked'
      };
    } else if (room.nextBooking) {
      const nextBookingStartTime = new Date(room.nextBooking.start_time);
      const formattedTime = nextBookingStartTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      return {
        text: `Verfügbar bis ${formattedTime} Uhr`,
        cssClass: 'available-soon'
      };
    } else {
      return {
        text: 'VERFÜGBAR DEN GANZEN TAG',
        cssClass: 'available'
      };
    }
  }
}
