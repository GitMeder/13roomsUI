import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatListModule, MatSelectionListChange } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Room } from '../../models/room.model';

export interface RoomSelectionDialogData {
  rooms: Room[];
}

/**
 * PHASE 3+: Smart Recovery Enhancement
 * Dialog for selecting an alternative room when multiple options are available.
 */
@Component({
  selector: 'app-room-selection-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatListModule, MatIconModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>meeting_room</mat-icon>
      Verfügbare Räume
    </h2>
    <mat-dialog-content>
      <p class="dialog-subtitle">Wählen Sie einen alternativen Raum für Ihre Buchung:</p>
      <mat-selection-list [multiple]="false" (selectionChange)="onRoomSelected($event)" class="room-selection-list">
        @for (room of data.rooms; track room.id) {
          <mat-list-option [value]="room" class="room-option">
            <div class="room-details">
              <div class="room-header">
                <mat-icon class="room-icon">{{ room.icon || 'meeting_room' }}</mat-icon>
                <span class="room-name">{{ room.name }}</span>
              </div>
              <div class="room-meta">
                <span class="meta-item">
                  <mat-icon>group</mat-icon>
                  {{ room.capacity }} Personen
                </span>
                @if (room.location) {
                  <span class="meta-item">
                    <mat-icon>location_on</mat-icon>
                    {{ room.location }}
                  </span>
                }
              </div>
              @if (room.amenities && room.amenities.length > 0) {
                <div class="room-amenities">
                  @for (amenity of room.amenities; track amenity) {
                    <span class="amenity-chip">{{ amenity }}</span>
                  }
                </div>
              }
            </div>
          </mat-list-option>
        }
      </mat-selection-list>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onNoClick()">Abbrechen</button>
    </mat-dialog-actions>
  `,
  styles: [`
    :host {
      display: block;
    }

    h2 {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin: 0;
      color: var(--mat-sys-on-surface);
      font-size: 1.5rem;
      font-weight: 500;
    }

    h2 mat-icon {
      color: var(--mat-sys-primary);
      font-size: 28px;
      width: 28px;
      height: 28px;
    }

    .dialog-subtitle {
      margin: 0 0 1.5rem 0;
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.875rem;
      line-height: 1.5;
    }

    mat-dialog-content {
      min-width: 500px;
      max-width: 650px;
      padding: 1.5rem;
      overflow-y: auto;
      max-height: 70vh;
    }

    .room-selection-list {
      padding: 0 !important;
    }

    mat-list-option.room-option {
      height: auto !important;
      margin-bottom: 0.75rem;
      border: 2px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      transition: all 0.2s ease-in-out;
      background-color: var(--mat-sys-surface);
      padding: 1rem !important;
    }

    mat-list-option.room-option:hover {
      border-color: var(--mat-sys-primary);
      background-color: var(--mat-sys-surface-container-low);
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
      cursor: pointer;
    }

    mat-list-option.room-option.mdc-list-item--selected {
      border-color: var(--mat-sys-primary);
      background-color: rgba(var(--mat-sys-primary-rgb, 103, 80, 164), 0.08);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
    }

    .room-details {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      width: 100%;
    }

    .room-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .room-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
      color: var(--mat-sys-primary);
    }

    .room-name {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--mat-sys-on-surface);
      letter-spacing: 0.01em;
    }

    .room-meta {
      display: flex;
      align-items: center;
      gap: 1.5rem;
      flex-wrap: wrap;
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
      font-weight: 500;
    }

    .meta-item mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: var(--mat-sys-on-surface-variant);
    }

    .room-amenities {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .amenity-chip {
      display: inline-block;
      padding: 0.375rem 0.75rem;
      background-color: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface);
      border-radius: 16px;
      font-size: 0.75rem;
      font-weight: 500;
      letter-spacing: 0.02em;
      border: 1px solid var(--mat-sys-outline-variant);
    }

    mat-dialog-actions {
      padding: 1rem 1.5rem;
      gap: 0.75rem;
      border-top: 1px solid var(--mat-sys-outline-variant);
      margin: 0;
    }

    mat-dialog-actions button {
      min-width: 120px;
      font-weight: 500;
      letter-spacing: 0.02em;
    }

    /* Hide checkbox/selection indicator for cleaner look */
    ::ng-deep mat-list-option.room-option .mdc-list-item__start {
      display: none;
    }

    /* Improve accessibility */
    mat-list-option.room-option:focus-within {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 2px;
    }

    /* Responsive design */
    @media (max-width: 600px) {
      mat-dialog-content {
        min-width: 300px;
        padding: 1rem;
      }

      .room-details {
        margin-left: 1.5rem;
      }

      .room-meta {
        gap: 1rem;
      }
    }
  `]
})
export class RoomSelectionDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<RoomSelectionDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: RoomSelectionDialogData
  ) {}

  onRoomSelected(event: MatSelectionListChange): void {
    const selectedRoom = event.options[0]?.value;
    if (selectedRoom) {
      this.dialogRef.close(selectedRoom);
    }
  }

  onNoClick(): void {
    this.dialogRef.close();
  }
}
