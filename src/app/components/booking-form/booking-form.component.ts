import { Component, OnInit, OnDestroy, inject, input, Output, EventEmitter, ViewChild, ElementRef, signal, effect, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators, ValidatorFn, ValidationErrors, AbstractControl } from '@angular/forms';
import { Subject, timer, Subscription } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, map, takeWhile } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { Room } from '../../models/room.model';
import { Booking, BookingPayload } from '../../models/booking.model';
import { DevModeService } from '../../core/services/dev-mode.service';

// Other necessary imports for Angular Material
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CommonModule } from '@angular/common';

// ngx-material-timepicker for 24-hour German time format
import { NgxMaterialTimepickerModule } from 'ngx-material-timepicker';
import * as moment from 'moment';
import 'moment/locale/de';

interface BookingFormControls {
  roomId: FormControl<number | null>;
  date: FormControl<Date>;
  startTime: FormControl<string>;
  endTime: FormControl<string>;
  name: FormControl<string>;
  comment: FormControl<string | null>;
}

interface TimelineSegment {
  booker: string;
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
  nextBooker?: string;
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
    DatePipe, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatDatepickerModule, MatNativeDateModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatSnackBarModule, MatChipsModule, MatTooltipModule, CommonModule,
    NgxMaterialTimepickerModule
  ],
  providers: [DatePipe],
  templateUrl: './booking-form.component.html',
  styleUrls: ['./booking-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookingFormComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly apiService = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly datePipe = inject(DatePipe);
  public readonly devModeService = inject(DevModeService);
  private destroy$ = new Subject<void>();
  private countdownSubscription: Subscription | null = null;

  // --- State Management ---
  // STATE MACHINE: The mode signal is the single source of truth for component behavior
  public readonly mode = signal<FormMode>(FormMode.Suggesting);
  public readonly FormMode = FormMode; // Expose enum to template

  public readonly bookingConflict = signal<Booking | null>(null);
  public readonly availabilityCountdown = signal<string | null>(null);

  // --- Input Signals ---
  readonly rooms = input.required<Room[]>();
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
    name: string;
    comment?: string;
  } | null>(null); // PHASE 3+: Pre-fill data for smart rebooking

  // Available time slots and bookings for the selected date
  public readonly dayBookings = signal<Booking[]>([]);
  public availableStartTimes: string[] = [];
  public availableEndTimes: string[] = [];

  // Suggested slots for proactive UX
  public readonly suggestedSlots = signal<{ startTime: string; endTime: string }[]>([]);
  public readonly selectedSlotIndex = signal<number | null>(null);

  // UI State
  public readonly isSearchingSlot = signal<boolean>(false);
  // CRITICAL FIX: Start with true to prevent error message during initial load
  // This ensures "loading" state is shown first, not "no slots" error
  public readonly isLoadingSlots = signal<boolean>(true);
  public readonly hasCalculatedSlots = signal<boolean>(false); // Track if we've ever calculated slots

  // Live Status Banner State
  public readonly liveStatus = signal<RoomLiveStatus>({ type: null });
  public readonly countdownText = signal<string>('');
  private liveStatusTimer: any = null;

  // ViewChild for focus management
  @ViewChild('nameInput') nameInput?: ElementRef<HTMLInputElement>;

  @Output() submitted = new EventEmitter<BookingPayload>();
  @Output() resetForm = new EventEmitter<void>();

  readonly form: FormGroup<BookingFormControls>;

  constructor() {
    // Set moment locale to German for 24-hour time format
    moment.locale('de');

    this.form = this.fb.group({
      roomId: new FormControl<number | null>(null, { validators: [Validators.required, this.validRoomIdValidator()] }),
      date: new FormControl(new Date(), { nonNullable: true, validators: Validators.required }),
      startTime: new FormControl('', { nonNullable: true, validators: Validators.required }),
      endTime: new FormControl('', { nonNullable: true, validators: Validators.required }),
      name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
      comment: new FormControl<string | null>(null),
    }, { validators: [this.timeRangeValidator()] });

    // Effect to sync roomIdInput signal to form control
    effect(() => {
      const roomId = this.roomIdInput();
      if (this.form.get('roomId')?.value !== roomId) {
        this.form.patchValue({ roomId }, { emitEvent: false });
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

    // PHASE 3+: Effect to handle smart rebooking prefill data
    effect(() => {
      const prefill = this.prefillData();
      if (prefill) {
        console.log('[StateMachine] Prefill data detected. Switching to Prefilled mode.');

        // STATE MACHINE: Set the mode to Prefilled - this is the ENTRY POINT for Smart Rebooking
        this.mode.set(FormMode.Prefilled);

        // Parse the date string (YYYY-MM-DD) into a Date object
        const dateObj = new Date(prefill.date + 'T00:00:00');

        // Patch all form values
        this.form.patchValue({
          startTime: prefill.startTime,
          endTime: prefill.endTime,
          date: dateObj,
          name: prefill.name,
          comment: prefill.comment || null
        }, { emitEvent: false });

        // Ensure loading state is off in Prefilled mode
        this.isLoadingSlots.set(false);

        console.log('[StateMachine] Form prefilled successfully. Mode is now Prefilled.');
      }
    });

    // CRITICAL FIX: Clear conflict state when navigating to a different room
    // This ensures Smart Rebooking navigation shows a clean form without old conflict warnings
    effect(() => {
      const roomId = this.roomIdInput();
      // This effect runs whenever the room context changes.
      console.log(`[StateClear] Room ID changed to ${roomId}. Resetting conflict state.`);
      this.bookingConflict.set(null);
      this.availabilityCountdown.set(null);
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
      // STATE MACHINE: Only calculate slots in Suggesting mode
      if (this.mode() === FormMode.Suggesting) {
        if (roomId && date) {
          this.loadDayBookings(roomId, date);
        }
      } else {
        console.log('[StateMachine] In Prefilled mode, blocking slot calculation (valueChanges).');
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

    // CRITICAL FIX: Handle initial load state
    // The roomId setter uses { emitEvent: false }, so valueChanges doesn't trigger for the initial value.
    // We must explicitly check and load bookings for the initial state after the current change detection cycle.
    setTimeout(() => {
      // STATE MACHINE: Only calculate slots in Suggesting mode
      if (this.mode() === FormMode.Suggesting) {
        const currentRoomId = this.form.get('roomId')?.value;
        let currentDate = this.form.get('date')?.value;

        console.log(`[FormInit] Initial values: roomId=${currentRoomId}, date=${currentDate?.toISOString()}`);

        // UX ENHANCEMENT: Smart date forwarding for after-hours bookings
        // If user opens the form after business hours, automatically select tomorrow
        if (currentDate && !this.devModeService.isDevMode()) {
          const now = new Date();
          const isToday = currentDate.toDateString() === now.toDateString();
          const currentHour = now.getHours();
          const businessEndHour = 20; // Business hours end at 20:00

          if (isToday && currentHour >= businessEndHour) {
            console.log(`[SmartForward] After-hours detected. Forwarding date to tomorrow.`);

            // Create tomorrow's date
            const tomorrow = new Date(currentDate);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Update the form - this will trigger valueChanges and load bookings for tomorrow
            this.form.patchValue({ date: tomorrow }, { emitEvent: true });
            currentDate = tomorrow;
          }
        }

        if (currentRoomId && currentDate) {
          this.loadDayBookings(currentRoomId, currentDate);
        } else {
          // If no initial values, ensure loading state is false
          this.isLoadingSlots.set(false);
        }
      } else {
        console.log('[StateMachine] In Prefilled mode, blocking slot calculation (initial load).');
        this.isLoadingSlots.set(false);
      }
    }, 0);
  }

  private loadDayBookings(roomId: number, date: Date): void {
    // STATE MACHINE: Never run slot calculation in Prefilled mode
    // The form is already pre-filled with the correct data
    if (this.mode() === FormMode.Prefilled) {
      console.log('[StateMachine] Defensive guard - preventing loadDayBookings in Prefilled mode.');
      this.isLoadingSlots.set(false);
      return;
    }

    const dateStr = date.toISOString().split('T')[0];
    console.log(`[BookingLoad] Loading bookings for room ${roomId} on ${date.toISOString()}`);

    // Set loading state
    this.isLoadingSlots.set(true);
    // Don't reset hasCalculatedSlots here - we want to keep showing the loading state
    // instead of the error message while new slots are being calculated

    // Clear previous slots while loading
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

  /**
   * PHASE 3: Simplified and bulletproof slot calculation.
   * Generates all possible 15-minute slots, then filters using centralized validation.
   */
  private calculateAvailableTimes(bookings: Booking[], selectedDate: Date): void {
    console.log(`[SlotCalc] Starting slot calculation for ${selectedDate.toISOString()}`);
    console.log(`[SlotCalc] DevMode Active: ${this.devModeService.isDevMode()}`);

    const interval = 15; // 15-minute intervals

    // PHASE 3: Generate all possible 15-minute slots for a full 24-hour day
    const allSlots: string[] = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += interval) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        allSlots.push(timeStr);
      }
    }

    // PHASE 3: Single filter using the new isTimeSlotAvailable helper
    // This centralized function handles ALL validation: dev mode, business hours, and past time checks
    const availableSlots = allSlots.filter(time => {
      // Parse the time slot
      const [hours, minutes] = time.split(':').map(Number);

      // Construct slot start time from selectedDate components
      const slotStart = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        hours,
        minutes,
        0,
        0
      );

      // Use the new centralized validation function
      return this.isTimeSlotAvailable(slotStart);
    });

    // Filter out booked times
    this.availableStartTimes = availableSlots.filter(time => {
      return !this.isTimeBlocked(time, bookings, selectedDate);
    });

    console.log(`[SlotCalc] Finished. Found ${this.availableStartTimes.length} available start times.`);

    // PROACTIVE UX: Find and pre-select suggested slots
    this.findSuggestedSlots(bookings, selectedDate);
  }

  /**
   * PHASE 3: Core validation logic for time slot availability.
   * Centralizes all time constraint checks in one place.
   * @param slotStart The start time of the slot to validate
   * @returns true if the slot is available for booking
   */
  private isTimeSlotAvailable(slotStart: Date): boolean {
    // MASTER SWITCH: In Developer Mode, all time constraints are bypassed
    if (this.devModeService.isDevMode()) {
      return true;
    }

    // BUSINESS HOURS CHECK: Slots must be between 08:00 and 20:00
    const slotHour = slotStart.getHours();
    const slotMinute = slotStart.getMinutes();
    const businessStartHour = 8;
    const businessEndHour = 20;

    if (slotHour < businessStartHour || slotHour >= businessEndHour) {
      return false;
    }

    // PAST TIME CHECK: Slot end time must be in the future
    // Calculate slot end time (30 minutes after start)
    const defaultDurationMinutes = 30;
    const slotEnd = new Date(slotStart.getTime() + defaultDurationMinutes * 60000);

    // Compare timestamps to avoid timezone issues
    if (slotEnd.getTime() <= new Date().getTime()) {
      return false;
    }

    // All checks passed - slot is available
    return true;
  }

  /**
   * PHASE 3 CRITICAL BUG FIX: Accurate overlap detection for slot suggestions.
   * Checks if a time slot (with 30-minute duration) overlaps with any existing booking.
   *
   * @param time Start time in HH:mm format (e.g., "14:30")
   * @param bookings All bookings for the selected date
   * @param date The selected date
   * @returns true if the slot is blocked (overlaps with a booking), false if available
   */
  private isTimeBlocked(time: string, bookings: Booking[], date: Date): boolean {
    // Parse the time string
    const [hours, minutes] = time.split(':').map(Number);

    // CRITICAL FIX: Construct slot start time explicitly from date components
    // This ensures consistent date handling across all functions
    const slotStart = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      hours,
      minutes,
      0,
      0
    );

    // CRITICAL FIX: Calculate slot end time (30 minutes after start)
    // The previous implementation only checked if the START time was blocked,
    // completely ignoring the slot's DURATION. This caused suggestions of times
    // that would overlap with existing bookings.
    const defaultDuration = 30; // 30 minutes
    const slotEnd = new Date(slotStart.getTime() + defaultDuration * 60000);

    // STRATEGIC LOGGING: Trace each slot check for debugging
    console.log(`[isTimeBlocked] Checking slot: ${time} (${slotStart.toISOString()} - ${slotEnd.toISOString()})`);

    // Check if this slot overlaps with ANY existing booking
    const isBlocked = bookings.some(booking => {
      const bookingStart = new Date(booking.start_time);
      const bookingEnd = new Date(booking.end_time);

      // CORRECT OVERLAP DETECTION:
      // Two time ranges overlap if: Range1.start < Range2.end AND Range1.end > Range2.start
      // In our case: slotStart < bookingEnd AND slotEnd > bookingStart
      const overlaps = slotStart.getTime() < bookingEnd.getTime() && slotEnd.getTime() > bookingStart.getTime();

      // STRATEGIC LOGGING: Log every comparison for full visibility
      if (overlaps) {
        console.log(`  ❌ BLOCKED by booking: ${booking.name} (${bookingStart.toISOString()} - ${bookingEnd.toISOString()})`);
      }

      return overlaps;
    });

    if (!isBlocked) {
      console.log(`  ✅ AVAILABLE - No conflicts found`);
    }

    return isBlocked;
  }

  /**
   * FINAL FIX: Simple, predictable auto-fill.
   * Always updates endTime to startTime + 30 minutes.
   * No complex logic, no scenarios - just one simple rule.
   */
  private autoFillEndTime(startTime: string): void {
    if (!startTime) return;

    const [hours, minutes] = startTime.split(':').map(Number);
    const startDate = new Date();
    startDate.setHours(hours, minutes, 0, 0);

    const endDate = new Date(startDate.getTime() + 30 * 60000); // Add 30 minutes

    const endTimeStr = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;

    this.form.patchValue({ endTime: endTimeStr }, { emitEvent: false });
  }

  /**
   * PHASE 3 FINAL: Simplified suggestion logic - zero redundancy.
   * Uses pre-filtered this.availableStartTimes (already validated and conflict-free).
   * Simply selects the best 4 slots starting from "now" and calculates their end times.
   */
  private findSuggestedSlots(bookings: Booking[], selectedDate: Date): void {
    console.log(`[Suggestion] Finding suggestions from ${this.availableStartTimes.length} pre-filtered slots.`);

    const now = new Date();
    const isToday = selectedDate.toDateString() === now.toDateString();

    // STEP 1: Determine the earliest relevant time to start suggesting from
    let startSearchFrom: string;
    if (isToday) {
      // Start search 30 minutes before now to catch retroactive booking opportunities
      const searchTime = new Date(now.getTime() - 30 * 60000);

      // Round down to 15-minute interval for clean matching
      const minutes = searchTime.getMinutes();
      const roundedMinutes = Math.floor(minutes / 15) * 15;
      searchTime.setMinutes(roundedMinutes, 0, 0);

      // Format as HH:mm for string comparison
      startSearchFrom = `${searchTime.getHours().toString().padStart(2, '0')}:${roundedMinutes.toString().padStart(2, '0')}`;
    } else {
      // For future dates, start from the beginning of available slots
      startSearchFrom = '00:00';
    }

    // STEP 2: Filter available slots to only those >= startSearchFrom
    // String comparison works perfectly for HH:mm format ("14:30" >= "14:00" is true)
    const relevantSlots = this.availableStartTimes.filter(time => time >= startSearchFrom);

    // STEP 3: Take first 4 slots and calculate their end times
    const maxSuggestions = 4;
    const duration = 30; // 30 minutes

    const suggestions = relevantSlots.slice(0, maxSuggestions).map(startTime => {
      // Parse start time
      const [hours, minutes] = startTime.split(':').map(Number);

      // Create Date objects for calculation
      const startDate = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        hours,
        minutes,
        0,
        0
      );

      // Calculate end time
      const endDate = new Date(startDate.getTime() + duration * 60000);
      const endTime = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;

      return {
        startTime: startTime,
        endTime: endTime
      };
    });

    // STEP 4: Update signals and pre-select first slot
    this.suggestedSlots.set(suggestions);

    if (suggestions.length > 0) {
      this.selectSlot(0); // Auto-select first suggestion
    } else {
      this.selectedSlotIndex.set(null);
    }

    // STEP 5: Mark calculation complete
    this.isLoadingSlots.set(false);
    this.hasCalculatedSlots.set(true);
    console.log(`[Suggestion] Finished. Found ${suggestions.length} suggestions.`);
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
      this.countdownSubscription = timer(0, 1000).pipe(
        takeUntil(this.destroy$),
        map(() => {
          const now = new Date();
          const diffMs = conflictEndTime.getTime() - now.getTime();
          if (diffMs <= 0) {
            return null; // Time is up
          }
          const totalSeconds = Math.floor(diffMs / 1000);
          const hours = Math.floor(totalSeconds / 3600);
          const minutes = Math.floor((totalSeconds % 3600) / 60);
          const seconds = totalSeconds % 60;

          if (hours > 0) {
            return `Wieder verfügbar in: ${hours} Std. ${minutes} Min.`;
          }
          if (minutes > 0) {
            return `Wieder verfügbar in: ${minutes} Min. ${seconds} Sek.`;
          }
          return `Wieder verfügbar in: ${seconds} Sek.`;
        }),
        takeWhile(value => value !== null, true)
      ).subscribe(countdownText => {
        this.availabilityCountdown.set(countdownText);
      });
    } else {
      this.availabilityCountdown.set(null);
    }
  }

  public formatTime(dateString: string): string {
    if (!dateString) return '';
    return this.datePipe.transform(new Date(dateString), 'HH:mm') || '';
  }

  /**
   * PHASE 2: User-Empowering Philosophy - Always-Enabled Save Button
   *
   * The button is now enabled by default, trusting the user to submit their intended time.
   * Only disabled if core required fields are empty.
   *
   * REMOVED CONDITIONS:
   * - isSubmitting() - User can click again if needed
   * - form.invalid - Validation happens on submission
   * - bookingConflict() - User may want to proceed anyway
   */
  public isSubmitDisabled(): boolean {
    // ONLY check if required fields are filled
    const formValue = this.form.getRawValue();

    // Disable only if core fields are empty
    if (!formValue.roomId || !formValue.startTime || !formValue.endTime || !formValue.name) {
      return true;
    }

    // All required fields present - enable the button!
    return false;
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

  onSubmit(): void {
    if (this.isSubmitDisabled()) {
      return;
    }

    const formValue = this.form.getRawValue();
    console.log('[Submit] Form raw value on submit:', formValue);

    // Type guard to ensure roomId is not null
    if (!formValue.roomId) {
      return;
    }

    // CRITICAL FIX: Normalize time formats to ensure 24-hour HH:mm format
    // This handles cases where the timepicker might output AM/PM format
    const startTime24 = this.normalizeTimeFormat(formValue.startTime);
    const endTime24 = this.normalizeTimeFormat(formValue.endTime);

    // CRITICAL FIX: Robust date handling - support both Date objects and strings
    // Case 1: Date is a Date object (from datepicker)
    // Case 2: Date is a string (from prefillData in Smart Rebooking mode)
    let dateObj: Date;
    let dateStr: string;

    if (formValue.date instanceof Date) {
      // Case 1: Date object from datepicker
      dateObj = formValue.date;
      // Format using local timezone components to avoid timezone shifts
      dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
      console.log('[Submit] Date is Date object. Formatted as:', dateStr);
    } else {
      // Case 2: String from prefillData (Smart Rebooking)
      dateStr = formValue.date;
      // Parse back to Date object for validation
      dateObj = new Date(dateStr + 'T00:00:00');
      console.log('[Submit] Date is string (Smart Rebooking). Using:', dateStr);
    }

    // UX VALIDATION: Prevent booking meetings that are entirely in the past
    // CRITICAL FIX: Construct endDateTime EXCLUSIVELY from date components
    const [endHours, endMinutes] = endTime24.split(':').map(Number);

    // Build the date object explicitly from date components (local timezone)
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

    // CRITICAL FIX: Compare timestamps, not Date objects
    if (endDateTime.getTime() <= now.getTime()) {
      // Show elegant snackbar feedback (no red error bar in form)
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

      return; // Abort submission
    }

    const payload: BookingPayload = {
      roomId: formValue.roomId,
      name: formValue.name,
      startTime: startTime24,
      endTime: endTime24,
      date: dateStr, // Use the correctly determined date string
      comment: formValue.comment || undefined,
    };

    console.log('[Submit] Final payload being sent to parent:', payload);
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
          booker: booking.name,
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
        nextBooker: nextBooking?.name,
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
   * TIMELINE: Gets the current segment's booker name safely.
   * Only call this after shouldShowCountdown() returns true.
   */
  public getCurrentSegmentBooker(): string {
    const status = this.liveStatus();
    if (status.currentSegmentIndex !== undefined &&
        status.currentSegmentIndex !== null &&
        status.currentSegmentIndex >= 0 &&
        status.timelineSegments &&
        status.timelineSegments.length > status.currentSegmentIndex) {
      return status.timelineSegments[status.currentSegmentIndex].booker;
    }
    return '';
  }

  public async findNextAvailableSlot(): Promise<void> {
    const roomId = this.form.get('roomId')?.value;
    let date = this.form.get('date')?.value;

    if (!roomId || !date) {
      this.snackBar.open('Bitte wählen Sie zuerst einen Raum und ein Datum.', 'OK', {
        duration: 3000,
        panelClass: ['warning-snackbar']
      });
      return;
    }

    // Clear any existing conflict warning
    this.bookingConflict.set(null);

    // Show loading state
    this.isSearchingSlot.set(true);

    try {
      // Try to find a slot today first
      const slot = await this.searchForSlot(roomId, date);

      if (slot) {
        // SUCCESS - Found a slot today!
        this.fillSlotAndFocus(slot);
        return;
      }

      // No slot found today - try tomorrow
      const tomorrow = new Date(date);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const tomorrowSlot = await this.searchForSlot(roomId, tomorrow);

      if (tomorrowSlot) {
        // Found a slot tomorrow - offer to book it
        const tomorrowFormatted = this.datePipe.transform(tomorrow, 'EEEE, dd. MMMM');

        const snackBarRef = this.snackBar.open(
          `Heute ist alles belegt. Nächster freier Slot: ${tomorrowFormatted} um ${tomorrowSlot.startTime} Uhr`,
          'Jetzt buchen',
          {
            duration: 10000,
            panelClass: ['info-snackbar']
          }
        );

        snackBarRef.onAction().subscribe(() => {
          // User clicked "Jetzt buchen" - switch to tomorrow
          this.form.patchValue({ date: tomorrow }, { emitEvent: true });
          // Slot will be filled after bookings are loaded
          setTimeout(() => {
            this.fillSlotAndFocus(tomorrowSlot);
          }, 500);
        });
      } else {
        // No slots today or tomorrow
        this.snackBar.open(
          'Keine freien Slots heute oder morgen gefunden. Bitte wählen Sie ein späteres Datum.',
          'OK',
          {
            duration: 5000,
            panelClass: ['warning-snackbar']
          }
        );
      }
    } finally {
      this.isSearchingSlot.set(false);
    }
  }

  private async searchForSlot(roomId: number, date: Date): Promise<{ startTime: string; endTime: string } | null> {
    // Load bookings for this date
    const dateStr = date.toISOString().split('T')[0];

    try {
      const bookings = await new Promise<Booking[]>((resolve, reject) => {
        this.apiService.getRoomBookings(roomId, dateStr)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: resolve,
            error: reject
          });
      });

      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();

      // DEVELOPER MODE: Business hours configuration
      const businessStartHour = this.devModeService.isDevMode() ? 0 : 8;
      const businessEndHour = this.devModeService.isDevMode() ? 24 : 20;

      // Start from current time if today, otherwise from business start
      let searchTime: Date;
      if (isToday) {
        searchTime = new Date(now);
        // Round up to next 15-minute interval
        const minutes = searchTime.getMinutes();
        const roundedMinutes = Math.ceil(minutes / 15) * 15;
        searchTime.setMinutes(roundedMinutes, 0, 0);
      } else {
        // CRITICAL FIX: Construct searchTime explicitly from date components
        searchTime = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
          businessStartHour, 0, 0, 0
        );
      }

      // CRITICAL FIX: Construct endOfDay explicitly from date components
      const endOfDay = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        businessEndHour, 0, 0, 0
      );

      const duration = 30; // 30 minutes

      // CRITICAL FIX: Compare timestamps throughout
      // Search for the next free slot
      while (searchTime.getTime() < endOfDay.getTime()) {
        const endTime = new Date(searchTime.getTime() + duration * 60000);

        // CRITICAL FIX: Compare timestamps, not Date objects
        // Check if end time is within business hours
        if (endTime.getTime() > endOfDay.getTime()) {
          break;
        }

        // Check if this slot overlaps with any booking
        const hasConflict = bookings.some(booking => {
          const bookingStart = new Date(booking.start_time);
          const bookingEnd = new Date(booking.end_time);
          // CRITICAL FIX: Compare timestamps, not Date objects
          return (searchTime.getTime() < bookingEnd.getTime() && endTime.getTime() > bookingStart.getTime());
        });

        if (!hasConflict) {
          // Found a free slot!
          return {
            startTime: `${searchTime.getHours().toString().padStart(2, '0')}:${searchTime.getMinutes().toString().padStart(2, '0')}`,
            endTime: `${endTime.getHours().toString().padStart(2, '0')}:${endTime.getMinutes().toString().padStart(2, '0')}`
          };
        }

        // Move to next 15-minute interval
        searchTime = new Date(searchTime.getTime() + 15 * 60000);
      }

      // No slot found for this date
      return null;
    } catch (error) {
      return null;
    }
  }

  private fillSlotAndFocus(slot: { startTime: string; endTime: string }): void {
    // Fill the form fields
    this.form.patchValue({
      startTime: slot.startTime,
      endTime: slot.endTime
    });

    // Show success message
    this.snackBar.open(`Slot gefunden: ${slot.startTime} - ${slot.endTime} Uhr`, '✓', {
      duration: 2000,
      panelClass: ['success-snackbar']
    });

    // Focus on name field after a short delay (to allow form to update)
    setTimeout(() => {
      this.nameInput?.nativeElement.focus();
    }, 300);
  }
}