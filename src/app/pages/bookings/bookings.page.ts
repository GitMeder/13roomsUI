import { Component, OnInit, inject, signal } from '@angular/core';
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
import { BookingFormComponent } from '../../components/booking-form/booking-form.component';

@Component({
  selector: 'app-bookings-page',
  standalone: true,
  imports: [CommonModule, BookingFormComponent, MatCardModule, MatProgressSpinnerModule, MatIconModule, MatButtonModule, RouterModule, MatSnackBarModule],
  templateUrl: './bookings.page.html',
  styleUrls: ['./bookings.page.css'],
})
export class BookingsPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly apiService = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);

  readonly isSubmitting = signal<boolean>(false);

  // Observable for the page data
  pageData$!: Observable<{ room: Room | null; conflict: Booking | null; suggestedStartTime: string | null; suggestedEndTime: string | null }>;

  ngOnInit(): void {
    this.pageData$ = this.route.paramMap.pipe(
      switchMap(params => {
        const roomId = Number(params.get('roomId'));
        if (roomId) {
          return this.apiService.getBookingPageData(roomId).pipe(
            map(data => {
              // Calculate suggested time slots if room is available
              if (data.room && !data.conflict) {
                const { suggestedStartTime, suggestedEndTime } = this.calculateSuggestedTimes();
                return { ...data, suggestedStartTime, suggestedEndTime };
              }
              return { ...data, suggestedStartTime: null, suggestedEndTime: null };
            })
          );
        }
        // Handle case where ID is missing or invalid
        return of({ room: null, conflict: null, suggestedStartTime: null, suggestedEndTime: null });
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
          verticalPosition: 'top',
          panelClass: ['success-snackbar']
        });

        // Navigate back to dashboard after a short delay
        setTimeout(() => {
          this.router.navigate(['/']);
        }, 500);
      },
      error: (error) => {
        console.error('Error creating booking:', error);
        this.isSubmitting.set(false);

        // Show error notification
        this.snackBar.open('Fehler beim Erstellen der Buchung. Bitte versuchen Sie es erneut.', 'OK', {
          duration: 5000,
          horizontalPosition: 'center',
          verticalPosition: 'top',
          panelClass: ['error-snackbar']
        });
      }
    });
  }
}