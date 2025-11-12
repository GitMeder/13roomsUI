import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatTabsModule,
    MatIconModule
  ],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.css',
})
export class AdminLayoutComponent {
  readonly navLinks = [
    {
      path: '/admin/bookings',
      label: 'Buchungsverwaltung',
      icon: 'event'
    },
    {
      path: '/admin/rooms',
      label: 'Raumverwaltung',
      icon: 'meeting_room'
    },
    {
      path: '/admin/users',
      label: 'Benutzerverwaltung',
      icon: 'people'
    }
  ];
}
