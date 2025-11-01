import { inject } from '@angular/core';
import { ResolveFn, Router } from '@angular/router';
import { ApiService } from '../services/api.service';
import { map } from 'rxjs/operators';

export const bookingPageDataResolver: ResolveFn<any> = (route, state) => {
  const router = inject(Router);
  const apiService = inject(ApiService);
  const roomId = Number(route.paramMap.get('roomId'));

  // CRITICAL: Get navigation state HERE, inside the resolver.
  const navigation = router.getCurrentNavigation();
  const navState = navigation?.extras?.state;
  const prefillData = (navState && navState['isSmartRebooking']) ? navState['prefillData'] : null;
  const isSmartRebooking = !!prefillData;

  console.log('[Resolver] Running for roomId:', roomId);
  console.log('[Resolver] Detected isSmartRebooking:', isSmartRebooking);
  console.log('[Resolver] Detected prefillData:', prefillData);

  return apiService.getBookingPageData(roomId).pipe(
    map(apiData => ({
      ...apiData,
      isSmartRebooking,
      prefillData
    }))
  );
};
