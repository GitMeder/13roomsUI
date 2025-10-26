import { Injectable, signal, effect } from '@angular/core';

/**
 * DevModeService - Global state management for developer mode
 *
 * Developer mode allows unrestricted booking times (24/7) for testing purposes.
 * State is persisted in localStorage to survive page reloads.
 *
 * Usage:
 * - Inject this service in any component
 * - Read state: devModeService.isDevMode()
 * - Toggle state: devModeService.toggleDevMode()
 */
@Injectable({
  providedIn: 'root'
})
export class DevModeService {
  private readonly STORAGE_KEY = 'isDevMode';

  /**
   * Signal holding the developer mode state
   * Initialized from localStorage, defaulting to true (developer mode ON)
   * This allows unrestricted testing by default
   */
  public readonly isDevMode = signal<boolean>(
    this.loadStateFromStorage()
  );

  constructor() {
    console.log(`🔧 DevModeService initialized. Developer Mode: ${this.isDevMode() ? 'ON (24/7)' : 'OFF (08:00-20:00)'}`);

    // Effect to log state changes
    effect(() => {
      const currentState = this.isDevMode();
      console.log(`📊 Developer Mode State Changed: ${currentState ? 'ON' : 'OFF'}`);
    });
  }

  /**
   * Toggle developer mode on/off
   * Automatically persists the new state to localStorage
   */
  public toggleDevMode(): void {
    const newState = !this.isDevMode();
    this.isDevMode.set(newState);
    this.saveStateToStorage(newState);

    console.log(`🔄 Developer Mode toggled: ${newState ? 'ON (24/7 booking enabled)' : 'OFF (08:00-20:00 restrictions active)'}`);
    console.log(`💾 State saved to localStorage`);
  }

  /**
   * Explicitly enable developer mode
   */
  public enableDevMode(): void {
    if (!this.isDevMode()) {
      this.isDevMode.set(true);
      this.saveStateToStorage(true);
      console.log('✅ Developer Mode ENABLED');
    }
  }

  /**
   * Explicitly disable developer mode
   */
  public disableDevMode(): void {
    if (this.isDevMode()) {
      this.isDevMode.set(false);
      this.saveStateToStorage(false);
      console.log('🔒 Developer Mode DISABLED');
    }
  }

  /**
   * Load state from localStorage
   * Returns true (developer mode ON) if not set
   * This allows unrestricted testing by default
   */
  private loadStateFromStorage(): boolean {
    try {
      const storedValue = localStorage.getItem(this.STORAGE_KEY);
      if (storedValue === null) {
        return true; // Default to developer mode ON for easy testing
      }
      return JSON.parse(storedValue);
    } catch (error) {
      console.error('Error reading dev mode state from localStorage:', error);
      return true; // Default to developer mode ON on error
    }
  }

  /**
   * Save state to localStorage
   */
  private saveStateToStorage(state: boolean): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Error saving dev mode state to localStorage:', error);
    }
  }

  /**
   * Get current state as a boolean (for convenience)
   */
  public get currentState(): boolean {
    return this.isDevMode();
  }

  /**
   * Get human-readable status string
   */
  public getStatusText(): string {
    return this.isDevMode()
      ? 'Developer Mode: ON (24/7 booking)'
      : 'Production Mode: ON (08:00-20:00)';
  }
}
