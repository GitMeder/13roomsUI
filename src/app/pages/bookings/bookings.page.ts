import { Component, OnInit, inject, signal, ChangeDetectionStrategy, computed } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { Observable } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { Room } from '../../models/room.model';
import { Booking, BookingPayload } from '../../models/booking.model';
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
import { AuthService } from '../../services/auth.service';
import { BookingDataService } from '../../services/booking-data.service';
import { AuthPromptDialogComponent, AuthPromptResult } from '../../components/auth-prompt-dialog/auth-prompt-dialog.component';
import { FormMode, BookingFormState } from '../../models/booking-form-state.model';

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
  private readonly authService = inject(AuthService);
  private readonly bookingDataService = inject(BookingDataService);
  private readonly datePipe = inject(DatePipe);

  readonly isSubmitting = signal<boolean>(false);

  // Store original booking payload for smart rebooking
  private originalBookingPayload: BookingPayload | null = null;

  // SNACKBAR SPAM FIX: Flag to prevent duplicate conflict handling
  private isHandlingConflict = false;

  // SNACKBAR SPAM FIX: Flag to prevent duplicate alternative room searches
  private isSearchingAlternatives = false;

  // === NEW STATE MACHINE API ===
  readonly formState = signal<BookingFormState | null>(null);
  readonly room = signal<Room | null>(null);
  private roomId: number = 0;

  // Observable for the page data (legacy, kept for compatibility)
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

    // Get roomId from route params
    this.route.params.subscribe(params => {
      this.roomId = +params['id'];
    });

    // Get room data from resolver
    this.route.data.subscribe(data => {
      const pageData = data['pageData'];
      console.log('[BookingsPage] Received resolved data:', pageData);

      if (pageData.room) {
        this.room.set(pageData.room);
      }

      // Determine the form state from all sources
      const state = this.determineFormState(pageData);
      this.formState.set(state);
    });

    // LEGACY: Keep pageData$ for compatibility with other parts of the page
    this.pageData$ = this.route.data.pipe(
      map(data => {
        const pageData = data['pageData'];
        return pageData;
      })
    );
  }

  /**
   * Determines the BookingFormState from all possible sources:
   * 1. Router state (highest priority - from reschedule/smart recovery)
   * 2. Temp booking (from registration flow)
   * 3. Resolver data (for smart recovery)
   * 4. Default NEW booking
   */
  private determineFormState(resolverData: any): BookingFormState {
    // Priority 1: Check router state (from MyBookingsPage reschedule or smart recovery navigation)
    const routerState = history.state?.['formState'];
    if (routerState) {
      console.log('[BookingsPage] Using router formState:', routerState);
      return {
        ...routerState,
        room: this.room()
      };
    }

    // Priority 2: Check for temp booking (from registration flow)
    const tempBooking = this.bookingDataService.getTempBooking();
    if (tempBooking) {
      console.log('[BookingsPage] Restoring temporary booking:', tempBooking);
      return {
        mode: FormMode.NEW_WITH_SUGGESTION,
        roomId: this.roomId,
        room: this.room() || undefined,
        data: {
          date: tempBooking.startDate,
          startTime: tempBooking.startTime,
          endTime: tempBooking.endTime,
          title: tempBooking.title,
          comment: tempBooking.comment
        }
      };
    }

    // Priority 3: Check resolver data for smart recovery
    if (resolverData?.isSmartRebooking && resolverData?.prefillData) {
      console.log('[BookingsPage] Using smart recovery from resolver:', resolverData.prefillData);
      return {
        mode: FormMode.SMART_RECOVERY,
        roomId: this.roomId,
        room: this.room() || undefined,
        data: resolverData.prefillData
      };
    }

    // Priority 4: Check for legacy prefillData in router state (backwards compatibility)
    const legacyPrefillData = history.state?.['prefillData'];
    if (legacyPrefillData) {
      console.log('[BookingsPage] Using LEGACY prefillData from router state:', legacyPrefillData);
      const isSmartRebooking = history.state?.['isSmartRebooking'];
      return {
        mode: isSmartRebooking ? FormMode.SMART_RECOVERY : FormMode.RESCHEDULE,
        roomId: this.roomId,
        room: this.room() || undefined,
        data: legacyPrefillData
      };
    }

    // Default: NEW booking
    console.log('[BookingsPage] Using default NEW booking mode');
    return {
      mode: FormMode.NEW,
      roomId: this.roomId,
      room: this.room() || undefined
    };
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

    return {
      suggestedStartTime: this.formatTime(startTime),
      suggestedEndTime: this.formatTime(endTime)
    };
  }

  onBookingSubmit(payload: BookingPayload): void {
    // Prevent multiple submissions
    if (this.isSubmitting()) {
      console.warn('Submission already in progress, ignoring duplicate request');
      return;
    }

    // SOFT WALL: Check if user is a guest
    if (this.authService.isGuest()) {
      console.log('[BookingsPage] Guest user detected, showing auth prompt dialog');
      this.showAuthPromptDialog(payload);
      return;
    }

    // Proceed with normal booking submission
    this.submitBooking(payload);
  }

  /**
   * Show auth prompt dialog for guest users
   */
  private showAuthPromptDialog(payload: BookingPayload): void {
    const dialogRef = this.dialog.open(AuthPromptDialogComponent, {
      width: '560px',
      maxWidth: '90vw',
      disableClose: false,
      panelClass: 'auth-prompt-dialog-panel'
    });

    dialogRef.afterClosed().subscribe((result: AuthPromptResult) => {
      console.log('[BookingsPage] Auth prompt dialog closed with result:', result);

      if (result === 'register') {
        // Save booking data and redirect to register page
        this.handleRegisterFlow(payload);
      } else if (typeof result === 'object' && result.action === 'continue') {
        // Continue as guest with provided name - add guest name to payload
        const payloadWithGuestName: BookingPayload = {
          ...payload,
          guestName: result.guestName
        };
        this.submitBooking(payloadWithGuestName);
      }
      // If 'cancel' or undefined, do nothing
    });
  }

  /**
   * Handle the "Create Account & Book" flow
   */
  private handleRegisterFlow(payload: BookingPayload): void {
    // Save the booking payload data temporarily
    const tempData = {
      roomId: payload.roomId,
      title: payload.title,
      startDate: payload.date,
      startTime: payload.startTime,
      endDate: payload.date, // Assuming same-day bookings, adjust if needed
      endTime: payload.endTime,
      comment: payload.comment || ''
    };

    console.log('[BookingsPage] Saving temp booking data:', tempData);
    this.bookingDataService.saveTempBooking(tempData);

    // Navigate to register page with redirect back to this booking page
    const currentUrl = this.router.url.split('?')[0]; // Remove any existing query params
    this.router.navigate(['/register'], {
      queryParams: { redirect: currentUrl }
    });
  }

  /**
   * Submit the booking to the API
   */
  private submitBooking(payload: BookingPayload): void {
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

    // Create BookingFormState for SMART_RECOVERY mode
    const formState: BookingFormState = {
      mode: FormMode.SMART_RECOVERY,
      roomId: newRoomId,
      data: {
        date: this.originalBookingPayload.date,
        startTime: this.originalBookingPayload.startTime,
        endTime: this.originalBookingPayload.endTime,
        title: this.originalBookingPayload.title,
        comment: this.originalBookingPayload.comment,
        originalRoomId: this.roomId
      }
    };

    console.log('[SmartRebooking] 📤 NAVIGATING to room:', newRoomId);
    console.log('[SmartRebooking] 📤 BookingFormState:', JSON.stringify(formState, null, 2));

    // Navigate with state containing the BookingFormState
    this.router.navigate(['/bookings', newRoomId], {
      state: { formState }
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

  /**
   * Formats a date/time to HH:mm format using the browser's local timezone.
   * This is the single source of truth for time formatting in the bookings page.
   */
  private formatTime(value: string | Date | undefined | null): string {
    if (!value) {
      return '';
    }
    // DatePipe automatically uses the browser's local timezone
    return this.datePipe.transform(value, 'HH:mm') || '';
  }
}
