import { Component, OnInit, OnDestroy, inject, Input, Output, EventEmitter, OnChanges, SimpleChanges, ViewChild, ElementRef, signal } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators, ValidatorFn, ValidationErrors, AbstractControl } from '@angular/forms';
import { Subject, BehaviorSubject, timer, Subscription } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, map, takeWhile } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { Room } from '../../models/room.model';
import { Booking, BookingPayload } from '../../models/booking.model';

// Other necessary imports for Angular Material, NgIf, AsyncPipe etc.
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
import { NgFor, NgIf, AsyncPipe, CommonModule } from '@angular/common';

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

@Component({
  selector: 'app-booking-form',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatDatepickerModule, MatNativeDateModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatSnackBarModule, MatChipsModule, NgFor, NgIf, AsyncPipe, CommonModule
  ],
  templateUrl: './booking-form.component.html',
  styleUrls: ['./booking-form.component.css'],
})
export class BookingFormComponent implements OnInit, OnChanges, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly apiService = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);
  private destroy$ = new Subject<void>();
  private countdownSubscription: Subscription | null = null;

  // --- CRITICAL FIX: USE BEHAVIORSUBJECTS ---
  public bookingConflict$ = new BehaviorSubject<Booking | null>(null);
  public availabilityCountdown$ = new BehaviorSubject<string | null>(null);

  @Input({ required: true }) rooms: Room[] = [];
  @Input() isSubmitting: boolean = false;

  // Available time slots and bookings for the selected date
  public dayBookings$ = new BehaviorSubject<Booking[]>([]);
  public availableStartTimes: string[] = [];
  public availableEndTimes: string[] = [];

  // Suggested slots for proactive UX
  public readonly suggestedSlots = signal<{ startTime: string; endTime: string }[]>([]);
  public readonly selectedSlotIndex = signal<number | null>(null);

  // UI State
  public readonly isSearchingSlot = signal<boolean>(false);
  public readonly isLoadingSlots = signal<boolean>(false);

  // Live Status Banner State
  public readonly liveStatus = signal<RoomLiveStatus>({ type: null });
  public readonly countdownText = signal<string>('');
  private liveStatusTimer: any = null;

  // ViewChild for focus management
  @ViewChild('nameInput') nameInput?: ElementRef<HTMLInputElement>;

  @Input()
  set roomId(value: number | null) {
    // Only update if the value actually changes to prevent unnecessary form patching
    if (this.form.get('roomId')?.value !== value) {
      this.form.patchValue({ roomId: value }, { emitEvent: false });
    }
  }
  get roomId(): number | null {
    return this.form.get('roomId')?.value || null;
  }

  @Input()
  set initialConflict(conflict: Booking | null) {
    // DO NOT set initial conflict automatically
    // The conflict should only be shown when user actively selects a time that conflicts
    // The checkConflict() method will handle this properly
    console.log('initialConflict input received (ignored):', conflict);
  }

  @Input() suggestedStartTime: string | null = null;
  @Input() suggestedEndTime: string | null = null;
  @Output() submitted = new EventEmitter<BookingPayload>();
  @Output() resetForm = new EventEmitter<void>();

  readonly form: FormGroup<BookingFormControls>;

  constructor() {
    this.form = this.fb.group({
      roomId: new FormControl<number | null>(null, { validators: [Validators.required, this.validRoomIdValidator()] }),
      date: new FormControl(new Date(), { nonNullable: true, validators: Validators.required }),
      startTime: new FormControl('', { nonNullable: true, validators: Validators.required }),
      endTime: new FormControl('', { nonNullable: true, validators: Validators.required }),
      name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
      comment: new FormControl<string | null>(null),
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

  ngOnInit(): void {
    // Load day bookings when roomId or date changes
    this.form.valueChanges.pipe(
      takeUntil(this.destroy$),
      debounceTime(300),
      distinctUntilChanged((prev, curr) =>
        prev.roomId === curr.roomId &&
        prev.date?.getTime() === curr.date?.getTime() &&
        prev.startTime === curr.startTime &&
        prev.endTime === curr.endTime
      )
    ).subscribe((values) => {
      // Load bookings when room or date changes
      if (values.roomId && values.date) {
        this.loadDayBookings(values.roomId, values.date);
      }

      // Auto-fill end time when start time changes
      if (values.startTime && !values.endTime) {
        this.autoFillEndTime(values.startTime);
      }

      // Check for conflicts
      this.checkConflict();
    });

    // CRITICAL FIX: Handle initial load state
    // The roomId setter uses { emitEvent: false }, so valueChanges doesn't trigger for the initial value.
    // We must explicitly check and load bookings for the initial state after the current change detection cycle.
    setTimeout(() => {
      const currentRoomId = this.form.get('roomId')?.value;
      const currentDate = this.form.get('date')?.value;

      console.log('\n=== INITIAL LOAD CHECK (ngOnInit) ===');
      console.log('Initial roomId:', currentRoomId);
      console.log('Initial date:', currentDate);

      if (currentRoomId && currentDate) {
        console.log('✓ Initial values found - triggering loadDayBookings');
        this.loadDayBookings(currentRoomId, currentDate);
      } else {
        console.log('⚠️ Initial values incomplete - waiting for user input');
        // If no initial values, ensure loading state is false
        this.isLoadingSlots.set(false);
      }
      console.log('=== END INITIAL LOAD CHECK ===\n');
    }, 0);
  }

  private loadDayBookings(roomId: number, date: Date): void {
    const dateStr = date.toISOString().split('T')[0];
    console.log(`\n=== LOADING BOOKINGS ===`);
    console.log(`Room ID: ${roomId}`);
    console.log(`Date: ${dateStr}`);
    console.log(`Full Date Object:`, date);

    // Set loading state
    this.isLoadingSlots.set(true);

    // Clear previous slots while loading
    this.suggestedSlots.set([]);
    this.selectedSlotIndex.set(null);

    this.apiService.getRoomBookings(roomId, dateStr)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (bookings) => {
          console.log(`✓ Successfully loaded ${bookings.length} bookings for the day`);
          if (bookings.length > 0) {
            console.log('Bookings details:', bookings);
          } else {
            console.log('✓ No bookings found - day is completely free!');
          }
          this.dayBookings$.next(bookings);
          this.calculateAvailableTimes(bookings, date);

          // LIVE STATUS BANNER: Calculate live status after bookings are loaded
          this.calculateLiveStatus();

          // CRITICAL FIX: Set loading state to false AFTER all calculations are complete
          // This ensures the UI never sees an intermediate state where loading=false but suggestedSlots is still empty
        },
        error: (error) => {
          console.error('❌ Error loading bookings:', error);
          // On error, assume no bookings and continue
          this.dayBookings$.next([]);
          this.calculateAvailableTimes([], date);

          // LIVE STATUS BANNER: Calculate live status even on error
          this.calculateLiveStatus();

          // CRITICAL FIX: Set loading state to false AFTER all calculations are complete
        }
      });
  }

  private calculateAvailableTimes(bookings: Booking[], selectedDate: Date): void {
    console.log('\n=== CALCULATING AVAILABLE TIMES ===');
    console.log('Selected date:', selectedDate.toISOString());
    console.log('Number of bookings:', bookings.length);

    const now = new Date();
    const isToday = selectedDate.toDateString() === now.toDateString();
    console.log('Is today:', isToday);

    // Business hours: 8:00 - 20:00
    const startHour = 8;
    const endHour = 20;
    const interval = 15; // 15-minute intervals

    // Generate all possible time slots
    const allSlots: string[] = [];
    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += interval) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        allSlots.push(timeStr);
      }
    }

    console.log(`Generated ${allSlots.length} total time slots (${startHour}:00 - ${endHour}:00)`);

    // Filter out past times if today
    // UX IMPROVEMENT: Allow retroactive bookings where end time is still in the future
    let availableSlots = allSlots;
    if (isToday) {
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      console.log('Current time:', currentTime);

      const defaultDurationMinutes = 30; // Standard meeting duration

      availableSlots = allSlots.filter(time => {
        // Parse the time slot
        const [hours, minutes] = time.split(':').map(Number);
        const slotStart = new Date(selectedDate);
        slotStart.setHours(hours, minutes, 0, 0);

        // Calculate the default end time (30 minutes later)
        const slotEnd = new Date(slotStart.getTime() + defaultDurationMinutes * 60000);

        // Allow the slot if the end time is in the future
        // This enables retroactive bookings (e.g., booking a meeting that started at 13:00 when it's now 13:15)
        const isValid = slotEnd > now;

        if (!isValid) {
          // Log why this slot was filtered out for debugging
          console.log(`Filtered out slot ${time} (end time ${slotEnd.toLocaleTimeString()} is in the past)`);
        }

        return isValid;
      });

      console.log(`After filtering past times: ${availableSlots.length} slots remain (allowing retroactive bookings)`);
    }

    // Filter out booked times
    this.availableStartTimes = availableSlots.filter(time => {
      return !this.isTimeBlocked(time, bookings, selectedDate);
    });

    console.log(`After filtering booked times: ${this.availableStartTimes.length} available start times`);
    console.log('=== END CALCULATING AVAILABLE TIMES ===\n');

    // PROACTIVE UX: Find and pre-select suggested slots
    this.findSuggestedSlots(bookings, selectedDate);
  }

  private isTimeBlocked(time: string, bookings: Booking[], date: Date): boolean {
    const dateStr = date.toISOString().split('T')[0];
    const checkTime = new Date(`${dateStr} ${time}:00`);

    return bookings.some(booking => {
      const bookingStart = new Date(booking.start_time);
      const bookingEnd = new Date(booking.end_time);
      return checkTime >= bookingStart && checkTime < bookingEnd;
    });
  }

  private autoFillEndTime(startTime: string): void {
    // Default duration: 30 minutes
    const [hours, minutes] = startTime.split(':').map(Number);
    const endDate = new Date();
    endDate.setHours(hours, minutes + 30, 0, 0);

    const endTimeStr = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;

    this.form.patchValue({ endTime: endTimeStr }, { emitEvent: false });
    console.log(`Auto-filled end time: ${endTimeStr}`);
  }

  /**
   * PROACTIVE UX: Finds the next 3-4 available time slots and automatically pre-selects the first one.
   * This transforms the booking experience from "empty fields" to "smart suggestions".
   */
  private findSuggestedSlots(bookings: Booking[], selectedDate: Date): void {
    console.log('=== findSuggestedSlots START ===');
    console.log('Selected date:', selectedDate.toISOString());
    console.log('Number of bookings:', bookings.length);
    console.log('Bookings:', bookings);

    const now = new Date();
    const isToday = selectedDate.toDateString() === now.toDateString();
    console.log('Is today:', isToday);
    console.log('Current time:', now.toISOString());

    // Start from current time if today, otherwise from 8:00
    // UX IMPROVEMENT: Allow retroactive bookings by searching backwards from current time
    let searchTime: Date;
    if (isToday) {
      // Start search 30 minutes before now to find retroactive slots
      // (where end time is still in the future)
      searchTime = new Date(now.getTime() - 30 * 60000);

      // Don't search before business hours start
      const businessStart = new Date(selectedDate);
      businessStart.setHours(8, 0, 0, 0);
      if (searchTime < businessStart) {
        searchTime = businessStart;
      }

      // Round down to 15-minute interval
      const minutes = searchTime.getMinutes();
      const roundedMinutes = Math.floor(minutes / 15) * 15;
      searchTime.setMinutes(roundedMinutes, 0, 0);

      console.log('Search start time (today, allowing retroactive bookings):', searchTime.toISOString());
    } else {
      searchTime = new Date(selectedDate);
      searchTime.setHours(8, 0, 0, 0);
      console.log('Search start time (future date):', searchTime.toISOString());
    }

    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(20, 0, 0, 0);
    console.log('End of business day:', endOfDay.toISOString());

    // If search time is already past business hours, use full day
    if (searchTime >= endOfDay && isToday) {
      console.log('⚠️ Current time is past business hours. No slots available for today.');
      this.suggestedSlots.set([]);
      this.selectedSlotIndex.set(null);
      // CRITICAL FIX: Also set loading state to false on early return
      this.isLoadingSlots.set(false);
      console.log('✓ Loading complete. Final state: 0 slots available (past business hours)');
      return;
    }

    const duration = 30; // 30 minutes
    const maxSuggestions = 4; // Find up to 4 slots
    const foundSlots: { startTime: string; endTime: string }[] = [];

    let iterationCount = 0;
    const maxIterations = 200; // Safety limit

    // Search for available slots
    while (searchTime < endOfDay && foundSlots.length < maxSuggestions && iterationCount < maxIterations) {
      iterationCount++;

      const endTime = new Date(searchTime.getTime() + duration * 60000);

      // Check if end time is within business hours
      if (endTime > endOfDay) {
        console.log('End time exceeds business hours, stopping search');
        break;
      }

      // UX IMPROVEMENT: Skip slots where end time is in the past (retroactive booking not possible)
      if (isToday && endTime <= now) {
        console.log(`Skipping slot ${searchTime.toLocaleTimeString()} (end time ${endTime.toLocaleTimeString()} is in the past)`);
        searchTime = new Date(searchTime.getTime() + 15 * 60000);
        continue;
      }

      // Check if this slot overlaps with any booking
      const hasConflict = bookings.some(booking => {
        const bookingStart = new Date(booking.start_time);
        const bookingEnd = new Date(booking.end_time);
        const overlaps = (searchTime < bookingEnd && endTime > bookingStart);

        if (overlaps) {
          console.log(`  Conflict detected: ${searchTime.toLocaleTimeString()} conflicts with booking ${bookingStart.toLocaleTimeString()}-${bookingEnd.toLocaleTimeString()}`);
        }

        return overlaps;
      });

      if (!hasConflict) {
        // Found a free slot!
        const slotStart = `${searchTime.getHours().toString().padStart(2, '0')}:${searchTime.getMinutes().toString().padStart(2, '0')}`;
        const slotEnd = `${endTime.getHours().toString().padStart(2, '0')}:${endTime.getMinutes().toString().padStart(2, '0')}`;

        console.log(`✓ Found available slot: ${slotStart} - ${slotEnd}`);

        foundSlots.push({
          startTime: slotStart,
          endTime: slotEnd
        });
      }

      // Move to next 15-minute interval
      searchTime = new Date(searchTime.getTime() + 15 * 60000);
    }

    console.log(`Total iterations: ${iterationCount}`);
    console.log(`Found ${foundSlots.length} suggested slots:`, foundSlots);

    // CRITICAL: Use .set() to update the signal, triggering UI update
    this.suggestedSlots.set(foundSlots);

    // AUTOMATIC PRE-SELECTION: Fill the first available slot
    if (foundSlots.length > 0) {
      this.selectSlot(0);
    } else {
      // No slots available - clear selection
      this.selectedSlotIndex.set(null);
      console.log('⚠️ No available slots found for this date');
    }

    // CRITICAL FIX: Set loading state to false AFTER all slot calculations and signal updates are complete
    // This prevents the UI from showing "no slots available" error during the brief moment when
    // isLoadingSlots=false but suggestedSlots is still being populated
    this.isLoadingSlots.set(false);
    console.log(`✓ Loading complete. Final state: ${foundSlots.length} slots available`);
    console.log('=== findSuggestedSlots END ===');
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

    console.log(`Selected slot ${index}: ${slot.startTime} - ${slot.endTime}`);

    // Trigger conflict check manually since we disabled emitEvent
    this.checkConflict();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // The roomId setter already handles patching roomId, so we only need to patch other inputs here.
    if (changes['suggestedStartTime'] && this.suggestedStartTime) {
        this.form.patchValue({ startTime: this.suggestedStartTime }, { emitEvent: false });
    }
    if (changes['suggestedEndTime'] && this.suggestedEndTime) {
        this.form.patchValue({ endTime: this.suggestedEndTime }, { emitEvent: false });
    }
    
    // The initial conflict check is now handled by the initialConflict setter.
    // No need to call checkConflict() here anymore.
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
      this.bookingConflict$.next(null);
      this.updateCountdown(null);
      return;
    }

    // Validate that times are properly formatted
    if (!startTime.includes(':') || !endTime.includes(':')) {
      this.bookingConflict$.next(null);
      this.updateCountdown(null);
      return;
    }

    const formattedDate = date.toISOString().split('T')[0];
    console.log(`Checking conflict for: ${formattedDate} ${startTime}-${endTime}`);

    this.apiService.checkBookingConflict(roomId, formattedDate, startTime, endTime)
      .pipe(takeUntil(this.destroy$))
      .subscribe(conflict => {
        if (conflict) {
          console.log('Conflict detected:', conflict);
        } else {
          console.log('No conflict - time slot is available');
        }
        this.bookingConflict$.next(conflict);
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
        this.availabilityCountdown$.next(countdownText);
      });
    } else {
      this.availabilityCountdown$.next(null);
    }
  }

  public formatTime(dateString: string): string {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  public isSubmitDisabled(): boolean {
    // Check if currently submitting
    if (this.isSubmitting) {
      return true;
    }

    // Check if form is invalid
    if (this.form.invalid) {
      return true;
    }

    // Check if there's a booking conflict
    const conflict = this.bookingConflict$.getValue();
    if (conflict !== null) {
      return true;
    }

    // Check if required fields are filled
    const formValue = this.form.getRawValue();
    if (!formValue.roomId || !formValue.startTime || !formValue.endTime || !formValue.name) {
      return true;
    }

    return false;
  }

  onSubmit(): void {
    if (this.isSubmitDisabled()) {
      console.warn('Form submission blocked: form is invalid or has conflicts');
      return;
    }

    const formValue = this.form.getRawValue();

    // Type guard to ensure roomId is not null
    if (!formValue.roomId) {
      console.error('Cannot submit: roomId is null');
      return;
    }

    // UX VALIDATION: Prevent booking meetings that are entirely in the past
    // Parse the end time and check if it's before now
    const dateStr = formValue.date.toISOString().split('T')[0];
    const endTimeStr = formValue.endTime;
    const [endHours, endMinutes] = endTimeStr.split(':').map(Number);

    const endDateTime = new Date(dateStr);
    endDateTime.setHours(endHours, endMinutes, 0, 0);

    const now = new Date();

    if (endDateTime <= now) {
      console.warn('Booking rejected: End time is in the past', {
        endDateTime: endDateTime.toISOString(),
        now: now.toISOString()
      });

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
      startTime: formValue.startTime,
      endTime: formValue.endTime,
      date: formValue.date.toISOString().split('T')[0],
      comment: formValue.comment || undefined,
    };

    console.log('Submitting booking payload:', payload);
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

    console.log(`\n=== BUILDING BOOKING BLOCK TIMELINE ===`);
    console.log(`Starting with booking:`, {
      id: currentBooking.id,
      booker: currentBooking.name,
      start: new Date(currentBooking.start_time).toLocaleTimeString('de-DE'),
      end: new Date(currentBooking.end_time).toLocaleTimeString('de-DE')
    });

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
          console.log(`✓ Found consecutive booking:`, {
            id: booking.id,
            booker: booking.name,
            start: bookingStart.toLocaleTimeString('de-DE'),
            end: bookingEnd.toLocaleTimeString('de-DE')
          });

          blockBookings.push(booking);
          currentEnd = bookingEnd;
          foundConsecutive = true;
          break;
        }
      }
    }

    console.log(`✓ Block contains ${blockBookings.length} consecutive bookings`);
    console.log(`Block runs from ${new Date(blockBookings[0].start_time).toLocaleTimeString('de-DE')} to ${new Date(blockBookings[blockBookings.length - 1].end_time).toLocaleTimeString('de-DE')}`);
    console.log(`=== END BUILDING BOOKING BLOCK TIMELINE ===\n`);

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

    const bookings = this.dayBookings$.getValue();

    console.log('\n=== CALCULATING LIVE STATUS BANNER ===');
    console.log('Current time:', now.toISOString());
    console.log('Bookings for today:', bookings.length);

    // Find current booking (room is occupied right now)
    const currentBooking = bookings.find(booking => {
      const start = new Date(booking.start_time);
      const end = new Date(booking.end_time);
      return start <= now && end > now;
    });

    if (currentBooking) {
      // Room is currently booked! Build the complete timeline
      const blockBookings = this.findBookingBlock(currentBooking, bookings);
      const blockStartTime = new Date(blockBookings[0].start_time);
      const blockEndTime = new Date(blockBookings[blockBookings.length - 1].end_time);

      // Calculate total block duration in minutes
      const totalBlockMinutes = Math.floor((blockEndTime.getTime() - blockStartTime.getTime()) / 60000);

      console.log(`\n=== BUILDING TIMELINE SEGMENTS ===`);
      console.log(`Total block duration: ${totalBlockMinutes} minutes`);

      // Build timeline segments with proportional widths
      const timelineSegments: TimelineSegment[] = blockBookings.map(booking => {
        const start = new Date(booking.start_time);
        const end = new Date(booking.end_time);
        const durationMinutes = Math.floor((end.getTime() - start.getTime()) / 60000);
        const widthPercent = (durationMinutes / totalBlockMinutes) * 100;

        console.log(`Segment: ${booking.name} (${durationMinutes} min, ${widthPercent.toFixed(1)}%)`);

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
        return now >= segment.startTime && now < segment.endTime;
      });

      console.log(`Current segment index: ${currentSegmentIndex}`);

      // Calculate progress of current segment (0-100%)
      let currentSegmentProgress = 0;
      if (currentSegmentIndex >= 0) {
        const currentSegment = timelineSegments[currentSegmentIndex];
        const segmentDurationMs = currentSegment.endTime.getTime() - currentSegment.startTime.getTime();
        const elapsedMs = now.getTime() - currentSegment.startTime.getTime();
        currentSegmentProgress = Math.min(100, Math.max(0, (elapsedMs / segmentDurationMs) * 100));
        console.log(`Current segment progress: ${currentSegmentProgress.toFixed(1)}%`);
      }

      console.log(`=== END BUILDING TIMELINE SEGMENTS ===\n`);

      // Find next booking after the block ends
      const nextBooking = bookings
        .filter(b => new Date(b.start_time) >= blockEndTime)
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

      console.log('✓ Room is currently booked with timeline:', status);

      this.liveStatus.set(status);
      this.startLiveCountdown();
      return;
    }

    // Room is not currently booked
    console.log('⚠️ Room is currently available (no banner needed)');
    this.liveStatus.set({ type: null });
    this.stopLiveCountdown();
    console.log('=== END CALCULATING LIVE STATUS BANNER ===\n');
  }

  /**
   * TIMELINE: Starts the live countdown timer for the current segment.
   * Updates every second, showing countdown for active meeting and progress.
   */
  private startLiveCountdown(): void {
    // Clear any existing timer
    this.stopLiveCountdown();

    console.log('▶️ Starting live timeline countdown');

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
      console.log('⏸️ Stopped live timeline countdown');
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

    // Check if current segment has ended
    if (now >= currentSegment.endTime) {
      console.log('⏱️ Current segment ended - recalculating timeline');
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
    this.bookingConflict$.next(null);

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
        const tomorrowFormatted = tomorrow.toLocaleDateString('de-DE', {
          weekday: 'long',
          day: '2-digit',
          month: 'long'
        });

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

      // Start from current time if today, otherwise from 8:00
      let searchTime: Date;
      if (isToday) {
        searchTime = new Date(now);
        // Round up to next 15-minute interval
        const minutes = searchTime.getMinutes();
        const roundedMinutes = Math.ceil(minutes / 15) * 15;
        searchTime.setMinutes(roundedMinutes, 0, 0);
      } else {
        searchTime = new Date(date);
        searchTime.setHours(8, 0, 0, 0);
      }

      const endOfDay = new Date(date);
      endOfDay.setHours(20, 0, 0, 0);

      const duration = 30; // 30 minutes

      // Search for the next free slot
      while (searchTime < endOfDay) {
        const endTime = new Date(searchTime.getTime() + duration * 60000);

        // Check if end time is within business hours
        if (endTime > endOfDay) {
          break;
        }

        // Check if this slot overlaps with any booking
        const hasConflict = bookings.some(booking => {
          const bookingStart = new Date(booking.start_time);
          const bookingEnd = new Date(booking.end_time);
          return (searchTime < bookingEnd && endTime > bookingStart);
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
      console.error('Error searching for slot:', error);
      return null;
    }
  }

  private fillSlotAndFocus(slot: { startTime: string; endTime: string }): void {
    console.log(`Filling slot: ${slot.startTime} - ${slot.endTime}`);

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