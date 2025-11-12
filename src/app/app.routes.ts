import { Routes } from '@angular/router';
import { DashboardPageComponent } from './pages/dashboard/dashboard.page';
import { BookingsPageComponent } from './pages/bookings/bookings.page';
import { RoomFormComponent } from './components/room-form/room-form.component';
import { bookingPageDataResolver } from './resolvers/booking-page-data.resolver';
import { LoginPageComponent } from './pages/auth/login.page';
import { RegisterPageComponent } from './pages/auth/register.page';
import { MyBookingsPageComponent } from './pages/my-bookings/my-bookings.page';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
import { RoomEditPageComponent } from './pages/room-edit/room-edit.page';
import { AdminLayoutComponent } from './pages/admin-layout/admin-layout.component';
import { AdminBookingsComponent } from './pages/admin-bookings/admin-bookings.component';
import { AdminRoomsComponent } from './pages/admin-rooms/admin-rooms.component';
import { AdminUsersComponent } from './pages/admin-users/admin-users.component';

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
    path: 'my-bookings',
    canActivate: [authGuard],
    component: MyBookingsPageComponent,
    title: '13Rooms · Meine Buchungen'
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
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
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
        path: '',
        redirectTo: 'bookings',
        pathMatch: 'full'
      }
    ]
  }
];
