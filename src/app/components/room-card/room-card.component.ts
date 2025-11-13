import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  inject,
  computed,
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

/**
 * Comprehensive room status information interface.
 * All time-based calculations and display data are computed by the parent (dashboard)
 * and passed down to the "dumb" room card component.
 */
export interface RoomStatusInfo {
  /** Display text for the room status (e.g., "Verfügbar bis 14:35") */
  text: string;

  /** CSS class for styling (e.g., "available-soon", "booked") */
  cssClass: string;

  /** Text for the booking button (e.g., "Buchen (41 Min frei)") */
  buttonText: string;

  /** Progress bar value (0-100) for booked rooms */
  progressValue: number;

  /** Remaining seconds for countdown (optional, used for real-time updates) */
  remainingSeconds?: number;

  /** Minutes until next booking (for available-soon status) */
  minutesUntilNext?: number;
}

/**
 * RoomCardComponent - Pure presentational room card component
 *
 * Design Philosophy:
 * - DUMB COMPONENT: No time calculations, no business logic
 * - All display data comes from parent via @Input()
 * - Visual hierarchy: Status is the primary information, shown through colors and progress
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
  // ===== INPUTS (Data from parent) =====
  readonly room = input.required<Room>();
  readonly statusInfo = input.required<RoomStatusInfo>();
  readonly upcomingBookingCount = input<number>(0);
  readonly canDelete = input(false);
  readonly isHighlighted = input(false);

  // ===== OUTPUTS (Events to parent) =====
  readonly deleteRoomEvent = output<number>();
  readonly cardClick = output<number>();
  readonly showBookings = output<number>();

  // ===== SERVICES =====
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  // ===== COMPUTED PROPERTIES (Derived from inputs, NO time calculations) =====

  // Status icon based on CSS class
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

  // Interactive state based on CSS class
  readonly isInteractive = computed(() => {
    const status = this.statusInfo().cssClass;
    return ![
      'night-rest-state',
      'maintenance-state',
      'inactive-state',
    ].includes(status);
  });

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
}
