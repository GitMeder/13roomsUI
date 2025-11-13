import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
  DestroyRef,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  formatToHHMM,
  formatToYYYYMMDD,
  formatToVerboseGermanDate,
  getTimeDifferenceInSeconds,
} from '../../utils/date-time.utils';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatBadgeModule } from '@angular/material/badge';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../services/api.service';
import { Room } from '../../models/room.model';
import { Booking } from '../../models/booking.model';
import { RoomCardComponent, RoomStatusInfo } from '../../components/room-card/room-card.component';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { timer } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { ErrorHandlingService } from '../../core/services/error-handling.service';
import { ConfirmationDialogComponent } from '../../components/confirmation-dialog/confirmation-dialog.component';
import { animate, style, transition, trigger } from '@angular/animations';

/**
 * DashboardPageComponent - Premium dashboard with real-time room status
 *
 * Architecture improvements:
 * - Signal-first state management for reactive updates
 * - Computed signals for derived state (statistics, filtering)
 * - Cleaner separation of concerns
 * - Enhanced error handling and loading states
 */
@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDialogModule,
    MatDividerModule,
    MatBadgeModule,
    RoomCardComponent,
    RouterLink,
  ],
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate(
          '300ms ease-out',
          style({ transform: 'translateX(0)', opacity: 1 })
        ),
      ]),
      transition(':leave', [
        animate(
          '300ms ease-in',
          style({ transform: 'translateX(100%)', opacity: 0 })
        ),
      ]),
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('300ms ease-out', style({ opacity: 1 })),
      ]),
    ]),
  ],
})
export class DashboardPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly errorHandler = inject(ErrorHandlingService);

  // Core state signals
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly rooms = signal<Room[]>([]);
  readonly countdown = signal<number>(0);
  readonly heartbeat = signal<number>(0);
  readonly highlightedRoomId = signal<number | null>(null);
  readonly selectedRoom = signal<Room | null>(null);
  readonly roomBookings = signal<Booking[] | null>(null);
  readonly bookingsLoading = signal<boolean>(false);
  readonly bookingsError = signal<string | null>(null);
  readonly deletingBookingId = signal<number | null>(null);

  // User state
  readonly currentUser = computed(() => this.authService.currentUser());
  readonly isGuest = computed(() => this.authService.isGuest());
  readonly isAdmin = computed(() => this.currentUser()?.role === 'admin');
  readonly currentUserId = computed(() => this.currentUser()?.id ?? null);

  // Central room statuses - computed Map that updates with heartbeat
  // THIS IS THE SINGLE SOURCE OF TRUTH FOR ALL TIME-BASED UI LOGIC
  readonly roomStatuses = computed(() => {
    const tick = this.heartbeat(); // Create reactive dependency on heartbeat
    const allRooms = this.rooms(); // Create reactive dependency on rooms list

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('[DASHBOARD - roomStatuses] Computing room statuses (CENTRALIZED TIME LOGIC)...');
    console.log('[DASHBOARD - roomStatuses] Heartbeat tick:', tick);
    console.log('[DASHBOARD - roomStatuses] Total rooms:', allRooms.length);
    console.log('═══════════════════════════════════════════════════════════════');

    // Create a Map to hold the COMPLETE status info for each room ID
    const statuses = new Map<number, RoomStatusInfo>();

    for (const room of allRooms) {
      console.log(`\n[DASHBOARD ${room.name} (ID: ${room.id})]`);
      console.log(`  Room status raw:`, room.statusRaw ?? room.status);

      // Calculate and store the COMPLETE status info for each room
      const statusInfo = this.calculateRoomStatusInfo(room);
      console.log(`  → Computed status info:`, statusInfo);
      statuses.set(room.id, statusInfo);
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('[DASHBOARD - roomStatuses] Computation complete');
    console.log('═══════════════════════════════════════════════════════════════\n');

    return statuses;
  });

  // Live booking counts - only upcoming bookings (updates every minute with heartbeat)
  readonly upcomingBookingCounts = computed(() => {
    const tick = this.heartbeat(); // Create reactive dependency on heartbeat
    const allRooms = this.rooms(); // Create reactive dependency on rooms list

    // Create a Map to hold the upcoming booking count for each room ID
    const counts = new Map<number, number>();

    for (const room of allRooms) {
      // Count only bookings where end_time is in the future (positive difference)
      let upcomingCount = 0;

      if (room.allBookingsToday && Array.isArray(room.allBookingsToday)) {
        upcomingCount = room.allBookingsToday.filter(booking => {
          return getTimeDifferenceInSeconds(booking.end_time) > 0;
        }).length;
      }

      counts.set(room.id, upcomingCount);
    }

    return counts;
  });

  // Welcome message with time-based greeting
  readonly welcomeMessage = computed(() => {
    const user = this.currentUser();
    if (!user || user.role === 'guest') return 'Willkommen im 13Rooms Dashboard';

    const hour = new Date().getHours();
    let greeting = 'Guten Tag';

    if (hour < 12) {
      greeting = 'Guten Morgen';
    } else if (hour < 18) {
      greeting = 'Guten Nachmittag';
    } else {
      greeting = 'Guten Abend';
    }

    return `${greeting} ${
      user.firstname || 'Nutzer'
    }!`;
  });

  // Room statistics - computed signals for reactive updates
  readonly roomStats = computed(() => {
    const list = this.rooms();
    const statuses = this.roomStatuses(); // Use central roomStatuses Map
    if (!list.length) return null;

    const stats = {
      total: list.length,
      available: 0,
      availableSoon: 0,
      booked: 0,
      disabled: 0,
      totalCapacity: 0,
      largestRoom: null as Room | null,
      mostBookedRoom: null as Room | null,
    };

    let maxBookings = 0;

    for (const room of list) {
      const status = statuses.get(room.id)!;

      switch (status.cssClass) {
        case 'available':
          stats.available++;
          break;
        case 'available-soon':
          stats.availableSoon++;
          break;
        case 'booked':
          stats.booked++;
          break;
        case 'night-rest-state':
        case 'maintenance-state':
        case 'inactive-state':
          stats.disabled++;
          break;
      }

      stats.totalCapacity += room.capacity || 0;

      if (
        !stats.largestRoom ||
        (room.capacity || 0) > (stats.largestRoom.capacity || 0)
      ) {
        stats.largestRoom = room;
      }

      const bookingsToday = room.totalBookingsToday || 0;
      if (bookingsToday > maxBookings) {
        maxBookings = bookingsToday;
        stats.mostBookedRoom = room;
      }
    }

    return stats;
  });

  // Business status
  readonly isNightRest = computed(() => {
    const list = this.rooms();
    return (
      list.length > 0 && list.every((room) => room.status === 'night_rest')
    );
  });

  // Dashboard subtitle
  readonly subtitle = computed(() => {
    if (this.loading()) {
      return 'Aktuelle Raumdaten werden geladen …';
    }

    const stats = this.roomStats();
    if (!stats) {
      return 'Keine Räume verfügbar';
    }

    if (this.isNightRest()) {
      return 'Geschäftszeiten: 08:00 - 20:00 Uhr';
    }

    return `${stats.total} Räume · ${stats.available} sofort verfügbar · ${stats.totalCapacity} Plätze gesamt`;
  });

  // Date utilities
  readonly todayKey = formatToYYYYMMDD(new Date());
  readonly todayLabel = formatToVerboseGermanDate(new Date());

  // Booking groups for selected room
  readonly bookingGroups = computed(() => {
    const bookings = this.roomBookings();
    if (!bookings?.length) return [];

    const sorted = [...bookings].sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

    const groupsMap = new Map<string, Booking[]>();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    for (const booking of sorted) {
      const key = this.getDateKey(booking.start_time);
      if (!groupsMap.has(key)) {
        groupsMap.set(key, []);
      }
      groupsMap.get(key)!.push(booking);
    }

    return Array.from(groupsMap.entries())
      .map(([dateKey, items]) => {
        const firstDate = new Date(items[0].start_time);
        const isToday = dateKey === this.todayKey;
        const isPast = firstDate.getTime() < startOfToday.getTime();
        const label = isToday
          ? 'Heute'
          : formatToVerboseGermanDate(firstDate);

        return {
          dateKey,
          dateValue: firstDate.getTime(),
          dateLabel: label,
          isToday,
          isPast,
          bookings: items,
        };
      })
      .sort((a, b) => {
        if (a.isToday) return -1;
        if (b.isToday) return 1;
        if (a.isPast !== b.isPast) return a.isPast ? 1 : -1;
        return a.isPast ? b.dateValue - a.dateValue : a.dateValue - b.dateValue;
      });
  });

  readonly bookingsSubtitle = computed(() => {
    const groups = this.bookingGroups();
    if (!groups.length) return `Termine ab ${this.todayLabel}`;

    const firstGroup = groups[0];
    if (firstGroup.isToday) {
      const hasFuture = groups.some((g) => !g.isPast && !g.isToday);
      return hasFuture ? 'Heutige und kommende Termine' : 'Heutige Termine';
    }

    return firstGroup.isPast
      ? 'Buchungsverlauf'
      : `Termine ab ${firstGroup.dateLabel}`;
  });

  constructor() {
    // Set up real-time updates for progress bars (every second)
    timer(0, 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.countdown.set(Date.now()));

    // Set up heartbeat for room status re-evaluation (every 60 seconds)
    timer(0, 60000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.heartbeat.set(Date.now()));

    // Reload on navigation to dashboard
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        filter((event: NavigationEnd) => event.url === '/' || event.url === ''),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.loadRooms();
      });
  }

  ngOnInit(): void {
    // Check for highlighted room from navigation
    const state = window.history.state;
    if (state?.['highlightedRoomId']) {
      const roomId = state['highlightedRoomId'] as number;
      this.highlightedRoomId.set(roomId);

      // Clear highlight after animation
      setTimeout(() => this.highlightedRoomId.set(null), 5000);
    }

    this.loadRooms();
  }

  public loadRooms(): void {
    this.loading.set(true);
    this.error.set(null);
    const selectedRoomId = this.selectedRoom()?.id;

    this.api
      .getRooms()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rooms) => {
          this.rooms.set(rooms);

          // Update selected room if it still exists
          if (selectedRoomId) {
            const updatedRoom = rooms.find((r) => r.id === selectedRoomId);
            if (updatedRoom) {
              this.selectedRoom.set(updatedRoom);
            } else {
              this.closeBookingsPanel();
            }
          }

          this.loading.set(false);
        },
        error: (err) => {
          this.error.set('Die Räume konnten nicht geladen werden.');
          this.loading.set(false);
          // ErrorHandlingService already displays error via ApiService
        },
      });
  }

  /**
   * ════════════════════════════════════════════════════════════════════════════
   * CENTRALIZED TIME LOGIC - SINGLE SOURCE OF TRUTH
   * ════════════════════════════════════════════════════════════════════════════
   *
   * This method is the ONLY place where time-based UI calculations happen.
   * It uses ONLY getTimeDifferenceInSeconds from date-time.utils.ts.
   * Returns complete RoomStatusInfo with ALL display data pre-calculated.
   *
   * @param room - Room object with current/next booking data
   * @returns Complete RoomStatusInfo with text, CSS class, button text, progress, etc.
   */
  calculateRoomStatusInfo(room: Room): RoomStatusInfo {
    const rawStatus = room.statusRaw ?? room.status?.toString().toLowerCase();

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: Handle special states (night rest, maintenance, inactive)
    // ═══════════════════════════════════════════════════════════════════
    const specialStates: { [key: string]: Omit<RoomStatusInfo, 'buttonText' | 'progressValue'> } = {
      night_rest: { text: 'NACHTRUHE', cssClass: 'night-rest-state' },
      maintenance: { text: 'IN WARTUNG', cssClass: 'maintenance-state' },
      inactive: { text: 'NICHT VERFÜGBAR', cssClass: 'inactive-state' },
    };

    if (rawStatus && specialStates[rawStatus]) {
      return {
        ...specialStates[rawStatus],
        buttonText: 'Nicht verfügbar',
        progressValue: 0,
      };
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: Find CURRENT booking dynamically from allBookingsToday
    // This fixes edge case where backend data is stale and booking just started
    // ═══════════════════════════════════════════════════════════════════
    const currentBooking = room.allBookingsToday?.find(b => {
      const startsIn = getTimeDifferenceInSeconds(b.start_time);
      const endsIn = getTimeDifferenceInSeconds(b.end_time);
      // FIXED: Changed < to <= to correctly identify bookings starting exactly now
      return startsIn <= 0 && endsIn > 0;
    });

    if (currentBooking) {
      const endDiff = getTimeDifferenceInSeconds(currentBooking.end_time);

      // Find the end of consecutive booking block
      const blockEndTimeStr = this.findBlockEndTimeString(
        currentBooking,
        room.allBookingsToday ?? []
      );
      const formattedEndTime = formatToHHMM(blockEndTimeStr);

      // Check if heavily booked
      const totalBookings = room.totalBookingsToday ?? 0;
      const totalMinutes = room.totalBookedMinutesToday ?? 0;
      const businessHoursMinutes = 720; // 12 hours
      const bookedPercentage = (totalMinutes / businessHoursMinutes) * 100;

      if (totalBookings >= 3 || bookedPercentage > 66) {
        return {
          text: 'HEUTE AUSGEBUCHT',
          cssClass: 'booked',
          buttonText: 'Besetzt',
          progressValue: 0,
        };
      }

      // Calculate progress (0-100)
      const startDiff = getTimeDifferenceInSeconds(currentBooking.start_time);
      const totalDuration = Math.abs(startDiff) + endDiff; // Total booking duration
      const elapsed = Math.abs(startDiff); // Time since start
      const progressValue = totalDuration > 0
        ? Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100)
        : 0;

      return {
        text: `Besetzt bis ${formattedEndTime} Uhr`,
        cssClass: 'booked',
        buttonText: 'Besetzt',
        progressValue,
        remainingSeconds: Math.max(endDiff, 0),
      };
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: Find NEXT booking dynamically from allBookingsToday
    // Room is available now, check when it becomes unavailable
    // ═══════════════════════════════════════════════════════════════════
    const nextBooking = room.allBookingsToday?.find(b => {
      const startsIn = getTimeDifferenceInSeconds(b.start_time);
      return startsIn > 0; // Booking starts in the future
    });

    if (nextBooking) {
      const nextStartDiff = getTimeDifferenceInSeconds(nextBooking.start_time);
      const formattedTime = formatToHHMM(nextBooking.start_time);
      const minutesUntilNext = Math.floor(nextStartDiff / 60);
      const buttonText = this.formatAvailabilityButton(minutesUntilNext);

      return {
        text: `Verfügbar bis ${formattedTime} Uhr`,
        cssClass: 'available-soon',
        buttonText,
        progressValue: 0,
        minutesUntilNext,
      };
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: Room is completely free for the day
    // ═══════════════════════════════════════════════════════════════════
    return {
      text: 'GANZEN TAG VERFÜGBAR',
      cssClass: 'available',
      buttonText: 'Jetzt buchen',
      progressValue: 0,
    };
  }

  /**
   * Find the end time string of a booking block (consecutive bookings).
   * Uses string comparisons to avoid timezone issues.
   */
  private findBlockEndTimeString(
    currentBooking: Booking,
    allBookings: Booking[]
  ): string {
    let blockEndTimeStr = currentBooking.end_time;
    let foundConsecutive = true;

    while (foundConsecutive) {
      foundConsecutive = false;

      for (const booking of allBookings) {
        // Check if booking starts exactly when current block ends
        if (booking.start_time === blockEndTimeStr) {
          blockEndTimeStr = booking.end_time;
          foundConsecutive = true;
          break;
        }
      }
    }

    return blockEndTimeStr;
  }

  /**
   * Format button text for available rooms showing remaining time
   */
  private formatAvailabilityButton(minutes: number): string {
    if (minutes < 60) {
      return `Buchen (${minutes} Min frei)`;
    }

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (mins === 0) {
      return `Buchen (${hours} Std frei)`;
    }

    return `Buchen (${hours} Std ${mins} Min frei)`;
  }


  // Event handlers
  onDeleteRoom(roomId: number): void {
    this.api.deleteRoom(roomId).subscribe({
      next: () => {
        this.errorHandler.showSuccess('Raum erfolgreich gelöscht.');
        this.loadRooms();
      },
      error: () => {
        // ErrorHandlingService already displays error via ApiService
      },
    });
  }

  onRoomCardClick(roomId: number): void {
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

  public fetchRoomBookings(roomId: number, skipToggle = false): void {
    const currentSelection = this.selectedRoom();
    const isSameRoom = currentSelection?.id === roomId;

    if (!skipToggle && isSameRoom && !this.bookingsLoading()) {
      this.closeBookingsPanel();
      return;
    }

    const room = this.rooms().find((r) => r.id === roomId);
    if (!room) return;

    this.selectedRoom.set(room);
    this.bookingsError.set(null);
    if (!skipToggle) {
      this.roomBookings.set(null);
    }

    this.bookingsLoading.set(true);

    this.api
      .getRoomBookings(roomId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (bookings) => {
          this.roomBookings.set(bookings);
          this.bookingsLoading.set(false);
        },
        error: () => {
          this.bookingsError.set('Die Buchungen konnten nicht geladen werden.');
          this.bookingsLoading.set(false);
          // ErrorHandlingService already displays error via ApiService
        },
      });
  }

  onDeleteBooking(booking: Booking, event: Event): void {
    event.stopPropagation();

    if (!this.isAdmin() && !this.isOwnBooking(booking)) return;

    const selectedRoomId = this.selectedRoom()?.id;
    if (!selectedRoomId) return;

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        message: `Möchten Sie die Buchung „${
          booking.title || 'Ohne Titel'
        }" wirklich löschen?`,
        confirmText: 'Löschen',
        cancelText: 'Abbrechen',
      },
      panelClass: 'modern-dialog',
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (!confirmed) return;

        this.deletingBookingId.set(booking.id);
        this.bookingsError.set(null);

        this.api
          .deleteBooking(booking.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.deletingBookingId.set(null);
              this.errorHandler.showSuccess('Buchung erfolgreich gelöscht.');
              this.fetchRoomBookings(selectedRoomId, true);
              this.loadRooms();
            },
            error: () => {
              this.deletingBookingId.set(null);
              this.bookingsError.set('Die Buchung konnte nicht gelöscht werden.');
              // ErrorHandlingService already displays error via ApiService
            },
          });
      });
  }

  // Utilities
  /**
   * Formats a date/time string to HH:mm format WITHOUT timezone conversion.
   * This is the single source of truth for time formatting across the dashboard.
   * Simply extracts the time part from the datetime string without any conversion.
   */
  formatTime = formatToHHMM;

  isOwnBooking(booking: Booking): boolean {
    const userId = this.currentUserId();
    return userId !== null && booking.createdBy === userId;
  }

  public getCreatorName(booking: Booking): string {
    if (booking.createdByName) {
      return booking.createdByName;
    }
    if (booking.createdByEmail) {
      return booking.createdByEmail.split('@')[0];
    }
    return 'Unbekannt';
  }

  private getDateKey(value: string | Date): string {
    const date = value instanceof Date ? value : new Date(value);
    return formatToYYYYMMDD(date);
  }
}
