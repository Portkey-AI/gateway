/**
 * ProtectionManager that uses ECS API to protect the task from being killed
 * by ECS.
 *
 * This was largely copied from example at:
 * https://github.com/aws-containers/ecs-task-protection-examples
 */

import { EventEmitter } from 'node:events';
import type { ProtectionSettings } from './types';

// This class manages the task protection state. It implements basic
// rate limiting, and emits events to let you know when it changes state.
// you can await the acquire() and release() methods if you want to ensure
// that task protection has reached the desired state before moving on.
export default class ECSProtectionManager extends EventEmitter {
  desiredProtectionDurationInMins: number;
  protectionAdjustIntervalInMs: number;
  maintainProtectionPercentage: number;
  refreshProtectionPercentage: number;
  ECS_AGENT_URI: string | undefined;

  desiredState: string;
  currentState: string;
  lastStateChange: number;
  interval: NodeJS.Timeout;

  /**
   * @constructor
   * @param {*} protectionSettings
   * @param {*} protectionSettings.desiredProtectionDurationInMins - How long in minutes to protect the process on calling the acquire method
   * @param {*} protectionSettings.maintainProtectionPercentage - Number between 0 and 100 that expresses percentage of desired protection to maintain if release is called early
   * @param {*} protectionSettings.refreshProtectionPercentage - Number between 0 and 100 that expresses percentage of desired protection duration to let pass before doing an early refresh
   * @param {*} protectionSettings.protectionAdjustIntervalInMs - How frequently in ms to attempt/verify state matches desire
   */
  constructor(protectionSettings: ProtectionSettings) {
    super();
    this.desiredProtectionDurationInMins =
      protectionSettings.desiredProtectionDurationInMins;
    this.protectionAdjustIntervalInMs =
      protectionSettings.protectionAdjustIntervalInMs;
    this.maintainProtectionPercentage =
      protectionSettings.maintainProtectionPercentage;
    this.refreshProtectionPercentage =
      protectionSettings.refreshProtectionPercentage;
    this.ECS_AGENT_URI = process.env.ECS_AGENT_URI;

    if (!this.ECS_AGENT_URI) {
      throw new Error(
        'ECS_AGENT_URI environment variable must be set. This is set automatically in an ECS task environment'
      );
    }

    this.desiredState = 'unprotected';
    this.currentState = 'unprotected';
    this.lastStateChange = new Date().getTime();
    this.interval = setInterval(
      this.attemptAdjustProtection.bind(this),
      protectionSettings.protectionAdjustIntervalInMs
    );
  }

  async attemptAdjustProtection() {
    if (
      this.currentState === 'unprotected' &&
      this.desiredState === 'unprotected'
    ) {
      console.info('Already unprotected, nothing to do.');
      // Already unprotected so nothing to do right now.
      this.emit(this.currentState);
      return;
    }

    const now = new Date().getTime();
    const timeSinceLastChange = now - this.lastStateChange;
    const timeUntilProtectRefresh =
      this.desiredProtectionDurationInMins *
      60 *
      1000 *
      (this.refreshProtectionPercentage / 100);
    const timeUntilProtectRelease =
      this.desiredProtectionDurationInMins *
      60 *
      1000 *
      (this.maintainProtectionPercentage / 100);

    if (
      this.currentState === 'protected' &&
      this.desiredState === 'protected' &&
      timeSinceLastChange < timeUntilProtectRefresh
    ) {
      // We are already protected and haven't yet reached 80% of the acquired protection duration
      // so no need to do an early refresh.
      this.emit(this.currentState);
      console.info('Already protected, nothing to do.');
      return;
    }

    if (
      this.currentState === 'protected' &&
      this.desiredState === 'unprotected' &&
      timeSinceLastChange < timeUntilProtectRelease
    ) {
      // We are currently protected and not enough duration has passed since we became protected
      // so don't actually release the protection yet, maintain it for now.
      this.emit(this.currentState);
      console.info(
        'Not enough time has passed since protection was acquired, maintaining protection.'
      );
      return;
    }

    let ecsAgentParams: {
      ProtectionEnabled: boolean;
      ExpiresInMinutes?: number;
    };
    if (this.desiredState === 'unprotected') {
      ecsAgentParams = {
        ProtectionEnabled: false,
      };
    } else if (this.desiredState === 'protected') {
      ecsAgentParams = {
        ProtectionEnabled: true,
        ExpiresInMinutes: this.desiredProtectionDurationInMins,
      };
    } else {
      throw new Error('Invalid desired state');
    }

    try {
      await fetch(`${this.ECS_AGENT_URI}/task-protection/v1/state`, {
        method: 'PUT',
        body: JSON.stringify(ecsAgentParams),
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return this.emit('rejected', e);
    }

    this.lastStateChange = new Date().getTime();
    this.currentState = this.desiredState;
    console.info(`Successfully set protection to ${this.currentState}.`);
    this.emit(this.currentState);
  }

  /**
   * Set the desired state to protected and wait for protection to be successfully acquired
   */
  async acquire() {
    console.info('Attempting to acquire scale in protection.');
    this.desiredState = 'protected';
    return new Promise((resolve) => {
      this.once('protected', resolve);
      this.attemptAdjustProtection(); // Immediate attempt to make an adjustment
    });
  }

  /**
   * Set the desired state to unprotected and wait for protection to be successfully released
   */
  release() {
    console.info('Attempting to release scale in protection.');
    this.desiredState = 'unprotected';
    return new Promise((resolve) => {
      this.once('unprotected', resolve);
      this.attemptAdjustProtection(); // Immediate attempt to make an adjustment
    });
  }

  /**
   * When it is time to stop the process this clears
   * the interval so that it no longer keeps the event loop alive.
   */
  close() {
    clearInterval(this.interval);
  }
}
