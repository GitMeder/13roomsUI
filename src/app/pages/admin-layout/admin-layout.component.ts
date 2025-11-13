import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatTabsModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule
  ],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminLayoutComponent {
  /**
   * Primary management navigation links displayed in the tab bar
   * These represent the core management sections of the admin dashboard
   */
  readonly managementNavLinks = [
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
