import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const user = authService.currentUserSnapshot;

  if (user?.role === 'admin') {
    return true;
  }

  router.navigate(['/'], {
    queryParams: user ? {} : { redirect: state.url }
  });

  return false;
};
