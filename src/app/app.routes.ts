import { Routes } from '@angular/router';
import { DashboardPageComponent } from './pages/dashboard/dashboard.page';
import { BookingsPageComponent } from './pages/bookings/bookings.page';

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
    path: '**',
    redirectTo: ''
  }
];
