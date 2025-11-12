import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models/enums';

export const adminGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const user = authService.currentUser();

  if (user?.role === UserRole.ADMIN) {
    return true;
  }

  router.navigate(['/'], {
    queryParams: user.role !== UserRole.GUEST ? {} : { redirect: state.url }
  });

  return false;
};
