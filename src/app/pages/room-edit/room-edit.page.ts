import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, switchMap, takeUntil } from 'rxjs';
import { ApiService, UpdateRoomPayload } from '../../services/api.service';
import { Room } from '../../models/room.model';
import { Location } from '@angular/common';

@Component({
  selector: 'app-room-edit-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatChipsModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './room-edit.page.html',
  styleUrl: './room-edit.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomEditPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly apiService = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroy$ = new Subject<void>();
  private readonly location = inject(Location);

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly loadError = signal<string | null>(null);

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

  readonly form: FormGroup = this.fb.group({
    name: ['', Validators.required],
    capacity: [1, [Validators.required, Validators.min(1)]],
    status: ['active', Validators.required],
    location: [''],
    icon: ['home', Validators.required],
    customAmenity: ['']
  });

  amenities: string[] = [];
  roomId!: number;

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        takeUntil(this.destroy$),
        switchMap(params => {
          const idParam = params.get('id');
          if (!idParam) {
            this.loadError.set('Raum konnte nicht geladen werden.');
            this.isLoading.set(false);
            throw new Error('Missing room id');
          }
          this.roomId = Number(idParam);
          this.isLoading.set(true);
          this.loadError.set(null);
          return this.apiService.getRoom(this.roomId);
        })
      )
      .subscribe({
        next: room => this.populateForm(room),
        error: error => {
          this.loadError.set('Raum konnte nicht geladen werden. Bitte versuchen Sie es erneut.');
          this.isLoading.set(false);
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private populateForm(room: Room): void {
    this.form.patchValue({
      name: room.name,
      capacity: room.capacity,
      status: this.mapUiStatusToInternal(room.statusRaw ?? room.status),
      location: room.location ?? '',
      icon: room.icon ?? 'home',
      customAmenity: ''
    });
    this.amenities = Array.isArray(room.amenities) ? [...room.amenities] : [];
    this.isLoading.set(false);
  }

  selectIcon(iconValue: string): void {
    this.form.patchValue({ icon: iconValue });
  }

  isIconSelected(iconValue: string): boolean {
    return this.form.get('icon')?.value === iconValue;
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
    const value = this.form.get('customAmenity')?.value?.trim();
    if (value && !this.amenities.includes(value)) {
      this.amenities = [...this.amenities, value];
    }
    this.form.patchValue({ customAmenity: '' });
  }

  removeAmenity(amenity: string): void {
    this.amenities = this.amenities.filter(item => item !== amenity);
  }

  save(): void {
    if (this.form.invalid || !this.roomId) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, capacity, status, location, icon } = this.form.value;
    const payload: UpdateRoomPayload = {
      name: name?.trim(),
      capacity: Number(capacity),
      status,
      location: location?.trim() || null,
      icon,
      amenities: this.amenities
    };

    this.isSaving.set(true);
    this.apiService.updateRoom(this.roomId, payload).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.snackBar.open('Raum wurde aktualisiert.', 'OK', { duration: 2500 });
        this.location.back();
      },
      error: error => {
        this.isSaving.set(false);
        this.snackBar.open('Aktualisierung fehlgeschlagen. Bitte erneut versuchen.', 'OK', { duration: 3500 });
      }
    });
  }

  cancel(): void {
    void this.router.navigate(['/']);
  }

  private mapUiStatusToInternal(status?: string | null): 'active' | 'inactive' | 'maintenance' {
    const normalized = status?.toLowerCase();
    switch (normalized) {
      case 'maintenance':
        return 'maintenance';
      case 'inactive':
      case 'occupied':
        return 'inactive';
      default:
        return 'active';
    }
  }
}
