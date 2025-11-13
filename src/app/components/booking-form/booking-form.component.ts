import { Component, OnInit, OnDestroy, inject, input, output, ViewChild, ElementRef, signal, effect, ChangeDetectionStrategy, computed } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators, ValidatorFn, ValidationErrors, AbstractControl } from '@angular/forms';
import { Subject, timer, Subscription } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, map, takeWhile } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { Room } from '../../models/room.model';
import { Booking, BookingPayload } from '../../models/booking.model';
import { FormMode, BookingFormState, BookingFormData } from '../../models/booking-form-state.model';
import { formatToHHMM } from '../../utils/date-time.utils';
import { ErrorHandlingService } from '../../core/services/error-handling.service';

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

@Component({
  selector: 'app-booking-form',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatFormFieldModule, MatInputModule,
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
  private readonly errorHandler = inject(ErrorHandlingService);
  private destroy$ = new Subject<void>();
  private countdownSubscription: Subscription | null = null;

  // === NEW STATE MACHINE API ===
  // Single unified input for all state configuration
  readonly initialState = input<BookingFormState | null>(null);

  // --- State Management ---
  // STATE MACHINE: The mode signal is the single source of truth for component behavior
  private readonly currentMode = signal<FormMode>(FormMode.NEW);
  private readonly formData = signal<BookingFormData | null>(null);
  private readonly bookingToUpdateId = signal<number | null>(null); // ID of booking being rescheduled
  public readonly FormMode = FormMode; // Expose enum to template

  public readonly bookingConflict = signal<Booking | null>(null);
  public readonly availabilityCountdown = signal<string | null>(null);

  // === UI State Derived from Mode ===
  readonly headerTitle = computed(() => this.getHeaderTitle());
  readonly showRescheduleIndicator = computed(() =>
    this.currentMode() === FormMode.RESCHEDULE
  );
  readonly showSmartRecoveryBanner = computed(() =>
    this.currentMode() === FormMode.SMART_RECOVERY
  );

  // === LEGACY Input Signals (Backwards Compatibility) ===
  readonly room = input.required<Room>();
  readonly isSubmitting = input<boolean>(false);
  readonly isSmartRebooking = input<boolean>(false); // DEPRECATED: Use initialState with mode=SMART_RECOVERY
  readonly roomIdInput = input<number | null>(null, { alias: 'roomId' });
  readonly suggestedStartTime = input<string | null>(null); // DEPRECATED: Use initialState with mode=NEW_WITH_SUGGESTION
  readonly suggestedEndTime = input<string | null>(null); // DEPRECATED: Use initialState with mode=NEW_WITH_SUGGESTION
  readonly initialConflict = input<Booking | null>(null); // DEPRECATED: Use initialState with data.conflict
  readonly prefillData = input<{
    date: string;
    startTime: string;
    endTime: string;
    title: string;
    name?: string;
    comment?: string;
  } | null>(null); // DEPRECATED: Use initialState with mode=RESCHEDULE or SMART_RECOVERY

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
  private liveStatusTimer: ReturnType<typeof setInterval> | null = null;

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

    effect(() => {
      const state = this.initialState();

      if (state) {
        this.currentMode.set(state.mode);
        this.formData.set(state.data || null);
        this.configureFormForMode(state);
      } else {
        this.configureLegacyInputs();
      }
    }, { allowSignalWrites: true });

    // Effect to sync roomIdInput signal to form control
    effect(() => {
      const roomId = this.roomIdInput();
      if (roomId && this.form.get('roomId')?.value !== roomId) {
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
      // Only calculate suggestions for NEW and NEW_WITH_SUGGESTION modes
      const mode = this.currentMode();
      if (mode === FormMode.NEW || mode === FormMode.NEW_WITH_SUGGESTION) {
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
      const mode = this.currentMode();
      // Only calculate suggestions for NEW and NEW_WITH_SUGGESTION modes
      if (mode === FormMode.NEW || mode === FormMode.NEW_WITH_SUGGESTION) {
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
    const mode = this.currentMode();
    // Don't load bookings for prefilled modes (RESCHEDULE, SMART_RECOVERY)
    if (mode === FormMode.RESCHEDULE || mode === FormMode.SMART_RECOVERY) {
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
          this.calculateLiveStatus();
        },
        error: (error) => {
          this.dayBookings.set([]);
          this.calculateAvailableTimes([], date);
          this.calculateLiveStatus();
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

    const endTimeStr = this.addMinutesToStringTime(startTime, 30);

    this.form.patchValue({ endTime: endTimeStr }, { emitEvent: false });
  }

  private findSuggestedSlots(bookings: Booking[], selectedDate: Date): void {
    const now = new Date();
    const isToday = selectedDate.toDateString() === now.toDateString();

    let startSearchFrom: string;
    if (isToday) {
      const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const minutes = now.getMinutes();
      const interval = 15;
      const remainder = minutes % interval;
      const minutesToAdd = remainder === 0 ? 0 : interval - remainder;
      startSearchFrom = this.addMinutesToStringTime(currentTimeStr, minutesToAdd);
    } else {
      startSearchFrom = '00:00';
    }

    const relevantSlots = this.availableStartTimes.filter(time => time >= startSearchFrom);

    const maxSuggestions = 4;
    const duration = 30;

    const suggestions = relevantSlots.slice(0, maxSuggestions).map(startTime => {
      const endTime = this.addMinutesToStringTime(startTime, duration);

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

  public selectSlot(index: number): void {
    const slots = this.suggestedSlots();
    if (index < 0 || index >= slots.length) {
      return;
    }

    const slot = slots[index];
    this.selectedSlotIndex.set(index);

    this.form.patchValue({
      startTime: slot.startTime,
      endTime: slot.endTime
    }, { emitEvent: false });

    this.checkConflict();
  }

  private configureFormForMode(state: BookingFormState): void {
    switch (state.mode) {
      case FormMode.NEW:
        this.configureForNewBooking();
        break;

      case FormMode.NEW_WITH_SUGGESTION:
        this.configureWithSuggestion(state.data!);
        break;

      case FormMode.RESCHEDULE:
        this.configureForReschedule(state.data!);
        break;

      case FormMode.SMART_RECOVERY:
        this.configureForSmartRecovery(state.data!);
        break;

      default:
        this.configureForNewBooking();
    }
  }

  private configureForNewBooking(): void {
    this.isLoadingSlots.set(true);
    this.hasCalculatedSlots.set(false);
  }

  private configureWithSuggestion(data: BookingFormData): void {

    if (data.date && data.startTime && data.endTime) {
      const dateObj = new Date(data.date + 'T00:00:00');

      this.form.patchValue({
        date: dateObj,
        startTime: data.startTime,
        endTime: data.endTime
      }, { emitEvent: false });
    }

    this.isLoadingSlots.set(false);
  }

  private configureForReschedule(data: BookingFormData): void {
    this.bookingToUpdateId.set(data.bookingId ?? null);

    if (data.date && data.startTime && data.endTime) {
      const dateObj = new Date(data.date + 'T00:00:00');
      const bookingTitle = data.title || '';

      this.form.patchValue({
        date: dateObj,
        startTime: data.startTime,
        endTime: data.endTime,
        title: bookingTitle,
        comment: data.comment || null
      }, { emitEvent: false });
    }

    this.isLoadingSlots.set(false);
  }

  private configureForSmartRecovery(data: BookingFormData): void {

    if (data.date && data.startTime && data.endTime) {
      const dateObj = new Date(data.date + 'T00:00:00');
      const bookingTitle = data.title || '';

      this.form.patchValue({
        date: dateObj,
        startTime: data.startTime,
        endTime: data.endTime,
        title: bookingTitle,
        comment: data.comment || null
      }, { emitEvent: false });
    }

    this.isLoadingSlots.set(false);
  }

  private configureLegacyInputs(): void {
    const prefill = this.prefillData();
    if (prefill) {

      const isSmartRebooking = this.isSmartRebooking();
      this.currentMode.set(isSmartRebooking ? FormMode.SMART_RECOVERY : FormMode.RESCHEDULE);

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
      return;
    }

    const startTime = this.suggestedStartTime();
    const endTime = this.suggestedEndTime();
    if (startTime && endTime) {
      this.currentMode.set(FormMode.NEW_WITH_SUGGESTION);
      this.form.patchValue({ startTime, endTime }, { emitEvent: false });
      return;
    }

    const conflict = this.initialConflict();
    if (conflict) {
      this.bookingConflict.set(conflict);
    }

    this.currentMode.set(FormMode.NEW);
  }

  private getHeaderTitle(): string {
    switch (this.currentMode()) {
      case FormMode.NEW:
      case FormMode.NEW_WITH_SUGGESTION:
        return 'Neue Buchung';
      case FormMode.RESCHEDULE:
        return 'Buchung verschieben';
      case FormMode.SMART_RECOVERY:
        return 'Smart Rebooking';
      default:
        return 'Buchung';
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.countdownSubscription) {
      this.countdownSubscription.unsubscribe();
    }
    if (this.liveStatusTimer) {
      clearInterval(this.liveStatusTimer);
      this.liveStatusTimer = null;
    }
  }

  private checkConflict(): void {
    const formValue = this.form.getRawValue();
    const { roomId, date, startTime, endTime } = formValue;

    if (!roomId || !date || !startTime || !endTime) {
      this.bookingConflict.set(null);
      this.updateCountdown(null);
      return;
    }

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
    if (this.countdownSubscription) {
      this.countdownSubscription.unsubscribe();
      this.countdownSubscription = null;
    }

    if (conflict) {
      const conflictEndTime = new Date(conflict.end_time);
      const availableLabel = this.formatTime(conflictEndTime);
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

  public formatTime = formatToHHMM;

  public isSubmitDisabled(): boolean {
    const formValue = this.form.getRawValue();
    const title = formValue.title?.trim() ?? '';
    return !formValue.roomId || !formValue.startTime || !formValue.endTime || title.length < 2;
  }

  /**
   * Adds minutes to a time string in "HH:mm" format using pure string arithmetic.
   * This method NEVER creates Date objects for time calculations, preventing timezone bugs.
   * @param timeString - Time in "HH:mm" format
   * @param minutesToAdd - Number of minutes to add (can be negative)
   * @returns New time string in "HH:mm" format
   */
  private addMinutesToStringTime(timeString: string, minutesToAdd: number): string {
    if (!timeString || !timeString.includes(':')) {
      return '00:00';
    }
    const [hours, minutes] = timeString.split(':').map(Number);
    const totalMinutes = (hours * 60) + minutes;
    const newTotalMinutes = totalMinutes + minutesToAdd;

    const newHours = Math.floor(newTotalMinutes / 60) % 24;
    const newMinutes = newTotalMinutes % 60;

    const formattedHours = String(newHours).padStart(2, '0');
    const formattedMinutes = String(newMinutes).padStart(2, '0');

    return `${formattedHours}:${formattedMinutes}`;
  }

  private normalizeTimeFormat(time: string): string {
    const amPmRegex = /(\d{1,2}):(\d{2})\s*(AM|PM)/i;
    const match = time.match(amPmRegex);

    if (match) {
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

    const mode = this.currentMode();
    const bookingId = this.bookingToUpdateId();

    if (mode === FormMode.RESCHEDULE && bookingId) {
      this.handleRescheduleSubmission(bookingId, payload);
      return;
    }

    this.submitted.emit(payload);
  }

  private handleRescheduleSubmission(bookingId: number, payload: BookingPayload): void {

    this.apiService.rescheduleBooking(bookingId, payload).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.errorHandler.showSuccess('Buchung erfolgreich aktualisiert!');

        setTimeout(() => {
          window.history.back();
        }, 500);
      },
      error: (error) => {
        // ErrorHandlingService will handle the error display via ApiService
        // No need for manual error handling here
      }
    });
  }

  onReset(): void {
    this.form.reset();
    this.resetForm.emit();
  }

  private findBookingBlock(currentBooking: Booking, allBookings: Booking[]): Booking[] {
    const blockBookings: Booking[] = [currentBooking];
    let foundConsecutive = true;
    let currentEnd = new Date(currentBooking.end_time);

    while (foundConsecutive) {
      foundConsecutive = false;

      for (const booking of allBookings) {
        const bookingStart = new Date(booking.start_time);
        const bookingEnd = new Date(booking.end_time);

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

    if (!isToday) {
      this.liveStatus.set({ type: null });
      this.stopLiveCountdown();
      return;
    }

    const bookings = this.dayBookings();

    const currentBooking = bookings.find(booking => {
      const start = new Date(booking.start_time);
      const end = new Date(booking.end_time);
      return start.getTime() <= now.getTime() && end.getTime() > now.getTime();
    });

    if (currentBooking) {
      const blockBookings = this.findBookingBlock(currentBooking, bookings);
      const blockStartTime = new Date(blockBookings[0].start_time);
      const blockEndTime = new Date(blockBookings[blockBookings.length - 1].end_time);
      const totalBlockMinutes = Math.floor((blockEndTime.getTime() - blockStartTime.getTime()) / 60000);

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

      const currentSegmentIndex = timelineSegments.findIndex(segment => {
        return now.getTime() >= segment.startTime.getTime() && now.getTime() < segment.endTime.getTime();
      });

      let currentSegmentProgress = 0;
      if (currentSegmentIndex >= 0) {
        const currentSegment = timelineSegments[currentSegmentIndex];
        const segmentDurationMs = currentSegment.endTime.getTime() - currentSegment.startTime.getTime();
        const elapsedMs = now.getTime() - currentSegment.startTime.getTime();
        currentSegmentProgress = Math.min(100, Math.max(0, (elapsedMs / segmentDurationMs) * 100));
      }

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

    this.liveStatus.set({ type: null });
    this.stopLiveCountdown();
  }

  private startLiveCountdown(): void {
    this.stopLiveCountdown();
    this.updateTimeline();
    this.liveStatusTimer = setInterval(() => {
      this.updateTimeline();
    }, 1000);
  }

  private stopLiveCountdown(): void {
    if (this.liveStatusTimer) {
      clearInterval(this.liveStatusTimer);
      this.liveStatusTimer = null;
      this.countdownText.set('');
    }
  }

  private updateTimeline(): void {
    const status = this.liveStatus();

    if (!status.timelineSegments || status.currentSegmentIndex === undefined || status.currentSegmentIndex < 0) {
      this.calculateLiveStatus();
      return;
    }

    const currentSegment = status.timelineSegments[status.currentSegmentIndex];
    const now = new Date();

    if (now.getTime() >= currentSegment.endTime.getTime()) {
      this.calculateLiveStatus();
      return;
    }

    const remainingMs = currentSegment.endTime.getTime() - now.getTime();
    const totalSeconds = Math.floor(remainingMs / 1000);

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    this.countdownText.set(formattedTime);

    const segmentDurationMs = currentSegment.endTime.getTime() - currentSegment.startTime.getTime();
    const elapsedMs = now.getTime() - currentSegment.startTime.getTime();
    const progress = Math.min(100, Math.max(0, (elapsedMs / segmentDurationMs) * 100));

    const updatedStatus: RoomLiveStatus = {
      ...status,
      currentSegmentProgress: progress
    };

    this.liveStatus.set(updatedStatus);
  }

  public shouldShowCountdown(): boolean {
    const status = this.liveStatus();
    return status.currentSegmentIndex !== undefined &&
           status.currentSegmentIndex !== null &&
           status.currentSegmentIndex >= 0 &&
           status.timelineSegments !== undefined &&
           status.timelineSegments.length > 0;
  }

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
