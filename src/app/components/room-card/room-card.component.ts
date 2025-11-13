import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  inject,
  computed,
  signal,
} from '@angular/core';
import { NgClass, SlicePipe, DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRippleModule } from '@angular/material/core';
import { MatBadgeModule } from '@angular/material/badge';
import { Router } from '@angular/router';
import { Room } from '../../models/room.model';
import { ConfirmationDialogComponent } from '../confirmation-dialog/confirmation-dialog.component';
import { timer } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { formatToHHMM, calculateMinutesBetweenTimes } from '../../utils/date-time.utils';

/**
 * RoomCardComponent - Premium room card with real-time status tracking
 *
 * Design Philosophy:
 * - Visual hierarchy: Status is the primary information, shown through colors and progress
 * - Real-time updates: Live countdown and progress bars for occupied rooms
 * - Micro-interactions: Smooth hover effects and state transitions
 * - Accessibility: Clear visual indicators and ARIA labels
 */
@Component({
  selector: 'app-room-card',
  standalone: true,
  imports: [
    MatCardModule,
    MatIconModule,
    MatChipsModule,
    NgClass,
    SlicePipe,
    DecimalPipe,
    MatButtonModule,
    MatDialogModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatRippleModule,
    MatBadgeModule,
  ],
  templateUrl: './room-card.component.html',
  styleUrls: ['./room-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomCardComponent {
  readonly room = input.required<Room>();
  readonly statusInfo = input.required<{ text: string; cssClass: string }>();
  readonly upcomingBookingCount = input<number>(0);
  readonly canDelete = input(false);
  readonly isHighlighted = input(false);

  readonly deleteRoomEvent = output<number>();
  readonly cardClick = output<number>();
  readonly showBookings = output<number>();

  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  // Real-time tracking for occupied rooms
  private readonly currentTime = signal(new Date());

  // Computed signal for booking progress (0-100)
  readonly bookingProgress = computed(() => {
    const room = this.room();
    const status = this.statusInfo();

    if (status.cssClass !== 'booked' || !room.currentBooking) {
      return 0;
    }

    const now = this.currentTime();
    const startTime = new Date(room.currentBooking.start_time);
    const endTime = new Date(room.currentBooking.end_time);

    const totalDuration = endTime.getTime() - startTime.getTime();
    const elapsed = now.getTime() - startTime.getTime();

    const progress = (elapsed / totalDuration) * 100;
    return Math.min(Math.max(progress, 0), 100);
  });

  // Computed signal for remaining time in minutes
  readonly remainingMinutes = computed(() => {
    const room = this.room();
    const status = this.statusInfo();

    if (status.cssClass !== 'booked' || !room.currentBooking) {
      return null;
    }

    const now = this.currentTime();
    const endTime = new Date(room.currentBooking.end_time);
    const remaining = endTime.getTime() - now.getTime();

    return Math.max(Math.floor(remaining / 60000), 0);
  });

  // Computed signal for time until next booking (timezone-safe calculation)
  readonly minutesUntilNextBooking = computed(() => {
    const room = this.room();
    const status = this.statusInfo();

    if (status.cssClass !== 'available-soon') {
      return null;
    }

    // Get current time as HH:mm using timezone-safe formatting
    const now = this.currentTime();
    const currentTimeStr = formatToHHMM(now.toISOString());

    // If there's a next booking, calculate time until it starts
    if (room.nextBooking) {
      const nextStartStr = formatToHHMM(room.nextBooking.start_time);
      return calculateMinutesBetweenTimes(currentTimeStr, nextStartStr);
    }

    // If no next booking, calculate time until end of business hours (20:00)
    return calculateMinutesBetweenTimes(currentTimeStr, '20:00');
  });

  // Computed signal for status icon
  readonly statusIcon = computed(() => {
    const status = this.statusInfo().cssClass;

    const iconMap: Record<string, string> = {
      available: 'check_circle',
      'available-soon': 'schedule',
      booked: 'event_busy',
      'night-rest-state': 'nights_stay',
      'maintenance-state': 'build',
      'inactive-state': 'block',
    };

    return iconMap[status] || 'help_outline';
  });

  // Computed signal for interactive state
  readonly isInteractive = computed(() => {
    const status = this.statusInfo().cssClass;
    return ![
      'night-rest-state',
      'maintenance-state',
      'inactive-state',
    ].includes(status);
  });

  constructor() {
    // Update current time every second for real-time progress
    timer(0, 1000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.currentTime.set(new Date());
      });
  }

  onDelete(event: Event): void {
    event.stopPropagation();
    const room = this.room();

    if (!room?.id) return;

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        message: `Möchten Sie den Raum „${room.name}" wirklich löschen?`,
        confirmText: 'Löschen',
        cancelText: 'Abbrechen',
      },
      panelClass: 'modern-dialog',
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.deleteRoomEvent.emit(room.id);
      }
    });
  }

  onEdit(event: Event): void {
    event.stopPropagation();
    const room = this.room();

    if (room?.id) {
      void this.router.navigate(['/rooms', room.id, 'edit']);
    }
  }

  onCardClick(): void {
    if (!this.isInteractive()) return;

    const room = this.room();
    if (room?.id) {
      this.cardClick.emit(room.id);
    }
  }

  onShowBookings(event: Event): void {
    event.stopPropagation();
    const room = this.room();

    if (room?.id) {
      this.showBookings.emit(room.id);
    }
  }

  onBookRoom(event: Event): void {
    event.stopPropagation();
    const room = this.room();

    if (room?.id && this.isInteractive()) {
      this.router.navigate(['/bookings', room.id]);
    }
  }

  formatRemainingTime(minutes: number | null): string {
    if (minutes === null) return '';

    if (minutes < 60) {
      return `${minutes} Min`;
    }

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (mins === 0) {
      return `${hours} Std`;
    }

    return `${hours} Std ${mins} Min`;
  }
}
