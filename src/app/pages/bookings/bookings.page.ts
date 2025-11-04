import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService, BookingPayload } from '../../services/api.service';
import { Observable } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { Room } from '../../models/room.model';
import { Booking } from '../../models/booking.model';
import { CommonModule, DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { BookingFormComponent } from '../../components/booking-form/booking-form.component';
import { RoomSelectionDialogComponent } from '../../components/room-selection-dialog/room-selection-dialog.component';

@Component({
  selector: 'app-bookings-page',
  standalone: true,
  imports: [CommonModule, BookingFormComponent, MatCardModule, MatProgressSpinnerModule, MatIconModule, MatButtonModule, RouterModule, MatSnackBarModule],
  providers: [DatePipe],
  templateUrl: './bookings.page.html',
  styleUrls: ['./bookings.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookingsPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly apiService = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly isSubmitting = signal<boolean>(false);
  readonly isSmartRebooking = signal<boolean>(false);

  // Store original booking payload for smart rebooking
  private originalBookingPayload: BookingPayload | null = null;

  // SNACKBAR SPAM FIX: Flag to prevent duplicate conflict handling
  private isHandlingConflict = false;

  // SNACKBAR SPAM FIX: Flag to prevent duplicate alternative room searches
  private isSearchingAlternatives = false;

  // Observable for the page data
  pageData$!: Observable<{
    room: Room | null;
    conflict: Booking | null;
    suggestedStartTime: string | null;
    suggestedEndTime: string | null;
    prefillData?: {
      date: string;
      startTime: string;
      endTime: string;
      title: string;
      name?: string;
      comment?: string;
    };
  }>;

  ngOnInit(): void {
    console.log('[BookingsPage] ngOnInit');
    this.pageData$ = this.route.data.pipe(
      map(data => {
        const pageData = data['pageData'];
        console.log('[BookingsPage] Received resolved data:', pageData);

        // Set smart rebooking flag if present
        if (pageData.isSmartRebooking) {
          this.isSmartRebooking.set(true);
        }

        // Add suggested times for normal booking mode
        if (pageData.room && !pageData.conflict && !pageData.isSmartRebooking) {
          const { suggestedStartTime, suggestedEndTime } = this.calculateSuggestedTimes();
          return { ...pageData, suggestedStartTime, suggestedEndTime };
        }

        return pageData;
      })
    );
  }

  /**
   * Returns true iff the given room allows new bookings.
   * The backend persists statuses as 'active' | 'inactive' | 'maintenance', while the UI historically
   * exposed labels such as 'available' or 'occupied'. We normalise to the canonical values here.
   */
  isRoomBookable(room: Room | null | undefined): boolean {
    if (!room) {
      return false;
    }
    const normalizedStatus = this.normalizeRoomStatus(room.statusRaw ?? room.status);
    return normalizedStatus === 'active';
  }

  /**
   * Helper exposed to the template to describe why a room is unavailable.
   */
  getRoomAvailabilityMessage(room: Room | null | undefined): string {
    const normalizedStatus = this.normalizeRoomStatus(room?.statusRaw ?? room?.status);
    switch (normalizedStatus) {
      case 'maintenance':
        return 'befindet sich aktuell in Wartung und kann nicht gebucht werden.';
      case 'inactive':
        return 'ist derzeit deaktiviert und steht für Buchungen nicht zur Verfügung.';
      default:
        return 'ist aktiv.';
    }
  }

  private calculateSuggestedTimes(): { suggestedStartTime: string; suggestedEndTime: string } {
    const now = new Date();
    const minutes = now.getMinutes();

    // Round up to next 30-minute slot
    let startMinutes: number;
    if (minutes < 30) {
      startMinutes = 30;
    } else {
      startMinutes = 0;
      now.setHours(now.getHours() + 1);
    }

    const startTime = new Date(now);
    startTime.setMinutes(startMinutes);
    startTime.setSeconds(0);
    startTime.setMilliseconds(0);

    const endTime = new Date(startTime);
    endTime.setMinutes(startTime.getMinutes() + 30);

    const formatTime = (date: Date): string => {
      const hours = date.getHours().toString().padStart(2, '0');
      const mins = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${mins}`;
    };

    return {
      suggestedStartTime: formatTime(startTime),
      suggestedEndTime: formatTime(endTime)
    };
  }

  onBookingSubmit(payload: BookingPayload): void {
    // Prevent multiple submissions
    if (this.isSubmitting()) {
      console.warn('Submission already in progress, ignoring duplicate request');
      return;
    }

    this.isSubmitting.set(true);
    console.log('Submitting booking to API:', payload);

    this.apiService.createBooking(payload).subscribe({
      next: (response) => {
        console.log('Booking created successfully:', response);
        this.isSubmitting.set(false);

        // Show success notification
        this.snackBar.open('Buchung erfolgreich erstellt!', 'OK', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
          panelClass: ['success-snackbar']
        });

        // PART 2: Navigate back to dashboard with highlightedRoomId for rainbow celebration
        setTimeout(() => {
          this.router.navigate(['/'], {
            state: { highlightedRoomId: payload.roomId }
          });
        }, 500);
      },
      error: (error) => {
        console.log(`[SnackbarDebug] onBookingSubmit ERROR triggered:`, error);
        console.error('Error creating booking:', error);
        this.isSubmitting.set(false);

        // PHASE 3: Smart Failure Recovery - Handle 409 Conflict with helpful alternatives
        if (error.status === 409) {
          this.handleBookingConflict(payload, error);
        } else {
          // Handle other errors
          const errorMessage = 'Fehler beim Erstellen der Buchung. Bitte versuchen Sie es erneut.';
          this.snackBar.open(errorMessage, 'OK', {
            duration: 5000,
            horizontalPosition: 'center',
            verticalPosition: 'bottom',
            panelClass: ['error-snackbar']
          });
        }
      }
    });
  }

  /**
   * PHASE 3: Smart Failure Recovery
   * Handles booking conflicts by offering to search for alternative rooms.
   */
  private handleBookingConflict(payload: BookingPayload, error: any): void {
    // SNACKBAR SPAM FIX: Prevent duplicate handler calls
    if (this.isHandlingConflict) {
      console.log('[SmartRecovery] Already handling a conflict, ignoring duplicate trigger.');
      return;
    }
    this.isHandlingConflict = true;
    console.log('[SmartRecovery] Handling booking conflict for payload:', payload);

    // Store the original payload for rebooking
    this.originalBookingPayload = payload;

    // Get room name from the current page data
    // CRITICAL FIX: Use take(1) to ensure we only process ONE emission, preventing duplicate snackbars
    this.pageData$.pipe(take(1)).subscribe(data => {
      const roomName = data.room?.name || 'dieser Raum';

      // Show snackbar with action button
      const snackBarRef = this.snackBar.open(
        `Raum '${roomName}' ist von ${payload.startTime} bis ${payload.endTime} leider bereits belegt.`,
        'ANDERE RÄUME PRÜFEN',
        {
          duration: 10000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
          panelClass: ['warning-snackbar']
        }
      );

      // Handle action button click
      snackBarRef.onAction().subscribe(() => {
        this.searchForAlternativeRooms(payload);
      });

      // SNACKBAR SPAM FIX: Reset flag when snackbar is dismissed
      snackBarRef.afterDismissed().subscribe(() => {
        this.isHandlingConflict = false;
        console.log('[SmartRecovery] Conflict handling finished. Resetting flag.');
      });
    });
  }

  /**
   * PHASE 3+: Smart Failure Recovery with One-Click Rebooking
   * Searches for alternative rooms that are available for the user's desired time slot.
   */
  private searchForAlternativeRooms(payload: BookingPayload): void {
    // SNACKBAR SPAM FIX: Prevent duplicate searches
    if (this.isSearchingAlternatives) {
      console.log('[SmartRebooking] Already searching for alternatives, ignoring duplicate trigger.');
      return;
    }
    this.isSearchingAlternatives = true;

    console.log('[SmartRebooking] Searching for alternative rooms...');

    // Show loading state
    this.snackBar.open('Suche nach verfügbaren Räumen...', undefined, {
      duration: 2000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      panelClass: ['info-snackbar']
    });

    // Call API to find available rooms
    this.apiService.getAvailableRooms(payload.date, payload.startTime, payload.endTime).subscribe({
      next: (availableRooms) => {
        console.log('[SmartRebooking] Found available rooms:', availableRooms);

        if (availableRooms.length > 0) {
          // ONE-CLICK REBOOKING: Offer immediate booking with delightful UX
          this.showRebookingSnackbar(availableRooms);
        } else {
          // No alternative rooms available
          this.snackBar.open(
            'Leider ist für diesen Zeitraum kein anderer Raum verfügbar.',
            'OK',
            {
              duration: 5000,
              horizontalPosition: 'center',
              verticalPosition: 'bottom',
              panelClass: ['warning-snackbar']
            }
          );
        }

        // SNACKBAR SPAM FIX: Reset flag on success
        this.isSearchingAlternatives = false;
      },
      error: (error) => {
        console.error('[SmartRebooking] Error searching for alternative rooms:', error);
        this.snackBar.open(
          'Fehler bei der Suche nach verfügbaren Räumen.',
          'OK',
          {
            duration: 5000,
            horizontalPosition: 'center',
            verticalPosition: 'bottom',
            panelClass: ['error-snackbar']
          }
        );

        // SNACKBAR SPAM FIX: Reset flag on error
        this.isSearchingAlternatives = false;
      }
    });
  }

  /**
   * PHASE 3+: One-Click Rebooking
   * Shows a delightful snackbar with "JETZT BUCHEN" action button.
   */
  private showRebookingSnackbar(availableRooms: Room[]): void {
    const count = availableRooms.length;
    let message: string;

    if (count === 1) {
      message = `Gute Nachrichten! Raum '${availableRooms[0].name}' ist zu dieser Zeit frei.`;
    } else {
      message = `Gute Nachrichten! Wir haben ${count} freie Räume für dich gefunden.`;
    }

    const snackBarRef = this.snackBar.open(message, 'JETZT BUCHEN', {
      duration: 15000, // Longer duration for this important action
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      panelClass: ['success-snackbar']
    });

    // Handle "JETZT BUCHEN" button click
    snackBarRef.onAction().subscribe(() => {
      this.initiateOneClickRebooking(availableRooms);
    });
  }

  /**
   * PHASE 3+: One-Click Rebooking Logic
   * Handles the rebooking flow based on number of available rooms.
   */
  private initiateOneClickRebooking(availableRooms: Room[]): void {
    if (availableRooms.length === 1) {
      // Single room: Navigate directly with pre-filled data
      this.navigateToRebooking(availableRooms[0].id);
    } else {
      // Multiple rooms: Show dialog for selection
      const dialogRef = this.dialog.open(RoomSelectionDialogComponent, {
        width: '600px',
        data: { rooms: availableRooms }
      });

      dialogRef.afterClosed().subscribe((selectedRoom: Room | undefined) => {
        if (selectedRoom) {
          console.log('[SmartRebooking] User selected room:', selectedRoom.name);
          this.navigateToRebooking(selectedRoom.id);
        }
      });
    }
  }

  /**
   * PHASE 3+: One-Click Rebooking Navigation
   * Navigates to the booking page for the selected room with pre-filled data.
   */
  private navigateToRebooking(newRoomId: number): void {
    if (!this.originalBookingPayload) {
      console.error('[SmartRebooking] No original payload found!');
      return;
    }

    // STRATEGIC DEBUG LOG: Verify state object before navigation
    const navigationState = {
      isSmartRebooking: true,
      prefillData: {
        date: this.originalBookingPayload.date,
        startTime: this.originalBookingPayload.startTime,
        endTime: this.originalBookingPayload.endTime,
        title: this.originalBookingPayload.title,
        name: this.originalBookingPayload.title,
        comment: this.originalBookingPayload.comment
      }
    };

    console.log('[SmartRebooking] 📤 NAVIGATING to room:', newRoomId);
    console.log('[SmartRebooking] 📤 State object being passed:', JSON.stringify(navigationState, null, 2));
    console.log('[SmartRebooking] 📤 isSmartRebooking:', navigationState.isSmartRebooking);
    console.log('[SmartRebooking] 📤 prefillData:', navigationState.prefillData);

    // Navigate with state containing the original booking data and smart rebooking flag
    this.router.navigate(['/bookings', newRoomId], {
      state: navigationState
    });
  }

  private normalizeRoomStatus(status: string | undefined | null): 'active' | 'inactive' | 'maintenance' {
    const normalized = status?.toString().toLowerCase();
    switch (normalized) {
      case 'maintenance':
        return 'maintenance';
      case 'inactive':
      case 'occupied':
        return 'inactive';
      case 'available':
      case 'active':
      default:
        return 'active';
    }
  }
}
