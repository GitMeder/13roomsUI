import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService, BookingPayload } from '../../services/api.service';
import { Observable, of } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import { Room } from '../../models/room.model';
import { Booking } from '../../models/booking.model';
import { CommonModule } from '@angular/common';
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
      name: string;
      comment?: string;
    };
  }>;

  ngOnInit(): void {
    // STRATEGIC DEBUG LOG: Check navigation state receiving
    console.log('[SmartRebooking] 📥 ngOnInit called');
    console.log('[SmartRebooking] 📥 ==================== STATE RETRIEVAL DEBUG ====================');

    // CRITICAL FIX: getCurrentNavigation() only works DURING navigation (in guards/constructors)
    // After navigation completes (like in ngOnInit), we must use window.history.state
    // This is where Angular Router stores the navigation state
    const navigation = this.router.getCurrentNavigation();
    console.log('[SmartRebooking] 📥 getCurrentNavigation() result:', navigation);
    console.log('[SmartRebooking] 📥 window.history.state (RAW):', window.history.state);
    console.log('[SmartRebooking] 📥 window.history.state type:', typeof window.history.state);
    console.log('[SmartRebooking] 📥 window.history.state keys:', Object.keys(window.history.state || {}));

    // Use history.state as fallback when navigation is null (which happens in ngOnInit)
    const state = navigation?.extras?.state || window.history.state;
    console.log('[SmartRebooking] 📥 Final merged state:', state);
    console.log('[SmartRebooking] 📥 state.isSmartRebooking:', state?.['isSmartRebooking']);
    console.log('[SmartRebooking] 📥 state.prefillData:', state?.['prefillData']);

    let prefillData: any = null;

    if (state && state['isSmartRebooking']) {
      this.isSmartRebooking.set(true);
      prefillData = state['prefillData'];
      console.log('[SmartRebooking] ✅ Detected smart rebooking mode');
      console.log('[SmartRebooking] ✅ prefillData captured:', JSON.stringify(prefillData, null, 2));
      console.log('[SmartRebooking] ✅ prefillData is truthy?', !!prefillData);
    } else {
      console.log('[SmartRebooking] ❌ No smart rebooking state detected');
      console.log('[SmartRebooking] 📥 state exists?', !!state);
      console.log('[SmartRebooking] 📥 isSmartRebooking flag?', state?.['isSmartRebooking']);
    }
    console.log('[SmartRebooking] 📥 ==================== END STATE RETRIEVAL ====================');

    this.pageData$ = this.route.paramMap.pipe(
      switchMap(params => {
        console.log('[SmartRebooking] 📦 ==================== OBSERVABLE EMISSION DEBUG ====================');
        console.log('[SmartRebooking] 📦 route.paramMap emitted with params:', params);
        console.log('[SmartRebooking] 📦 Captured prefillData variable (from closure):', prefillData);
        console.log('[SmartRebooking] 📦 prefillData type:', typeof prefillData);
        console.log('[SmartRebooking] 📦 prefillData is truthy?', !!prefillData);
        console.log('[SmartRebooking] 📦 prefillData === null?', prefillData === null);
        console.log('[SmartRebooking] 📦 prefillData === undefined?', prefillData === undefined);

        const roomId = Number(params.get('roomId'));
        if (roomId) {
          return this.apiService.getBookingPageData(roomId).pipe(
            map(data => {
              console.log('[SmartRebooking] 📦 API data received:', data);
              console.log('[SmartRebooking] 📦 Checking conditions:');
              console.log('[SmartRebooking] 📦   - data.room?', !!data.room);
              console.log('[SmartRebooking] 📦   - !data.conflict?', !data.conflict);
              console.log('[SmartRebooking] 📦   - !prefillData?', !prefillData);

              // Calculate suggested time slots if room is available AND not in smart rebooking mode
              if (data.room && !data.conflict && !prefillData) {
                const { suggestedStartTime, suggestedEndTime } = this.calculateSuggestedTimes();
                const result = { ...data, suggestedStartTime, suggestedEndTime, prefillData };
                console.log('[SmartRebooking] 📦 ✅ Taking NORMAL mode branch');
                console.log('[SmartRebooking] 📦 pageData$ emitting (normal mode):', result);
                console.log('[SmartRebooking] 📦 result.prefillData:', result.prefillData);
                return result;
              }
              // In smart rebooking mode, use prefillData instead of suggested times
              const result = { ...data, suggestedStartTime: null, suggestedEndTime: null, prefillData };
              console.log('[SmartRebooking] 📦 ✅ Taking SMART REBOOKING mode branch');
              console.log('[SmartRebooking] 📦 pageData$ emitting (smart rebooking mode):', result);
              console.log('[SmartRebooking] 📦 result.prefillData:', result.prefillData);
              console.log('[SmartRebooking] 📦 result.prefillData is null?', result.prefillData === null);
              console.log('[SmartRebooking] 📦 ==================== END OBSERVABLE EMISSION ====================');
              return result;
            })
          );
        }
        // Handle case where ID is missing or invalid
        return of({ room: null, conflict: null, suggestedStartTime: null, suggestedEndTime: null, prefillData: undefined });
      })
    );
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
    console.log('[SmartRecovery] Handling booking conflict for payload:', payload);

    // Store the original payload for rebooking
    this.originalBookingPayload = payload;

    // Get room name from the current page data
    this.pageData$.subscribe(data => {
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
    });
  }

  /**
   * PHASE 3+: Smart Failure Recovery with One-Click Rebooking
   * Searches for alternative rooms that are available for the user's desired time slot.
   */
  private searchForAlternativeRooms(payload: BookingPayload): void {
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
        name: this.originalBookingPayload.name,
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
}