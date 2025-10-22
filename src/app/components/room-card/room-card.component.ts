import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { NgClass, NgFor, NgIf, SlicePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip'; // Import MatTooltipModule
import { Room } from '../../services/api.service';
import { ConfirmationDialogComponent } from '../confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-room-card',
  standalone: true,
  imports: [MatCardModule, MatIconModule, MatChipsModule, NgClass, NgFor, NgIf, SlicePipe, MatButtonModule, MatDialogModule, MatTooltipModule],
  templateUrl: './room-card.component.html',
  styleUrls: ['./room-card.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomCardComponent {
  @Input({ required: true }) room!: Room;
  @Output() deleteRoomEvent = new EventEmitter<number>();

  private readonly dialog = inject(MatDialog);

  get statusLabel(): string {
    if (!this.room) {
      return '';
    }
    switch (this.room.status) {
      case 'available':
        return 'Verfügbar';
      case 'occupied':
        return 'Belegt';
      case 'maintenance':
        return 'Wartung';
      default:
        return this.room.status;
    }
  }

  get statusClass(): string {
    if (!this.room) {
      return 'room-card__status';
    }
    return `room-card__status room-card__status--${this.room.status}`;
  }

  onDelete(): void {
    if (this.room && this.room.id) {
      const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
        data: { message: `Möchten Sie Raum '${this.room.name}' wirklich löschen?` }
      });

      dialogRef.afterClosed().subscribe(result => {
        if (result) {
          this.deleteRoomEvent.emit(this.room.id);
        }
      });
    }
  }
}
