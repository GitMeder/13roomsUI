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
  public suggestedSlots: { startTime: string; endTime: string }[] = [];
  public selectedSlotIndex: number | null = null;

  // UI State
  public readonly isSearchingSlot = signal<boolean>(false);

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
    // Dieser Input setzt den initialen Zustand SOFORT!
    this.bookingConflict$.next(conflict);
    this.updateCountdown(conflict);
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
  }

  private loadDayBookings(roomId: number, date: Date): void {
    const dateStr = date.toISOString().split('T')[0];
    console.log(`Loading bookings for room ${roomId} on ${dateStr}`);

    this.apiService.getRoomBookings(roomId, dateStr)
      .pipe(takeUntil(this.destroy$))
      .subscribe(bookings => {
        console.log(`Loaded ${bookings.length} bookings for the day:`, bookings);
        this.dayBookings$.next(bookings);
        this.calculateAvailableTimes(bookings, date);
      });
  }

  private calculateAvailableTimes(bookings: Booking[], selectedDate: Date): void {
    const now = new Date();
    const isToday = selectedDate.toDateString() === now.toDateString();

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

    // Filter out past times if today
    let availableSlots = allSlots;
    if (isToday) {
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      availableSlots = allSlots.filter(time => time > currentTime);
    }

    // Filter out booked times
    this.availableStartTimes = availableSlots.filter(time => {
      return !this.isTimeBlocked(time, bookings, selectedDate);
    });

    console.log(`Available start times: ${this.availableStartTimes.length}`);

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
    const now = new Date();
    const isToday = selectedDate.toDateString() === now.toDateString();

    // Start from current time if today, otherwise from 8:00
    let searchTime: Date;
    if (isToday) {
      searchTime = new Date(now);
      // Round up to next 15-minute interval
      const minutes = searchTime.getMinutes();
      const roundedMinutes = Math.ceil(minutes / 15) * 15;
      searchTime.setMinutes(roundedMinutes, 0, 0);
    } else {
      searchTime = new Date(selectedDate);
      searchTime.setHours(8, 0, 0, 0);
    }

    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(20, 0, 0, 0);

    const duration = 30; // 30 minutes
    const maxSuggestions = 4; // Find up to 4 slots
    const foundSlots: { startTime: string; endTime: string }[] = [];

    // Search for available slots
    while (searchTime < endOfDay && foundSlots.length < maxSuggestions) {
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
        foundSlots.push({
          startTime: `${searchTime.getHours().toString().padStart(2, '0')}:${searchTime.getMinutes().toString().padStart(2, '0')}`,
          endTime: `${endTime.getHours().toString().padStart(2, '0')}:${endTime.getMinutes().toString().padStart(2, '0')}`
        });
      }

      // Move to next 15-minute interval
      searchTime = new Date(searchTime.getTime() + 15 * 60000);
    }

    this.suggestedSlots = foundSlots;
    console.log(`Found ${foundSlots.length} suggested slots:`, foundSlots);

    // AUTOMATIC PRE-SELECTION: Fill the first available slot
    if (foundSlots.length > 0) {
      this.selectSlot(0);
    } else {
      // No slots available - clear selection
      this.selectedSlotIndex = null;
      console.log('No available slots found for this date');
    }
  }

  /**
   * Selects a suggested slot by index.
   * Called when user clicks on a suggestion chip.
   */
  public selectSlot(index: number): void {
    if (index < 0 || index >= this.suggestedSlots.length) {
      return;
    }

    const slot = this.suggestedSlots[index];
    this.selectedSlotIndex = index;

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
  }
  
  private checkConflict(): void {
    const formValue = this.form.getRawValue();
    const { roomId, date, startTime, endTime } = formValue;

    if (!roomId || !date || !startTime || !endTime) {
      this.bookingConflict$.next(null);
      this.updateCountdown(null);
      return;
    }
    const formattedDate = date.toISOString().split('T')[0];

    this.apiService.checkBookingConflict(roomId, formattedDate, startTime, endTime)
      .pipe(takeUntil(this.destroy$))
      .subscribe(conflict => {
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