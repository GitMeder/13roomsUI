import { Component, OnInit, OnDestroy, inject, input, output, ViewChild, ElementRef, signal, effect, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators, ValidatorFn, ValidationErrors, AbstractControl } from '@angular/forms';
import { Subject, timer, Subscription } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, map, takeWhile } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { Room } from '../../models/room.model';
import { Booking, BookingPayload } from '../../models/booking.model';

// Other necessary imports for Angular Material
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CommonModule } from '@angular/common';
import { NgxMaterialTimepickerModule } from 'ngx-material-timepicker';

interface BookingFormControls {
  roomId: FormControl<number | null>;
  date: FormControl<Date>;
  startTime: FormControl<string>;
  endTime: FormControl<string>;
  title: FormControl<string>;
  comment: FormControl<string | null>;
}

interface TimelineSegment {
  title: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  widthPercent: number;
}

interface RoomLiveStatus {
  type: 'currently-booked' | 'available-soon' | 'available' | null;
  // Timeline visualization data
  timelineSegments?: TimelineSegment[];
  currentSegmentIndex?: number;
  currentSegmentProgress?: number; // 0-100%
  blockEndTime?: Date;
  nextTitle?: string;
  nextBookingStartTime?: Date;
}

/**
 * STATE MACHINE: FormMode enum represents the two distinct modes of the booking form.
 * This is the single source of truth for component behavior.
 */
enum FormMode {
  Suggesting, // Normal mode: calculating and showing suggestions
  Prefilled   // Smart Rebooking mode: form is pre-filled, no suggestions
}

@Component({
  selector: 'app-booking-form',
  standalone: true,
  imports: [
    DatePipe, ReactiveFormsModule, MatFormFieldModule, MatInputModule,
    MatDatepickerModule, MatNativeDateModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatSnackBarModule, MatChipsModule, MatTooltipModule, CommonModule,
    NgxMaterialTimepickerModule
  ],
  templateUrl: './booking-form.component.html',
  styleUrls: ['./booking-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookingFormComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly apiService = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly datePipe = inject(DatePipe);
  private destroy$ = new Subject<void>();
  private countdownSubscription: Subscription | null = null;

  // --- State Management ---
  // STATE MACHINE: The mode signal is the single source of truth for component behavior
  public readonly mode = signal<FormMode>(FormMode.Suggesting);
  public readonly FormMode = FormMode; // Expose enum to template

  public readonly bookingConflict = signal<Booking | null>(null);
  public readonly availabilityCountdown = signal<string | null>(null);

  // --- Input Signals ---
  readonly room = input.required<Room>();
  readonly isSubmitting = input<boolean>(false);
  readonly isSmartRebooking = input<boolean>(false); // PHASE 3+: Rainbow highlight for smart rebooking
  readonly roomIdInput = input<number | null>(null, { alias: 'roomId' });
  readonly suggestedStartTime = input<string | null>(null);
  readonly suggestedEndTime = input<string | null>(null);
  readonly initialConflict = input<Booking | null>(null);
  readonly prefillData = input<{
    date: string;
    startTime: string;
    endTime: string;
    title: string;
    name?: string;
    comment?: string;
  } | null>(null); // PHASE 3+: Pre-fill data for smart rebooking

  // Available time slots and bookings for the selected date
  public readonly dayBookings = signal<Booking[]>([]);
  public availableStartTimes: string[] = [];

  // Suggested slots for proactive UX
  public readonly suggestedSlots = signal<{ startTime: string; endTime: string }[]>([]);
  public readonly selectedSlotIndex = signal<number | null>(null);

  // UI State
  public readonly isLoadingSlots = signal<boolean>(true);
  public readonly hasCalculatedSlots = signal<boolean>(false);

  // Live Status Banner State
  public readonly liveStatus = signal<RoomLiveStatus>({ type: null });
  public readonly countdownText = signal<string>('');
  private liveStatusTimer: any = null;

  // ViewChild for focus management
  @ViewChild('titleInput') titleInput?: ElementRef<HTMLInputElement>;

  readonly submitted = output<BookingPayload>();
  readonly resetForm = output<void>();

  readonly form: FormGroup<BookingFormControls>;

  constructor() {
    this.form = this.fb.group({
      roomId: new FormControl<number | null>(null, { validators: [Validators.required, this.validRoomIdValidator()] }),
      date: new FormControl(new Date(), { nonNullable: true, validators: Validators.required }),
      startTime: new FormControl('', { nonNullable: true, validators: Validators.required }),
      endTime: new FormControl('', { nonNullable: true, validators: Validators.required }),
      title: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
      comment: new FormControl<string | null>(null),
    }, { validators: [this.timeRangeValidator()] });

    // Effect to sync roomIdInput signal to form control
    effect(() => {
      const roomId = this.roomIdInput();
      if (this.form.get('roomId')?.value !== roomId) {
        this.form.patchValue({ roomId }, { emitEvent: false });
      }
    });

    // Effect to ensure the selected room is always reflected in the form
    effect(() => {
      const currentRoom = this.room();
      if (currentRoom && this.form.get('roomId')?.value !== currentRoom.id) {
        this.form.patchValue({ roomId: currentRoom.id }, { emitEvent: false });
      }
    });

    // Effect to sync suggested times to form controls
    effect(() => {
      const startTime = this.suggestedStartTime();
      const endTime = this.suggestedEndTime();

      if (startTime) {
        this.form.patchValue({ startTime }, { emitEvent: false });
      }
      if (endTime) {
        this.form.patchValue({ endTime }, { emitEvent: false });
      }
    });

    // Effect to sync initialConflict input to bookingConflict state
    // CRITICAL FIX: Always sync the value, including null, to ensure clean state
    effect(() => {
      const conflict = this.initialConflict();
      this.bookingConflict.set(conflict);
    });

    // Effect to handle smart rebooking prefill data
    effect(() => {
      const prefill = this.prefillData();
      if (prefill) {
        this.mode.set(FormMode.Prefilled);

        const dateObj = new Date(prefill.date + 'T00:00:00');
        const bookingTitle = prefill.title ?? prefill.name ?? '';

        this.form.patchValue({
          startTime: prefill.startTime,
          endTime: prefill.endTime,
          date: dateObj,
          title: bookingTitle,
          comment: prefill.comment || null
        }, { emitEvent: false });

        this.isLoadingSlots.set(false);
      }
    });

    // Clear conflict state when navigating to a different room
    // CRITICAL STATE RESET: When the room context changes, it signifies a new user interaction.
    // We must aggressively reset ALL state related to previous conflicts and booking modes.
    effect(() => {
      const roomId = this.roomIdInput();

      console.log(`[State Reset] Room context changed to ${roomId}. Clearing all conflict state.`);

      // Clear conflict-related state
      this.bookingConflict.set(null);
      this.availabilityCountdown.set(null);

      // Reset the form mode to ensure we don't get stuck in a "Prefilled" state
      // This prevents stale conflict data from being displayed on new bookings
      this.mode.set(FormMode.Suggesting);
    });
  }

  private validRoomIdValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (value === null || value === 0) {
        return { invalidRoomId: true };
      }
      return null;
    };
  }

  /**
   * Custom validator for time range: ensures endTime is after startTime.
   * Applied at FormGroup level to validate across multiple controls.
   */
  private timeRangeValidator(): ValidatorFn {
    return (group: AbstractControl): ValidationErrors | null => {
      const startTime = group.get('startTime')?.value;
      const endTime = group.get('endTime')?.value;

      // Skip validation if either time is empty (handled by required validator)
      if (!startTime || !endTime) {
        return null;
      }

      // Normalize times to handle potential AM/PM format
      const normalizedStart = this.normalizeTimeFormat(startTime);
      const normalizedEnd = this.normalizeTimeFormat(endTime);

      // Parse times as "HH:mm"
      const [startHours, startMinutes] = normalizedStart.split(':').map(Number);
      const [endHours, endMinutes] = normalizedEnd.split(':').map(Number);

      // Convert to comparable numbers (total minutes since midnight)
      const startTotalMinutes = startHours * 60 + startMinutes;
      const endTotalMinutes = endHours * 60 + endMinutes;

      // End time must be after start time
      if (endTotalMinutes <= startTotalMinutes) {
        return { invalidTimeRange: true };
      }

      return null;
    };
  }

  ngOnInit(): void {
    // Subscription 1: Reload bookings ONLY when roomId or date changes
    this.form.valueChanges.pipe(
      takeUntil(this.destroy$),
      debounceTime(300),
      distinctUntilChanged((prev, curr) =>
        prev.roomId === curr.roomId &&
        prev.date?.getTime() === curr.date?.getTime()
      ),
      map(values => ({ roomId: values.roomId, date: values.date }))
    ).subscribe(({ roomId, date }) => {
      if (this.mode() === FormMode.Suggesting) {
        if (roomId && date) {
          this.loadDayBookings(roomId, date);
        }
      }
    });

    // Subscription 2: Simple startTime handler
    this.form.get('startTime')?.valueChanges.pipe(
      takeUntil(this.destroy$),
      distinctUntilChanged()
    ).subscribe(newStartTime => {
      // 1. Automatically update the end time to be 30 mins later
      this.autoFillEndTime(newStartTime);

      // 2. Un-select any suggestion chip - user is now in manual mode
      this.selectedSlotIndex.set(null);

      // 3. Immediately check for conflicts with the new time range
      this.checkConflict();
    });

    // Subscription 3: Simple endTime handler
    this.form.get('endTime')?.valueChanges.pipe(
      takeUntil(this.destroy$),
      distinctUntilChanged()
    ).subscribe(() => {
      // 1. Un-select any suggestion chip - user is now in manual mode
      this.selectedSlotIndex.set(null);

      // 2. Check for conflicts
      this.checkConflict();
    });

    // Handle initial load state
    setTimeout(() => {
      if (this.mode() === FormMode.Suggesting) {
        const currentRoomId = this.form.get('roomId')?.value;
        let currentDate = this.form.get('date')?.value;

        // Smart date forwarding for after-hours bookings
        if (currentDate) {
          const now = new Date();
          const isToday = currentDate.toDateString() === now.toDateString();
          const currentHour = now.getHours();
          const businessEndHour = 20;

          if (isToday && currentHour >= businessEndHour) {
            const tomorrow = new Date(currentDate);
            tomorrow.setDate(tomorrow.getDate() + 1);
            this.form.patchValue({ date: tomorrow }, { emitEvent: true });
            currentDate = tomorrow;
          }
        }

        if (currentRoomId && currentDate) {
          this.loadDayBookings(currentRoomId, currentDate);
        } else {
          this.isLoadingSlots.set(false);
        }
      } else {
        this.isLoadingSlots.set(false);
      }
    }, 0);
  }

  private loadDayBookings(roomId: number, date: Date): void {
    if (this.mode() === FormMode.Prefilled) {
      this.isLoadingSlots.set(false);
      return;
    }

    const dateStr = date.toISOString().split('T')[0];

    this.isLoadingSlots.set(true);

    this.suggestedSlots.set([]);
    this.selectedSlotIndex.set(null);

    this.apiService.getRoomBookings(roomId, dateStr)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (bookings) => {
          this.dayBookings.set(bookings);
          this.calculateAvailableTimes(bookings, date);

          // LIVE STATUS BANNER: Calculate live status after bookings are loaded
          this.calculateLiveStatus();

          // CRITICAL FIX: Set loading state to false AFTER all calculations are complete
          // This ensures the UI never sees an intermediate state where loading=false but suggestedSlots is still empty
        },
        error: (error) => {
          // On error, assume no bookings and continue
          this.dayBookings.set([]);
          this.calculateAvailableTimes([], date);

          // LIVE STATUS BANNER: Calculate live status even on error
          this.calculateLiveStatus();

          // CRITICAL FIX: Set loading state to false AFTER all calculations are complete
        }
      });
  }

  private calculateAvailableTimes(bookings: Booking[], selectedDate: Date): void {
    const interval = 15;

    const allSlots: string[] = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += interval) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        allSlots.push(timeStr);
      }
    }

    const availableSlots = allSlots.filter(time => {
      const [hours, minutes] = time.split(':').map(Number);

      const slotStart = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        hours,
        minutes,
        0,
        0
      );

      return this.isTimeSlotAvailable(slotStart);
    });

    this.availableStartTimes = availableSlots.filter(time => {
      return !this.isTimeBlocked(time, bookings, selectedDate);
    });

    this.findSuggestedSlots(bookings, selectedDate);
  }

  private isTimeSlotAvailable(slotStart: Date): boolean {
    const slotHour = slotStart.getHours();
    const businessStartHour = 8;
    const businessEndHour = 20;

    if (slotHour < businessStartHour || slotHour >= businessEndHour) {
      return false;
    }

    const defaultDurationMinutes = 30;
    const slotEnd = new Date(slotStart.getTime() + defaultDurationMinutes * 60000);

    if (slotEnd.getTime() <= new Date().getTime()) {
      return false;
    }

    return true;
  }

  private isTimeBlocked(time: string, bookings: Booking[], date: Date): boolean {
    const [hours, minutes] = time.split(':').map(Number);

    const slotStart = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      hours,
      minutes,
      0,
      0
    );

    const defaultDuration = 30;
    const slotEnd = new Date(slotStart.getTime() + defaultDuration * 60000);

    return bookings.some(booking => {
      const bookingStart = new Date(booking.start_time);
      const bookingEnd = new Date(booking.end_time);
      return slotStart.getTime() < bookingEnd.getTime() && slotEnd.getTime() > bookingStart.getTime();
    });
  }

  private autoFillEndTime(startTime: string): void {
    if (!startTime) return;

    const [hours, minutes] = startTime.split(':').map(Number);
    const startDate = new Date();
    startDate.setHours(hours, minutes, 0, 0);

    const endDate = new Date(startDate.getTime() + 30 * 60000); // Add 30 minutes

    const endTimeStr = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;

    this.form.patchValue({ endTime: endTimeStr }, { emitEvent: false });
  }

  private findSuggestedSlots(bookings: Booking[], selectedDate: Date): void {
    const now = new Date();
    const isToday = selectedDate.toDateString() === now.toDateString();

    let startSearchFrom: string;
    if (isToday) {
      // SMART SUGGESTION: Always start from the NEXT available 15-minute interval
      const minutes = now.getMinutes();
      const interval = 15;

      // Calculate how many minutes past the last interval we are
      const remainder = minutes % interval;

      // If we are not exactly on an interval, calculate minutes to add
      const minutesToAdd = remainder === 0 ? 0 : interval - remainder;

      // Create the next valid slot time
      const nextSlotTime = new Date(now.getTime() + minutesToAdd * 60000);

      // Round down seconds and milliseconds for a clean start time
      nextSlotTime.setSeconds(0, 0);

      // Format this as HH:mm for startSearchFrom
      startSearchFrom = `${nextSlotTime.getHours().toString().padStart(2, '0')}:${nextSlotTime.getMinutes().toString().padStart(2, '0')}`;
    } else {
      startSearchFrom = '00:00';
    }

    const relevantSlots = this.availableStartTimes.filter(time => time >= startSearchFrom);

    const maxSuggestions = 4;
    const duration = 30;

    const suggestions = relevantSlots.slice(0, maxSuggestions).map(startTime => {
      const [hours, minutes] = startTime.split(':').map(Number);

      const startDate = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        hours,
        minutes,
        0,
        0
      );

      const endDate = new Date(startDate.getTime() + duration * 60000);
      const endTime = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;

      return {
        startTime: startTime,
        endTime: endTime
      };
    });

    this.suggestedSlots.set(suggestions);

    if (suggestions.length > 0) {
      this.selectSlot(0);
    } else {
      this.selectedSlotIndex.set(null);
    }

    this.isLoadingSlots.set(false);
    this.hasCalculatedSlots.set(true);
  }

  /**
   * Selects a suggested slot by index.
   * Called when user clicks on a suggestion chip.
   */
  public selectSlot(index: number): void {
    const slots = this.suggestedSlots();
    if (index < 0 || index >= slots.length) {
      return;
    }

    const slot = slots[index];
    this.selectedSlotIndex.set(index);

    // Update form fields without triggering change detection cascade
    this.form.patchValue({
      startTime: slot.startTime,
      endTime: slot.endTime
    }, { emitEvent: false });

    // Trigger conflict check manually since we disabled emitEvent
    this.checkConflict();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.countdownSubscription) {
      this.countdownSubscription.unsubscribe();
    }
    // CRITICAL: Clean up live status timer to prevent memory leaks
    if (this.liveStatusTimer) {
      clearInterval(this.liveStatusTimer);
      this.liveStatusTimer = null;
    }
  }
  
  private checkConflict(): void {
    const formValue = this.form.getRawValue();
    const { roomId, date, startTime, endTime } = formValue;

    // CRITICAL: Only check for conflicts if ALL required fields are filled
    // This ensures the warning only appears when user has actually selected a time range
    if (!roomId || !date || !startTime || !endTime) {
      // Clear any existing conflict warning when fields are incomplete
      this.bookingConflict.set(null);
      this.updateCountdown(null);
      return;
    }

    // Validate that times are properly formatted
    if (!startTime.includes(':') || !endTime.includes(':')) {
      this.bookingConflict.set(null);
      this.updateCountdown(null);
      return;
    }

    const formattedDate = date.toISOString().split('T')[0];

    this.apiService.checkBookingConflict(roomId, formattedDate, startTime, endTime)
      .pipe(takeUntil(this.destroy$))
      .subscribe(conflict => {
        this.bookingConflict.set(conflict);
        this.updateCountdown(conflict);
      });
  }

  private updateCountdown(conflict: Booking | null): void {
    // Clean up any previous countdown
    if (this.countdownSubscription) {
      this.countdownSubscription.unsubscribe();
      this.countdownSubscription = null; // Reset subscription
    }

    if (conflict) {
      const conflictEndTime = new Date(conflict.end_time);
      const availableLabel = this.datePipe.transform(conflictEndTime, 'HH:mm');
      this.availabilityCountdown.set(
        availableLabel ? `Wieder verfügbar ab ${availableLabel} Uhr` : null
      );

      this.countdownSubscription = timer(0, 1000).pipe(
        takeUntil(this.destroy$),
        map(() => conflictEndTime.getTime() - Date.now()),
        takeWhile(diffMs => diffMs > 0, true)
      ).subscribe(diffMs => {
        if (diffMs <= 0) {
          this.availabilityCountdown.set(null);
          this.countdownSubscription?.unsubscribe();
          this.countdownSubscription = null;
        }
      });
    } else {
      this.availabilityCountdown.set(null);
    }
  }

  public formatTime(dateString: string): string {
    if (!dateString) return '';
    return this.datePipe.transform(new Date(dateString), 'HH:mm') || '';
  }

  public isSubmitDisabled(): boolean {
    const formValue = this.form.getRawValue();
    const title = formValue.title?.trim() ?? '';
    return !formValue.roomId || !formValue.startTime || !formValue.endTime || title.length < 2;
  }

  /**
   * Normalizes time format to 24-hour HH:mm format.
   * Handles both 24-hour format (already correct) and 12-hour AM/PM format (needs conversion).
   * @param time Time string in either "HH:mm" or "h:mm AM/PM" format
   * @returns Time string in "HH:mm" format
   */
  private normalizeTimeFormat(time: string): string {
    // Check if time contains AM/PM (12-hour format)
    const amPmRegex = /(\d{1,2}):(\d{2})\s*(AM|PM)/i;
    const match = time.match(amPmRegex);

    if (match) {
      // Convert 12-hour to 24-hour format
      let hours = parseInt(match[1], 10);
      const minutes = match[2];
      const period = match[3].toUpperCase();

      if (period === 'PM' && hours !== 12) {
        hours += 12;
      } else if (period === 'AM' && hours === 12) {
        hours = 0;
      }

      return `${hours.toString().padStart(2, '0')}:${minutes}`;
    }

    // Already in 24-hour format, return as is
    return time;
  }

  onTimeInputChange(controlName: 'startTime' | 'endTime', rawValue: string): void {
    const control = this.form.get(controlName);
    if (!control) {
      return;
    }

    const normalized = rawValue ? this.normalizeTimeFormat(rawValue) : rawValue;
    if (control.value !== normalized) {
      control.setValue(normalized);
    }
  }

  onSubmit(): void {
    if (this.isSubmitDisabled()) {
      return;
    }

    const formValue = this.form.getRawValue();

    if (!formValue.roomId) {
      return;
    }

    const startTime24 = this.normalizeTimeFormat(formValue.startTime);
    const endTime24 = this.normalizeTimeFormat(formValue.endTime);

    let dateObj: Date;
    let dateStr: string;

    if (formValue.date instanceof Date) {
      dateObj = formValue.date;
      dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    } else {
      dateStr = formValue.date;
      dateObj = new Date(dateStr + 'T00:00:00');
    }

    const [endHours, endMinutes] = endTime24.split(':').map(Number);

    const endDateTime = new Date(
      dateObj.getFullYear(),
      dateObj.getMonth(),
      dateObj.getDate(),
      endHours,
      endMinutes,
      0,
      0
    );

    const now = new Date();

    if (endDateTime.getTime() <= now.getTime()) {
      this.snackBar.open(
        'Fehler: Ein Meeting kann nicht vollständig in der Vergangenheit gebucht werden.',
        'OK',
        {
          duration: 5000,
          panelClass: ['error-snackbar'],
          horizontalPosition: 'center',
          verticalPosition: 'bottom'
        }
      );

      return;
    }

    const payload: BookingPayload = {
      roomId: formValue.roomId,
      title: formValue.title,
      startTime: startTime24,
      endTime: endTime24,
      date: dateStr,
      comment: formValue.comment || undefined,
    };

    this.submitted.emit(payload);
  }

  onReset(): void {
    this.form.reset();
    this.resetForm.emit();
  }

  /**
   * TIMELINE: Finds all consecutive bookings in a block and returns them as an ordered array.
   * This builds the complete timeline for visualization.
   */
  private findBookingBlock(currentBooking: Booking, allBookings: Booking[]): Booking[] {
    const blockBookings: Booking[] = [currentBooking];

    // Look for consecutive bookings
    let foundConsecutive = true;
    let currentEnd = new Date(currentBooking.end_time);

    while (foundConsecutive) {
      foundConsecutive = false;

      for (const booking of allBookings) {
        const bookingStart = new Date(booking.start_time);
        const bookingEnd = new Date(booking.end_time);

        // Check if this booking starts exactly when the current block ends
        if (bookingStart.getTime() === currentEnd.getTime()) {
          blockBookings.push(booking);
          currentEnd = bookingEnd;
          foundConsecutive = true;
          break;
        }
      }
    }

    return blockBookings;
  }

  /**
   * LIVE STATUS BANNER: Calculates the current room status for the live banner.
   * Only active for today's date.
   */
  private calculateLiveStatus(): void {
    const formValue = this.form.getRawValue();
    const { date } = formValue;

    if (!date) {
      this.liveStatus.set({ type: null });
      return;
    }

    const now = new Date();
    const selectedDate = new Date(date);
    const isToday = selectedDate.toDateString() === now.toDateString();

    // Only show banner for today
    if (!isToday) {
      this.liveStatus.set({ type: null });
      this.stopLiveCountdown();
      return;
    }

    const bookings = this.dayBookings();

    // Find current booking (room is occupied right now)
    const currentBooking = bookings.find(booking => {
      const start = new Date(booking.start_time);
      const end = new Date(booking.end_time);
      // CRITICAL FIX: Compare timestamps, not Date objects
      return start.getTime() <= now.getTime() && end.getTime() > now.getTime();
    });

    if (currentBooking) {
      // Room is currently booked! Build the complete timeline
      const blockBookings = this.findBookingBlock(currentBooking, bookings);
      const blockStartTime = new Date(blockBookings[0].start_time);
      const blockEndTime = new Date(blockBookings[blockBookings.length - 1].end_time);

      // Calculate total block duration in minutes
      const totalBlockMinutes = Math.floor((blockEndTime.getTime() - blockStartTime.getTime()) / 60000);

      // Build timeline segments with proportional widths
      const timelineSegments: TimelineSegment[] = blockBookings.map(booking => {
        const start = new Date(booking.start_time);
        const end = new Date(booking.end_time);
        const durationMinutes = Math.floor((end.getTime() - start.getTime()) / 60000);
        const widthPercent = (durationMinutes / totalBlockMinutes) * 100;

        return {
          title: booking.title,
          startTime: start,
          endTime: end,
          durationMinutes,
          widthPercent
        };
      });

      // Find which segment is currently active
      const currentSegmentIndex = timelineSegments.findIndex(segment => {
        // CRITICAL FIX: Compare timestamps, not Date objects
        return now.getTime() >= segment.startTime.getTime() && now.getTime() < segment.endTime.getTime();
      });

      // Calculate progress of current segment (0-100%)
      let currentSegmentProgress = 0;
      if (currentSegmentIndex >= 0) {
        const currentSegment = timelineSegments[currentSegmentIndex];
        const segmentDurationMs = currentSegment.endTime.getTime() - currentSegment.startTime.getTime();
        const elapsedMs = now.getTime() - currentSegment.startTime.getTime();
        currentSegmentProgress = Math.min(100, Math.max(0, (elapsedMs / segmentDurationMs) * 100));
      }

      // Find next booking after the block ends
      // CRITICAL FIX: Compare timestamps, not Date objects
      const nextBooking = bookings
        .filter(b => new Date(b.start_time).getTime() >= blockEndTime.getTime())
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0];

      const status: RoomLiveStatus = {
        type: 'currently-booked',
        timelineSegments,
        currentSegmentIndex,
        currentSegmentProgress,
        blockEndTime,
        nextTitle: nextBooking?.title,
        nextBookingStartTime: nextBooking ? new Date(nextBooking.start_time) : undefined
      };

      this.liveStatus.set(status);
      this.startLiveCountdown();
      return;
    }

    // Room is not currently booked
    this.liveStatus.set({ type: null });
    this.stopLiveCountdown();
  }

  /**
   * TIMELINE: Starts the live countdown timer for the current segment.
   * Updates every second, showing countdown for active meeting and progress.
   */
  private startLiveCountdown(): void {
    // Clear any existing timer
    this.stopLiveCountdown();

    // Update immediately
    this.updateTimeline();

    // Update every second
    this.liveStatusTimer = setInterval(() => {
      this.updateTimeline();
    }, 1000);
  }

  /**
   * TIMELINE: Stops the live countdown timer.
   */
  private stopLiveCountdown(): void {
    if (this.liveStatusTimer) {
      clearInterval(this.liveStatusTimer);
      this.liveStatusTimer = null;
      this.countdownText.set('');
    }
  }

  /**
   * TIMELINE: Updates the countdown text and segment progress.
   * Shows countdown for the current segment only.
   */
  private updateTimeline(): void {
    const status = this.liveStatus();

    if (!status.timelineSegments || status.currentSegmentIndex === undefined || status.currentSegmentIndex < 0) {
      // No active segment
      this.calculateLiveStatus();
      return;
    }

    const currentSegment = status.timelineSegments[status.currentSegmentIndex];
    const now = new Date();

    // CRITICAL FIX: Compare timestamps, not Date objects
    // Check if current segment has ended
    if (now.getTime() >= currentSegment.endTime.getTime()) {
      this.calculateLiveStatus();
      return;
    }

    // Calculate remaining time for current segment
    const remainingMs = currentSegment.endTime.getTime() - now.getTime();
    const totalSeconds = Math.floor(remainingMs / 1000);

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    this.countdownText.set(formattedTime);

    // Calculate and update segment progress
    const segmentDurationMs = currentSegment.endTime.getTime() - currentSegment.startTime.getTime();
    const elapsedMs = now.getTime() - currentSegment.startTime.getTime();
    const progress = Math.min(100, Math.max(0, (elapsedMs / segmentDurationMs) * 100));

    // Update the live status with new progress
    const updatedStatus: RoomLiveStatus = {
      ...status,
      currentSegmentProgress: progress
    };

    this.liveStatus.set(updatedStatus);
  }

  /**
   * TIMELINE: Helper method to check if countdown should be displayed.
   * This provides type-safe access to timeline data in the template.
   */
  public shouldShowCountdown(): boolean {
    const status = this.liveStatus();
    return status.currentSegmentIndex !== undefined &&
           status.currentSegmentIndex !== null &&
           status.currentSegmentIndex >= 0 &&
           status.timelineSegments !== undefined &&
           status.timelineSegments.length > 0;
  }

  /**
   * TIMELINE: Gets the current segment's booking title safely.
   * Only call this after shouldShowCountdown() returns true.
   */
  public getCurrentSegmentTitle(): string {
    const status = this.liveStatus();
    if (status.currentSegmentIndex !== undefined &&
        status.currentSegmentIndex !== null &&
        status.currentSegmentIndex >= 0 &&
        status.timelineSegments &&
        status.timelineSegments.length > status.currentSegmentIndex) {
      return status.timelineSegments[status.currentSegmentIndex].title;
    }
    return '';
  }
}
