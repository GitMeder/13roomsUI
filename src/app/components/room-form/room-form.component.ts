import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-room-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    MatChipsModule,
    MatTooltipModule
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
  amenities: string[] = [];

  readonly iconOptions = [
    { value: 'home', label: 'Familientreff' },
    { value: 'groups', label: 'Gemeinschaftsraum' },
    { value: 'favorite', label: 'Eltern-Kind-Bereich' },
    { value: 'sports_esports', label: 'Spiel & Begegnung' },
    { value: 'library_books', label: 'Lernzimmer' },
    { value: 'public', label: 'International' }
  ];

  readonly amenityOptions: string[] = [
    'Kinderspiele & Bastelmaterial',
    'Elternberatung',
    'Sprachunterstützung',
    'Multikulturelle Bibliothek',
    'Barrierefreier Zugang',
    'Ruhe- & Stillbereich',
    'Gemeinsamer Essensbereich',
    'Laptop & Tablets',
    'Flexible Sitzmöglichkeiten',
    'Outdoor-Spielplatz-Zugang'
  ];

  constructor() {
    console.log('RoomFormComponent constructor called.');
  }

  ngOnInit(): void {
    this.roomForm = this.fb.group({
      name: ['', Validators.required],
      capacity: [null, [Validators.required, Validators.min(1)]],
      location: [''],
      icon: ['home', Validators.required]
    });
  }

  selectIcon(iconValue: string): void {
    this.roomForm.patchValue({ icon: iconValue });
  }

  isIconSelected(iconValue: string): boolean {
    return this.roomForm.get('icon')?.value === iconValue;
  }

  toggleAmenity(amenity: string): void {
    if (this.amenities.includes(amenity)) {
      this.amenities = this.amenities.filter(item => item !== amenity);
    } else {
      this.amenities = [...this.amenities, amenity];
    }
  }

  isAmenitySelected(amenity: string): boolean {
    return this.amenities.includes(amenity);
  }

  addCustomAmenity(): void {
    const value = (this.amenitiesCtrl.value || '').trim();
    if (value && !this.amenities.includes(value)) {
      this.amenities = [...this.amenities, value];
    }
    this.amenitiesCtrl.reset('');
  }

  removeAmenity(amenity: string): void {
    this.amenities = this.amenities.filter(item => item !== amenity);
  }

  onSubmit(): void {
    console.log('onSubmit called');
    if (this.roomForm.valid) {
      const { name, capacity, location, icon } = this.roomForm.value;
      const sanitizedLocation = location?.trim();
      const payload = {
        name: name?.trim(),
        capacity: Number(capacity),
        status: 'active',
        location: sanitizedLocation || null,
        icon,
        amenities: this.amenities
      };

      console.log('Form is valid. Submitting with data:', payload);
      this.apiService.createRoom(payload).subscribe({
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
