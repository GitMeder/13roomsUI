import { Routes } from '@angular/router';
import { DashboardPageComponent } from './pages/dashboard/dashboard.page';
import { BookingsPageComponent } from './pages/bookings/bookings.page';
import { RoomFormComponent } from './components/room-form/room-form.component';

export const routes: Routes = [
  {
    path: '',
    component: DashboardPageComponent,
    title: '13rooms · Dashboard'
  },
  {
    path: 'bookings',
    component: BookingsPageComponent,
    title: '13rooms · Neue Buchung'
  },
  {
    path: 'bookings/:roomId',
    component: BookingsPageComponent,
    title: '13rooms · Neue Buchung'
  },
  {
    path: 'rooms/new',
    component: RoomFormComponent,
    title: '13rooms · Neues Zimmer'
  },
  {
    path: '**',
    redirectTo: ''
  }
];
