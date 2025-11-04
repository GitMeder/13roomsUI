import { ApplicationConfig, LOCALE_ID } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { MAT_DATE_LOCALE } from '@angular/material/core';

import { routes } from './app.routes';
import { authInterceptor } from './services/auth.interceptor';

// Register German locale data for Angular's DatePipe and other locale-dependent features
registerLocaleData(localeDe, 'de-DE');

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimations(),
    // Set German as the default locale for the entire application
    { provide: LOCALE_ID, useValue: 'de-DE' },
    // Set German locale specifically for Material DatePicker
    { provide: MAT_DATE_LOCALE, useValue: 'de-DE' }
  ]
};
