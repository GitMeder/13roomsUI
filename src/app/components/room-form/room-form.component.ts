import { Component, OnInit, ViewChild, ElementRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { MatChipsModule, MatChipInputEvent } from '@angular/material/chips';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';

@Component({
  selector: 'app-room-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    MatChipsModule,
    MatAutocompleteModule
  ],
  templateUrl: './room-form.component.html',
  styleUrl: './room-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly apiService = inject(ApiService);
  private readonly router = inject(Router);

  roomForm!: FormGroup;

  amenitiesCtrl = new FormControl('');
  filteredAmenities: Observable<string[]>;
  amenities: string[] = [];
  allAmenities: string[] = ['Whiteboard', 'Projektor', 'Videokonferenz', 'Bildschirm', 'Konferenztelefon', 'Höhenverstellbare Tische', 'Ruhezonen-Licht', 'USB-C Charging'];

  @ViewChild('amenityInput') amenityInput!: ElementRef<HTMLInputElement>;

  constructor() {
    console.log('RoomFormComponent constructor called.');
    this.filteredAmenities = this.amenitiesCtrl.valueChanges.pipe(
      startWith(null),
      map((amenity: string | null) => (amenity ? this._filter(amenity) : this.allAmenities.slice())),
    );
  }

  ngOnInit(): void {
    this.roomForm = this.fb.group({
      name: ['', Validators.required],
      capacity: [null, [Validators.required, Validators.min(1)]],
      status: ['Available', Validators.required],
      location: [''],
      icon: ['meeting_room']
    });
  }

  add(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();

    // Add our amenity
    if (value && !this.amenities.includes(value)) {
      this.amenities.push(value);
    }

    // Clear the input value
    event.chipInput!.clear();
    this.amenitiesCtrl.setValue(null);
  }

  remove(amenity: string): void {
    const index = this.amenities.indexOf(amenity);

    if (index >= 0) {
      this.amenities.splice(index, 1);
    }
  }

  selected(event: MatAutocompleteSelectedEvent): void {
    if (!this.amenities.includes(event.option.viewValue)) {
      this.amenities.push(event.option.viewValue);
    }
    this.amenityInput.nativeElement.value = '';
    this.amenitiesCtrl.setValue(null);
  }

  private _filter(value: string): string[] {
    const filterValue = value.toLowerCase();
    return this.allAmenities.filter(amenity => amenity.toLowerCase().includes(filterValue));
  }

  onSubmit(): void {
    console.log('onSubmit called');
    if (this.roomForm.valid) {
      const formData = { ...this.roomForm.value, amenities: this.amenities };
      console.log('Form is valid. Submitting with data:', formData);
      this.apiService.createRoom(formData).subscribe({
        next: (response) => {
          console.log('Room created successfully', response);
          this.router.navigate(['/']); // Navigate back to dashboard
        },
        error: (error) => {
          console.error('Error creating room', error);
          // Handle error, e.g., display a message to the user
        }
      });
    } else {
      console.log('Form is invalid. Cannot submit.');
    }
  }
}
