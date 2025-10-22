import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgClass, NgFor, SlicePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { Room } from '../../services/api.service';

@Component({
  selector: 'app-room-card',
  standalone: true,
  imports: [MatCardModule, MatIconModule, MatChipsModule, NgClass, NgFor, SlicePipe],
  templateUrl: './room-card.component.html',
  styleUrls: ['./room-card.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomCardComponent {
  @Input({ required: true }) room!: Room;

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
}
