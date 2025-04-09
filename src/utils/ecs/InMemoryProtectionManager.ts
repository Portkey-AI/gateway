export class InMemoryProtectionManager {
  currentState: 'protected' | 'unprotected';

  constructor() {
    this.currentState = 'unprotected';
  }

  async acquire() {
    this.currentState = 'protected';
  }
  async release() {
    this.currentState = 'unprotected';
  }

  close() {
    return;
  }
}
