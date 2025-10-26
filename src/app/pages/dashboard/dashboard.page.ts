import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, DestroyRef } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../services/api.service'; // Keep ApiService for API calls
import { Room } from '../../models/room.model'; // Import Room from the updated model
import { Booking } from '../../models/booking.model'; // Import Booking model
import { RoomCardComponent } from '../../components/room-card/room-card.component';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { timer, Observable } from 'rxjs'; // Import timer and Observable
import { map, filter } from 'rxjs/operators'; // Import map operator

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    RoomCardComponent,
    RouterLink
  ],
  providers: [DatePipe],
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly datePipe = inject(DatePipe);

  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly rooms = signal<Room[]>([]);

  readonly countdown = signal<number>(0); // Real-time countdown signal
  readonly highlightedRoomId = signal<number | null>(null); // PART 2: Room to highlight with rainbow

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
        this.countdown.set(tick);
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

    // PART 2: Check for highlighted room from navigation state (after successful booking)
    // CRITICAL FIX: Use window.history.state since getCurrentNavigation() returns null in ngOnInit
    const navigation = this.router.getCurrentNavigation();
    const state = navigation?.extras?.state || window.history.state;

    console.log('[RainbowHighlight] 🌈 Checking for highlighted room...');
    console.log('[RainbowHighlight] 🌈 navigation:', navigation);
    console.log('[RainbowHighlight] 🌈 window.history.state:', window.history.state);
    console.log('[RainbowHighlight] 🌈 Final state:', state);

    if (state && state['highlightedRoomId']) {
      const roomId = state['highlightedRoomId'] as number;
      console.log('[RainbowHighlight] ✨ Detected highlighted room:', roomId);
      console.log('[RainbowHighlight] ✨ Activating rainbow celebration!');

      this.highlightedRoomId.set(roomId);

      // Clear the highlight after 5 seconds for a temporary celebration effect
      setTimeout(() => {
        console.log('[RainbowHighlight] 🌈 Clearing highlight after 5 seconds');
        this.highlightedRoomId.set(null);
      }, 5000);
    } else {
      console.log('[RainbowHighlight] ❌ No highlighted room found');
    }

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


  /**
   * Finds the effective end time of a booking block by following consecutive bookings.
   * A "block" is a series of bookings where each booking's end time equals the next booking's start time.
   *
   * Example:
   * - Booking A: 13:00 - 14:00
   * - Booking B: 14:00 - 15:30 (directly follows A)
   * - Booking C: 16:00 - 17:00 (gap after B)
   *
   * If currentBooking is A, this returns 15:30 (end of B), not 14:00.
   *
   * @param currentBooking The currently active booking
   * @param allBookings All bookings for today, sorted by start time
   * @returns The end time of the last booking in the continuous block
   */
  private findBlockEndTime(currentBooking: Booking, allBookings: Booking[]): Date {
    let blockEndTime = new Date(currentBooking.end_time);

    console.log(`\n=== FINDING BOOKING BLOCK ===`);
    console.log(`Starting with booking:`, {
      id: currentBooking.id,
      start: new Date(currentBooking.start_time).toLocaleTimeString('de-DE'),
      end: new Date(currentBooking.end_time).toLocaleTimeString('de-DE')
    });

    // Look for consecutive bookings
    let foundConsecutive = true;
    let currentEnd = blockEndTime;

    while (foundConsecutive) {
      foundConsecutive = false;

      for (const booking of allBookings) {
        const bookingStart = new Date(booking.start_time);
        const bookingEnd = new Date(booking.end_time);

        // Check if this booking starts exactly when the current block ends
        if (bookingStart.getTime() === currentEnd.getTime()) {
          console.log(`✓ Found consecutive booking:`, {
            id: booking.id,
            start: bookingStart.toLocaleTimeString('de-DE'),
            end: bookingEnd.toLocaleTimeString('de-DE')
          });

          // Extend the block
          currentEnd = bookingEnd;
          blockEndTime = bookingEnd;
          foundConsecutive = true;
          break;
        }
      }
    }

    console.log(`Block ends at: ${blockEndTime.toLocaleTimeString('de-DE')}`);
    console.log(`=== END FINDING BOOKING BLOCK ===\n`);

    return blockEndTime;
  }

  getRoomStatus(room: Room): { text: string; cssClass: string } {
    // CRITICAL FIX: Don't call countdown() here - it causes infinite loop
    // The timer already updates countdown every second, triggering change detection
    // We just need to read the current time directly

    const now = new Date();

    // PRIORITÄT 1: Ist der Raum JETZT in diesem Moment belegt?
    if (room.currentBooking) {
      const currentEndTime = new Date(room.currentBooking.end_time);
      const diffMs = currentEndTime.getTime() - now.getTime();
      const totalSeconds = Math.floor(diffMs / 1000);

      if (totalSeconds <= 0) {
        // Booking has ended, re-evaluate status without current booking
        return this.getRoomStatus({ ...room, currentBooking: undefined });
      }

      // CRITICAL FIX: Find the actual end time of the booking block (consecutive bookings)
      const allBookings = room.allBookingsToday ?? [];
      const blockEndTime = this.findBlockEndTime(room.currentBooking, allBookings);

      const formattedEndTime = this.datePipe.transform(blockEndTime, 'HH:mm');

      return {
        text: `Gebucht bis ${formattedEndTime} Uhr`,
        cssClass: 'booked'
      };
    }

    // PRIORITÄT 2: Ist der Raum JETZT frei, hat aber noch spätere Buchungen an diesem Tag?
    if (room.nextBooking) {
      const totalBookings = room.totalBookingsToday ?? 0;
      const totalBookedMinutes = room.totalBookedMinutesToday ?? 0;

      // Business hours: 8:00 - 20:00 = 720 minutes (12 hours)
      const businessHoursMinutes = 720;
      const bookedPercentage = (totalBookedMinutes / businessHoursMinutes) * 100;

      console.log(`Room ${room.name}: ${totalBookings} bookings, ${totalBookedMinutes} minutes (${bookedPercentage.toFixed(1)}% of day)`);

      // SONDERFALL: Ist der Raum praktisch komplett ausgebucht?
      // Kriterien: 3+ Buchungen ODER mehr als 66% des Tages gebucht
      if (totalBookings >= 3 || bookedPercentage > 66) {
        return {
          text: 'FÜR HEUTE AUSGEBUCHT',
          cssClass: 'booked'
        };
      }

      // Raum ist verfügbar bis zur nächsten Buchung
      const nextBookingStartTime = new Date(room.nextBooking.start_time);
      const formattedTime = this.datePipe.transform(nextBookingStartTime, 'HH:mm');

      return {
        text: `Verfügbar bis ${formattedTime} Uhr`,
        cssClass: 'available-soon'
      };
    }

    // PRIORITÄT 3: Ist der Raum JETZT frei und hat für den Rest des Tages KEINE weiteren Buchungen mehr?
    return {
      text: 'VERFÜGBAR DEN GANZEN TAG',
      cssClass: 'available'
    };
  }
}
