import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, throwError, of } from 'rxjs';

/**
 * Centralized error handling service.
 * This is the single source of truth for error handling across the application.
 *
 * Usage:
 * - Inject this service into components and services
 * - Use handleHttpError() in catchError() operators
 * - Use showError() for displaying custom error messages
 *
 * @example
 * ```typescript
 * this.apiService.getData().pipe(
 *   catchError(error => this.errorHandler.handleHttpError(error, 'Loading data'))
 * ).subscribe();
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class ErrorHandlingService {
  private readonly snackBar = inject(MatSnackBar);

  /**
   * Standard configuration for error snackbars
   */
  private readonly errorSnackBarConfig = {
    duration: 5000,
    horizontalPosition: 'center' as const,
    verticalPosition: 'bottom' as const,
    panelClass: ['error-snackbar']
  };

  /**
   * Standard configuration for success snackbars
   */
  private readonly successSnackBarConfig = {
    duration: 3000,
    horizontalPosition: 'center' as const,
    verticalPosition: 'bottom' as const,
    panelClass: ['success-snackbar']
  };

  /**
   * Standard configuration for warning snackbars
   */
  private readonly warningSnackBarConfig = {
    duration: 5000,
    horizontalPosition: 'center' as const,
    verticalPosition: 'bottom' as const,
    panelClass: ['warning-snackbar']
  };

  /**
   * Standard configuration for info snackbars
   */
  private readonly infoSnackBarConfig = {
    duration: 3000,
    horizontalPosition: 'center' as const,
    verticalPosition: 'bottom' as const,
    panelClass: ['info-snackbar']
  };

  /**
   * Handles HTTP errors in a consistent way across the application.
   *
   * This method:
   * 1. Logs the full error details to the console
   * 2. Extracts a user-friendly error message
   * 3. Displays an error snackbar
   * 4. Returns a throwError observable for the caller to handle
   *
   * @param error - The HTTP error response from Angular HttpClient
   * @param context - A brief description of what operation failed (e.g., "Loading rooms", "Creating booking")
   * @returns An observable that throws the error, allowing callers to handle it if needed
   */
  handleHttpError(error: HttpErrorResponse, context: string): Observable<never> {
    // Log the full error for debugging
    console.error(`[ErrorHandlingService] ${context} failed:`, {
      status: error.status,
      statusText: error.statusText,
      message: error.message,
      error: error.error,
      url: error.url
    });

    // Extract user-friendly error message
    const userMessage = this.extractErrorMessage(error, context);

    // Display error to user
    this.showError(userMessage);

    // Return throwError so the caller can handle the error if needed
    return throwError(() => error);
  }

  /**
   * Handles HTTP errors but returns null instead of throwing.
   * Useful for operations where you want to fail silently and return a fallback value.
   *
   * @param error - The HTTP error response
   * @param context - A brief description of what operation failed
   * @param fallbackValue - The value to return on error (default: null)
   * @returns An observable that emits the fallback value
   */
  handleHttpErrorSilently<T = null>(
    error: HttpErrorResponse,
    context: string,
    fallbackValue: T = null as T
  ): Observable<T> {
    // Log the full error for debugging
    console.error(`[ErrorHandlingService] ${context} failed (silent):`, {
      status: error.status,
      statusText: error.statusText,
      message: error.message,
      error: error.error,
      url: error.url
    });

    // Return fallback value instead of throwing
    return of(fallbackValue);
  }

  /**
   * Extracts a user-friendly error message from an HTTP error response.
   *
   * Priority order:
   * 1. error.error.message (backend error message)
   * 2. error.error.error (alternative backend error format)
   * 3. error.statusText (HTTP status text)
   * 4. Generic fallback message
   *
   * @param error - The HTTP error response
   * @param context - The operation context for fallback message
   * @returns A user-friendly error message in German
   */
  private extractErrorMessage(error: HttpErrorResponse, context: string): string {
    // Check for backend error message
    if (error.error?.message && typeof error.error.message === 'string') {
      return error.error.message;
    }

    // Check for alternative backend error format
    if (error.error?.error && typeof error.error.error === 'string') {
      return error.error.error;
    }

    // Check for status-specific messages
    switch (error.status) {
      case 0:
        return 'Verbindung zum Server fehlgeschlagen. Bitte überprüfen Sie Ihre Internetverbindung.';
      case 400:
        return 'Ungültige Anfrage. Bitte überprüfen Sie Ihre Eingaben.';
      case 401:
        return 'Nicht autorisiert. Bitte melden Sie sich an.';
      case 403:
        return 'Zugriff verweigert. Sie haben keine Berechtigung für diese Aktion.';
      case 404:
        return 'Die angeforderte Ressource wurde nicht gefunden.';
      case 409:
        return error.error?.message || 'Konflikt bei der Verarbeitung. Die Ressource ist bereits vorhanden oder blockiert.';
      case 422:
        return 'Die Eingabedaten konnten nicht verarbeitet werden.';
      case 500:
        return 'Serverfehler. Bitte versuchen Sie es später erneut.';
      case 503:
        return 'Service vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut.';
      default:
        return `Fehler beim ${context}. Bitte versuchen Sie es erneut.`;
    }
  }

  /**
   * Displays an error snackbar with consistent styling.
   *
   * @param message - The error message to display
   * @param action - The action button text (default: 'OK')
   */
  showError(message: string, action: string = 'OK'): void {
    this.snackBar.open(message, action, this.errorSnackBarConfig);
  }

  /**
   * Displays a success snackbar with consistent styling.
   *
   * @param message - The success message to display
   * @param action - The action button text (default: 'OK')
   */
  showSuccess(message: string, action: string = 'OK'): void {
    this.snackBar.open(message, action, this.successSnackBarConfig);
  }

  /**
   * Displays a warning snackbar with consistent styling.
   *
   * @param message - The warning message to display
   * @param action - The action button text
   * @param duration - Custom duration in milliseconds (optional)
   */
  showWarning(message: string, action?: string, duration?: number): void {
    const config = duration
      ? { ...this.warningSnackBarConfig, duration }
      : this.warningSnackBarConfig;

    this.snackBar.open(message, action, config);
  }

  /**
   * Displays an info snackbar with consistent styling.
   *
   * @param message - The info message to display
   * @param action - The action button text (optional)
   * @param duration - Custom duration in milliseconds (optional)
   */
  showInfo(message: string, action?: string, duration?: number): void {
    const config = duration
      ? { ...this.infoSnackBarConfig, duration }
      : this.infoSnackBarConfig;

    this.snackBar.open(message, action, config);
  }

  /**
   * Returns a snackbar reference with an action callback.
   * Useful when you need to react to user actions on the snackbar.
   *
   * @param message - The message to display
   * @param action - The action button text
   * @param type - The snackbar type ('error' | 'success' | 'warning' | 'info')
   * @param duration - Custom duration in milliseconds (optional)
   * @returns The MatSnackBarRef for subscribing to actions
   *
   * @example
   * ```typescript
   * const snackBarRef = this.errorHandler.showWithAction(
   *   'Fehler aufgetreten',
   *   'WIEDERHOLEN',
   *   'error'
   * );
   * snackBarRef.onAction().subscribe(() => {
   *   // Handle retry logic
   * });
   * ```
   */
  showWithAction(
    message: string,
    action: string,
    type: 'error' | 'success' | 'warning' | 'info' = 'info',
    duration?: number
  ) {
    let config;
    switch (type) {
      case 'error':
        config = duration ? { ...this.errorSnackBarConfig, duration } : this.errorSnackBarConfig;
        break;
      case 'success':
        config = duration ? { ...this.successSnackBarConfig, duration } : this.successSnackBarConfig;
        break;
      case 'warning':
        config = duration ? { ...this.warningSnackBarConfig, duration } : this.warningSnackBarConfig;
        break;
      case 'info':
      default:
        config = duration ? { ...this.infoSnackBarConfig, duration } : this.infoSnackBarConfig;
        break;
    }

    return this.snackBar.open(message, action, config);
  }
}
