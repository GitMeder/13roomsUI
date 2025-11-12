import { Routes } from '@angular/router';
import { AdminLayoutComponent } from '../admin-layout/admin-layout.component';
import { AdminBookingsComponent } from '../admin-bookings/admin-bookings.component';
import { AdminRoomsComponent } from '../admin-rooms/admin-rooms.component';
import { AdminUsersComponent } from '../admin-users/admin-users.component';
import { AdminLogComponent } from '../admin-log/admin-log.component';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    children: [
      {
        path: 'bookings',
        component: AdminBookingsComponent,
        title: '13Rooms · Buchungsverwaltung'
      },
      {
        path: 'rooms',
        component: AdminRoomsComponent,
        title: '13Rooms · Raumverwaltung'
      },
      {
        path: 'users',
        component: AdminUsersComponent,
        title: '13Rooms · Benutzerverwaltung'
      },
      {
        path: 'logs',
        component: AdminLogComponent,
        title: '13Rooms · Aktivitätsprotokoll'
      },
      {
        path: '',
        redirectTo: 'bookings',
        pathMatch: 'full'
      }
    ]
  }
];
