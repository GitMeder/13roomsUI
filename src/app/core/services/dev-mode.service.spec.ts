import { TestBed } from '@angular/core/testing';
import { DevModeService } from './dev-mode.service';

describe('DevModeService', () => {
  let service: DevModeService;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();

    TestBed.configureTestingModule({});
    service = TestBed.inject(DevModeService);
  });

  afterEach(() => {
    // Clean up localStorage after each test
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with false (production mode) by default', () => {
    expect(service.isDevMode()).toBe(false);
  });

  it('should toggle dev mode on and off', () => {
    expect(service.isDevMode()).toBe(false);

    service.toggleDevMode();
    expect(service.isDevMode()).toBe(true);

    service.toggleDevMode();
    expect(service.isDevMode()).toBe(false);
  });

  it('should persist state to localStorage', () => {
    service.toggleDevMode();
    expect(localStorage.getItem('isDevMode')).toBe('true');

    service.toggleDevMode();
    expect(localStorage.getItem('isDevMode')).toBe('false');
  });

  it('should load state from localStorage on initialization', () => {
    localStorage.setItem('isDevMode', 'true');

    // Create new service instance
    const newService = new DevModeService();
    expect(newService.isDevMode()).toBe(true);
  });

  it('should provide enableDevMode method', () => {
    service.enableDevMode();
    expect(service.isDevMode()).toBe(true);
  });

  it('should provide disableDevMode method', () => {
    service.enableDevMode();
    expect(service.isDevMode()).toBe(true);

    service.disableDevMode();
    expect(service.isDevMode()).toBe(false);
  });

  it('should return correct status text', () => {
    expect(service.getStatusText()).toContain('Production Mode');

    service.enableDevMode();
    expect(service.getStatusText()).toContain('Developer Mode');
  });

  it('should return current state via currentState property', () => {
    expect(service.currentState).toBe(false);

    service.enableDevMode();
    expect(service.currentState).toBe(true);
  });
});
