import { Component, OnInit, inject, signal, ChangeDetectionStrategy, computed } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { Observable } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { Room } from '../../models/room.model';
import { Booking, BookingPayload } from '../../models/booking.model';
import { CommonModule } from '@angular/common';
import { formatToHHMM } from '../../utils/date-time.utils';
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
import { ErrorHandlingService } from '../../core/services/error-handling.service';
import { BookingDataService } from '../../services/booking-data.service';
import { AuthPromptDialogComponent, AuthPromptResult } from '../../components/auth-prompt-dialog/auth-prompt-dialog.component';
import { FormMode, BookingFormState } from '../../models/booking-form-state.model';
import { BookingPageResolverData } from '../../models/api-responses.model';
import { HttpErrorResponse } from '@angular/common/http';
import { Location } from '@angular/common';

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
  private readonly authService = inject(AuthService);
  private readonly errorHandler = inject(ErrorHandlingService);
  private readonly bookingDataService = inject(BookingDataService);
  private readonly location = inject(Location);

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
    this.route.params.subscribe(params => {
      this.roomId = +params['id'];
    });

    this.route.data.subscribe(data => {
      const pageData = data['pageData'];

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
  private determineFormState(resolverData: BookingPageResolverData): BookingFormState {
    const routerState = history.state?.['formState'];
    if (routerState) {
      return {
        ...routerState,
        room: this.room()
      };
    }

    const tempBooking = this.bookingDataService.getTempBooking();
    if (tempBooking) {
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

    if (resolverData?.isSmartRebooking && resolverData?.prefillData) {
      return {
        mode: FormMode.SMART_RECOVERY,
        roomId: this.roomId,
        room: this.room() || undefined,
        data: resolverData.prefillData
      };
    }

    const legacyPrefillData = history.state?.['prefillData'];
    if (legacyPrefillData) {
      const isSmartRebooking = history.state?.['isSmartRebooking'];
      return {
        mode: isSmartRebooking ? FormMode.SMART_RECOVERY : FormMode.RESCHEDULE,
        roomId: this.roomId,
        room: this.room() || undefined,
        data: legacyPrefillData
      };
    }

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
    const normalizedStatus = this.apiService.toInternalStatus(room.statusRaw ?? room.status);
    return normalizedStatus === 'active';
  }

  /**
   * Helper exposed to the template to describe why a room is unavailable.
   */
  getRoomAvailabilityMessage(room: Room | null | undefined): string {
    const normalizedStatus = this.apiService.toInternalStatus(room?.statusRaw ?? room?.status);
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

    // Convert Date objects to HH:mm strings manually
    const formatTimeFromDate = (date: Date): string => {
      const hours = String(date.getHours()).padStart(2, '0');
      const mins = String(date.getMinutes()).padStart(2, '0');
      return `${hours}:${mins}`;
    };

    return {
      suggestedStartTime: formatTimeFromDate(startTime),
      suggestedEndTime: formatTimeFromDate(endTime)
    };
  }

  onBookingSubmit(payload: BookingPayload): void {
    if (this.isSubmitting()) {
      return;
    }

    if (this.authService.isGuest()) {
      this.showAuthPromptDialog(payload);
      return;
    }

    this.submitBooking(payload);
  }

  private showAuthPromptDialog(payload: BookingPayload): void {
    const dialogRef = this.dialog.open(AuthPromptDialogComponent, {
      width: '560px',
      maxWidth: '90vw',
      disableClose: false,
      panelClass: 'auth-prompt-dialog-panel'
    });

    dialogRef.afterClosed().subscribe((result: AuthPromptResult) => {
      if (result === 'register') {
        this.handleRegisterFlow(payload);
      } else if (typeof result === 'object' && result.action === 'continue') {
        const payloadWithGuestName: BookingPayload = {
          ...payload,
          guestName: result.guestName
        };
        this.submitBooking(payloadWithGuestName);
      }
    });
  }

  private handleRegisterFlow(payload: BookingPayload): void {
    const tempData = {
      roomId: payload.roomId,
      title: payload.title,
      startDate: payload.date,
      startTime: payload.startTime,
      endDate: payload.date,
      endTime: payload.endTime,
      comment: payload.comment || ''
    };

    this.bookingDataService.saveTempBooking(tempData);

    const currentUrl = this.router.url.split('?')[0];
    this.router.navigate(['/register'], {
      queryParams: { redirect: currentUrl }
    });
  }

  private submitBooking(payload: BookingPayload): void {
    this.isSubmitting.set(true);

    this.apiService.createBooking(payload).subscribe({
      next: (response) => {
        this.isSubmitting.set(false);
        this.errorHandler.showSuccess('Buchung erfolgreich erstellt!');

        setTimeout(() => {
          this.router.navigate(['/'], {
            state: { highlightedRoomId: payload.roomId }
          });
        }, 500);
      },
      error: (error) => {
        this.isSubmitting.set(false);

        if (error.status === 409) {
          this.handleBookingConflict(payload, error);
        }
        // ErrorHandlingService already displays error via ApiService for non-409 errors
      }
    });
  }

  private handleBookingConflict(payload: BookingPayload, error: HttpErrorResponse): void {
    if (this.isHandlingConflict) {
      return;
    }
    this.isHandlingConflict = true;

    this.originalBookingPayload = payload;

    this.pageData$.pipe(take(1)).subscribe(data => {
      const roomName = data.room?.name || 'dieser Raum';

      const snackBarRef = this.errorHandler.showWithAction(
        `Raum '${roomName}' ist von ${payload.startTime} bis ${payload.endTime} leider bereits belegt.`,
        'ANDERE RÄUME PRÜFEN',
        'warning',
        10000
      );

      snackBarRef.onAction().subscribe(() => {
        this.searchForAlternativeRooms(payload);
      });

      snackBarRef.afterDismissed().subscribe(() => {
        this.isHandlingConflict = false;
      });
    });
  }

  private searchForAlternativeRooms(payload: BookingPayload): void {
    if (this.isSearchingAlternatives) {
      return;
    }
    this.isSearchingAlternatives = true;

    this.errorHandler.showInfo('Suche nach verfügbaren Räumen...', undefined, 2000);

    this.apiService.getAvailableRooms(payload.date, payload.startTime, payload.endTime).subscribe({
      next: (availableRooms) => {
        if (availableRooms.length > 0) {
          this.showRebookingSnackbar(availableRooms);
        } else {
          this.errorHandler.showWarning(
            'Leider ist für diesen Zeitraum kein anderer Raum verfügbar.',
            'OK'
          );
        }

        this.isSearchingAlternatives = false;
      },
      error: (error) => {
        this.isSearchingAlternatives = false;
        // ErrorHandlingService already displays error via ApiService
      }
    });
  }

  private showRebookingSnackbar(availableRooms: Room[]): void {
    const count = availableRooms.length;
    let message: string;

    if (count === 1) {
      message = `Gute Nachrichten! Raum '${availableRooms[0].name}' ist zu dieser Zeit frei.`;
    } else {
      message = `Gute Nachrichten! Wir haben ${count} freie Räume für dich gefunden.`;
    }

    const snackBarRef = this.errorHandler.showWithAction(message, 'JETZT BUCHEN', 'success', 15000);

    snackBarRef.onAction().subscribe(() => {
      this.initiateOneClickRebooking(availableRooms);
    });
  }

  private initiateOneClickRebooking(availableRooms: Room[]): void {
    if (availableRooms.length === 1) {
      this.navigateToRebooking(availableRooms[0].id);
    } else {
      const dialogRef = this.dialog.open(RoomSelectionDialogComponent, {
        width: '600px',
        data: { rooms: availableRooms }
      });

      dialogRef.afterClosed().subscribe((selectedRoom: Room | undefined) => {
        if (selectedRoom) {
          this.navigateToRebooking(selectedRoom.id);
        }
      });
    }
  }

  private navigateToRebooking(newRoomId: number): void {
    if (!this.originalBookingPayload) {
      this.errorHandler.showError('Fehler: Keine ursprünglichen Buchungsdaten gefunden.');
      return;
    }

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

    this.router.navigate(['/bookings', newRoomId], {
      state: { formState }
    });
  }

  private formatTime = formatToHHMM;

  goBack(): void {
  this.location.back();
  }

}
