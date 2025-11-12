import { inject } from '@angular/core';
import { ResolveFn, Router } from '@angular/router';
import { ApiService } from '../services/api.service';
import { map } from 'rxjs/operators';
import { BookingPageResolverData } from '../models/api-responses.model';

export const bookingPageDataResolver: ResolveFn<BookingPageResolverData> = (route, state) => {
  const router = inject(Router);
  const apiService = inject(ApiService);
  const roomId = Number(route.paramMap.get('roomId'));

  const navigation = router.getCurrentNavigation();
  const navState = navigation?.extras?.state;
  const prefillData = (navState && navState['isSmartRebooking']) ? navState['prefillData'] : null;
  const isSmartRebooking = !!prefillData;

  return apiService.getBookingPageData(roomId).pipe(
    map(apiData => ({
      ...apiData,
      isSmartRebooking,
      prefillData
    }))
  );
};
