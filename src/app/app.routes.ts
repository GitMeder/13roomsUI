import { Routes } from '@angular/router';
import { DashboardPageComponent } from './pages/dashboard/dashboard.page';
import { BookingsPageComponent } from './pages/bookings/bookings.page';
import { RoomFormComponent } from './components/room-form/room-form.component';
import { bookingPageDataResolver } from './resolvers/booking-page-data.resolver';
import { LoginPageComponent } from './pages/auth/login.page';
import { RegisterPageComponent } from './pages/auth/register.page';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
import { RoomEditPageComponent } from './pages/room-edit/room-edit.page';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginPageComponent,
    title: '13Rooms · Anmelden'
  },
  {
    path: 'register',
    component: RegisterPageComponent,
    title: '13Rooms · Registrieren'
  },
  {
    path: '',
    component: DashboardPageComponent,
    title: '13Rooms · Dashboard'
  },
  {
    path: 'bookings',
    component: BookingsPageComponent,
    title: '13Rooms · Neue Buchung'
  },
  {
    path: 'bookings/:roomId',
    component: BookingsPageComponent,
    title: '13Rooms · Neue Buchung',
    resolve: {
      pageData: bookingPageDataResolver
    }
  },
  {
    path: 'rooms/new',
    canActivate: [authGuard, adminGuard],
    component: RoomFormComponent,
    title: '13Rooms · Neues Zimmer'
  },
  {
    path: 'rooms/:id/edit',
    canActivate: [authGuard, adminGuard],
    component: RoomEditPageComponent,
    title: '13Rooms · Raum bearbeiten'
  }
];
