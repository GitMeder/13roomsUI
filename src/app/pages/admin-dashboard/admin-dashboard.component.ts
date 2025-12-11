import { Component, signal } from '@angular/core';
import { fakerDE as faker } from '@faker-js/faker';
import { ApiService } from '../../services/api.service';
import { ErrorHandlingService } from '../../core/services/error-handling.service';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { from } from 'rxjs';
import { concatMap, delay, toArray, tap } from 'rxjs/operators';
import { Room } from '../../models/room.model';

// Helper function (can be inside or outside the class)
function getRandomItem<T>(arr: T[]): T {
  if (arr.length === 0) {
    throw new Error("Cannot get a random item from an empty array.");
  }
  return arr[Math.floor(Math.random() * arr.length)];
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule
  ],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.scss']
})
export class AdminDashboardComponent {
  isSeeding = signal(false);

  constructor(
    private apiService: ApiService,
    private errorHandler: ErrorHandlingService
  ) {}

  async runSeed(numRoomsStr: string, numBookingsStr: string) {
    const numRooms = parseInt(numRoomsStr, 10);
    const numBookings = parseInt(numBookingsStr, 10);

    if (isNaN(numRooms) || isNaN(numBookings) || numRooms <= 0) {
      this.errorHandler.showError('Please enter valid, positive numbers.');
      return;
    }

    this.isSeeding.set(true);

    try {
      console.log(`--- STARTING SEED: ${numRooms} rooms, ${numBookings} bookings ---`);

      // --- STEP 1: CREATE ROOMS SEQUENTIALLY WITH CORRECT DELAY ---
      const roomPayloads = Array.from({ length: numRooms }, () => ({
        name: faker.commerce.productName() + ' Room',
        capacity: faker.number.int({ min: 4, max: 50 }),
        amenities: faker.helpers.arrayElements(['Projector', 'Whiteboard', 'Coffee Machine'], { min: 1, max: 3 }),
        status: 'active',
        icon: 'meeting_room'
      }));

      console.log('Seeding rooms...');
      const createdRooms = await from(roomPayloads).pipe(
        // For each payload, create an observable that emits the payload then waits.
        concatMap(payload => from([payload]).pipe(delay(100))), 
        // Now, map the delayed payload to the API call.
        concatMap(payload => 
          this.apiService.createRoom(payload).pipe(
            tap(room => console.log(`Room '${room.name}' created.`))
          )
        ),
        toArray()
      ).toPromise() as Room[];
      
      console.log(`${createdRooms.length} rooms seeded successfully.`);
      const roomIds = createdRooms.map(room => room!.id);
      if (roomIds.length === 0) throw new Error("No rooms were created to seed bookings into.");

      // --- STEP 2: CREATE BOOKINGS SEQUENTIALLY WITH CORRECT DELAY ---
      const bookingPayloads = Array.from({ length: numBookings }, () => {
          // ... (faker logic for bookings remains the same)
          const startDate = faker.date.soon({ days: 7 });
          startDate.setHours(faker.number.int({ min: 8, max: 18 }));
          startDate.setMinutes(getRandomItem([0, 15, 30, 45]));
          const duration = getRandomItem([30, 60, 90]);
          const endDate = new Date(startDate.getTime() + duration * 60000);
          return {
            roomId: getRandomItem(roomIds),
            title: faker.lorem.words(3),
            date: startDate.toISOString().split('T')[0],
            startTime: `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`,
            endTime: `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`,
          };
      });
      
      console.log('Seeding bookings...');
      await from(bookingPayloads).pipe(
        // Same corrected pattern: emit, wait, then call API.
        concatMap(payload => from([payload]).pipe(delay(50))),
        concatMap((payload, index) => 
          this.apiService.createBooking(payload).pipe(
            tap(() => console.log(`Booking ${index + 1}/${numBookings} created.`))
          )
        ),
        toArray()
      ).toPromise();
      
      console.log(`${numBookings} bookings seeded successfully.`);
      this.errorHandler.showSuccess('Database seeding complete!');

    } catch (error) {
      console.error("Seeding failed:", error);
      this.errorHandler.showError('Seeding failed. Check console for details.');
    } finally {
      this.isSeeding.set(false);
    }
  }
}
