import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { NgClass, NgFor, NgIf, SlicePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Room } from '../../models/room.model'; // Updated import
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
  @Input({ required: true }) statusInfo!: { text: string; cssClass: string }; // New Input
  @Output() deleteRoomEvent = new EventEmitter<number>();
  @Output() cardClick = new EventEmitter<number>();

  private readonly dialog = inject(MatDialog);

  onDelete(event: Event): void {
    event.stopPropagation(); // Prevent card click event from firing
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

  onCardClick(): void {
    if (this.room && this.room.id) {
      this.cardClick.emit(this.room.id);
    }
  }
}
