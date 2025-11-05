import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, DestroyRef } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../services/api.service'; // Keep ApiService for API calls
import { Room } from '../../models/room.model'; // Import Room from the updated model
import { Booking } from '../../models/booking.model'; // Import Booking model
import { RoomCardComponent } from '../../components/room-card/room-card.component';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { timer } from 'rxjs'; // Import timer
import { filter } from 'rxjs/operators'; // Import filter operator
import { AuthService } from '../../services/auth.service';
import { ConfirmationDialogComponent } from '../../components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDialogModule,
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
  private readonly authService = inject(AuthService);
  private readonly dialog = inject(MatDialog);

  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly rooms = signal<Room[]>([]);

  readonly countdown = signal<number>(0); // Real-time countdown signal
  readonly highlightedRoomId = signal<number | null>(null); // PART 2: Room to highlight with rainbow
  readonly canManageRooms = signal<boolean>(this.authService.currentUserSnapshot?.role === 'admin');
  readonly currentUserId = signal<number | null>(this.authService.currentUserSnapshot?.id ?? null);
  readonly selectedRoom = signal<Room | null>(null);
  readonly roomBookings = signal<Booking[] | null>(null);
  readonly bookingsLoading = signal<boolean>(false);
  readonly bookingsError = signal<string | null>(null);
  readonly deletingBookingId = signal<number | null>(null);
  readonly todayKey = this.datePipe.transform(new Date(), 'yyyy-MM-dd', undefined, 'de-DE') ?? '';
  readonly todayLabel = this.datePipe.transform(new Date(), 'EEEE, d. MMM', undefined, 'de-DE') ?? 'Heute';
  readonly bookingGroups = computed(() => {
    const bookings = this.roomBookings();
    if (!bookings?.length) {
      return [];
    }

    const sorted = [...bookings].sort((a, b) => {
      const startA = this.coerceDate(a.start_time).getTime();
      const startB = this.coerceDate(b.start_time).getTime();
      return startA - startB;
    });

    const groupsMap = new Map<string, Booking[]>();

    for (const booking of sorted) {
      const key = this.getDateKey(booking.start_time);
      if (!groupsMap.has(key)) {
        groupsMap.set(key, []);
      }
      groupsMap.get(key)!.push(booking);
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const groups = Array.from(groupsMap.entries()).map(([dateKey, items]) => {
      const firstDate = this.coerceDate(items[0].start_time);
      const isToday = dateKey === this.todayKey;
      const isPast = firstDate.getTime() < startOfToday.getTime();
      const label =
        isToday
          ? 'Heute'
          : this.datePipe.transform(firstDate, 'EEEE, d. MMM', undefined, 'de-DE') ?? dateKey;

      return {
        dateKey,
        dateValue: firstDate.getTime(),
        dateLabel: label,
        isToday,
        isPast,
        bookings: items
      };
    });

    groups.sort((a, b) => {
      if (a.isToday && !b.isToday) {
        return -1;
      }
      if (!a.isToday && b.isToday) {
        return 1;
      }
      if (a.isPast !== b.isPast) {
        return a.isPast ? 1 : -1; // Future groups before past groups
      }
      if (a.isPast && b.isPast) {
        return b.dateValue - a.dateValue; // Show most recent past first
      }
      return a.dateValue - b.dateValue;
    });

    return groups;
  });

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
  readonly bookingsSubtitle = computed(() => {
    const groups = this.bookingGroups();
    if (!groups.length) {
      return `Termine ab ${this.todayLabel}`;
    }

    const firstGroup = groups[0];

    if (firstGroup.isToday) {
      const hasFuture = groups.some(group => !group.isPast && !group.isToday);
      return hasFuture ? 'Heutige und kommende Termine' : 'Heutige Termine';
    }

    if (!firstGroup.isPast) {
      return `Termine ab ${firstGroup.dateLabel}`;
    }

    return 'Buchungsverlauf';
  });

  constructor() {
    console.log('DashboardPageComponent constructor called.');

    // Start timer to refresh status every second
    timer(0, 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(tick => {
        this.countdown.set(tick);
      });

    this.authService.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(user => {
        this.canManageRooms.set((user?.role ?? 'user') === 'admin');
        this.currentUserId.set(user?.id ?? null);
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
    const selectedRoomId = this.selectedRoom()?.id ?? null;

    this.api.getRooms()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rooms) => {
          console.log('Rooms loaded successfully:', rooms);
          this.rooms.set(rooms);

           if (selectedRoomId) {
             const updatedRoom = rooms.find(room => room.id === selectedRoomId) ?? null;
             if (updatedRoom) {
               this.selectedRoom.set(updatedRoom);
             } else {
               this.closeBookingsPanel();
             }
           }

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

  onShowRoomBookings(roomId: number): void {
    this.fetchRoomBookings(roomId);
  }

  closeBookingsPanel(): void {
    this.selectedRoom.set(null);
    this.roomBookings.set(null);
    this.bookingsError.set(null);
    this.bookingsLoading.set(false);
    this.deletingBookingId.set(null);
  }

  formatTime(value: string): string {
    return this.datePipe.transform(value, 'HH:mm', undefined, 'de-DE') ?? '';
  }

  isOwnBooking(booking: Booking): boolean {
    const userId = this.currentUserId();
    return userId !== null && booking.createdBy === userId;
  }

  onDeleteBooking(booking: Booking, event: Event): void {
    event.stopPropagation();

    if (!this.canManageRooms() && !this.isOwnBooking(booking)) {
      return;
    }

    const selectedRoomId = this.selectedRoom()?.id;
    if (!selectedRoomId) {
      console.warn('No room is currently selected; cannot delete booking.');
      return;
    }

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        message: `Möchten Sie die Buchung „${booking.title ?? 'Ohne Titel'}” wirklich löschen?`
      }
    });

    dialogRef.afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(confirmed => {
        if (!confirmed) {
          return;
        }

        this.deletingBookingId.set(booking.id);
        this.bookingsError.set(null);

        this.api.deleteBooking(booking.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              console.log(`Booking with ID ${booking.id} deleted successfully.`);
              this.deletingBookingId.set(null);
              this.refreshRoomBookings(selectedRoomId);
              this.loadRooms();
            },
            error: err => {
              console.error(`Error deleting booking with ID ${booking.id}:`, err);
              this.deletingBookingId.set(null);
              this.bookingsError.set('Die Buchung konnte nicht gelöscht werden.');
            }
          });
      });
  }

  private refreshRoomBookings(roomId: number): void {
    this.fetchRoomBookings(roomId, true);
  }

  private fetchRoomBookings(roomId: number, skipToggle = false): void {
    const currentSelection = this.selectedRoom();
    const isSameRoom = currentSelection?.id === roomId;

    if (!skipToggle && isSameRoom && !this.bookingsLoading()) {
      this.closeBookingsPanel();
      return;
    }

    const room = this.rooms().find(r => r.id === roomId);

    if (!room) {
      console.warn(`Room with ID ${roomId} not found when trying to show bookings.`);
      return;
    }

    this.selectedRoom.set(room);
    this.bookingsError.set(null);
    if (!skipToggle) {
      this.roomBookings.set(null);
    }

    this.bookingsLoading.set(true);

    this.api.getRoomBookings(roomId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: bookings => {
          this.roomBookings.set(bookings);
          this.bookingsLoading.set(false);
        },
        error: err => {
          console.error(`Error loading bookings for room ${roomId}:`, err);
          this.bookingsError.set('Die Buchungen konnten nicht geladen werden.');
          this.bookingsLoading.set(false);
        }
      });
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

  private coerceDate(value: string | Date): Date {
    return value instanceof Date ? value : new Date(value);
  }

  private getDateKey(value: string | Date): string {
    const date = this.coerceDate(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return this.datePipe.transform(date, 'yyyy-MM-dd', undefined, 'de-DE') ?? '';
  }

  getRoomStatus(room: Room): { text: string; cssClass: string } {
    const rawStatus = room.statusRaw ?? room.status?.toString().toLowerCase();
    if (rawStatus === 'maintenance') {
      return { text: 'IN WARTUNG', cssClass: 'maintenance-state' };
    }

    if (rawStatus === 'inactive') {
      return { text: 'NICHT VERFÜGBAR', cssClass: 'inactive-state' };
    }

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
