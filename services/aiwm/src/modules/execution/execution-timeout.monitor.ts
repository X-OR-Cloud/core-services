import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { ExecutionService } from './execution.service';
import { ExecutionOrchestrator } from './execution.orchestrator';

/**
 * ExecutionTimeoutMonitor - Background service for timeout handling
 *
 * Responsibilities:
 * - Periodically checks for timed-out executions
 * - Marks timed-out executions as 'timeout' status
 * - Optionally triggers automatic retry
 * - Configurable check interval
 */
@Injectable()
export class ExecutionTimeoutMonitor implements OnModuleInit {
  private readonly logger = new Logger(ExecutionTimeoutMonitor.name);
  private readonly checkInterval: number;
  private readonly autoRetry: boolean;
  private readonly maxAutoRetries: number;
  private isEnabled: boolean = true;

  constructor(
    private readonly executionService: ExecutionService,
    private readonly executionOrchestrator: ExecutionOrchestrator,
    private readonly configService: ConfigService
  ) {
    // Check interval in milliseconds (default: 60 seconds)
    this.checkInterval = this.configService.get<number>(
      'EXECUTION_TIMEOUT_CHECK_INTERVAL',
      60000
    );

    // Auto retry on timeout
    this.autoRetry = this.configService.get<boolean>(
      'EXECUTION_TIMEOUT_AUTO_RETRY',
      false
    );

    // Max auto retries
    this.maxAutoRetries = this.configService.get<number>(
      'EXECUTION_TIMEOUT_MAX_AUTO_RETRIES',
      1
    );
  }

  onModuleInit() {
    this.logger.log(
      `ExecutionTimeoutMonitor initialized: checkInterval=${this.checkInterval}ms, ` +
      `autoRetry=${this.autoRetry}, maxAutoRetries=${this.maxAutoRetries}`
    );
  }

  /**
   * Periodic check for timed-out executions
   * Runs every checkInterval milliseconds
   */
  @Interval('executionTimeoutCheck', 60000) // Default 60 seconds, can be overridden
  async checkTimeouts(): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    try {
      const timedOutExecutions = await this.executionService.findTimedOutExecutions();

      if (timedOutExecutions.length === 0) {
        return;
      }

      this.logger.warn(
        `Found ${timedOutExecutions.length} timed-out executions: ` +
        `[${timedOutExecutions.map((e) => (e as any)._id.toString()).join(', ')}]`
      );

      // Handle each timed-out execution
      await Promise.all(
        timedOutExecutions.map((execution) =>
          this.handleTimeout((execution as any)._id.toString())
        )
      );
    } catch (error: any) {
      this.logger.error(
        `Error checking for timed-out executions: ${error.message}`,
        error.stack
      );
    }
  }

  /**
   * Handle a single timed-out execution
   */
  private async handleTimeout(id: string): Promise<void> {
    try {
      this.logger.warn(`Handling timeout for execution ${id}`);

      // Mark execution as timeout
      await this.executionOrchestrator.handleExecutionTimeout(id);

      // Auto retry if enabled
      if (this.autoRetry) {
        const { Types } = await import('mongoose');
        const execution = await this.executionService.findById(new Types.ObjectId(id) as any, {} as any);

        if (!execution) {
          return;
        }

        // Check if we can auto-retry
        if (execution.retryCount < this.maxAutoRetries) {
          this.logger.log(
            `Auto-retrying execution ${id} (attempt ${execution.retryCount + 1}/${this.maxAutoRetries})`
          );

          // Retry execution
          await this.executionService.retryExecution(id, false);

          // Resume execution
          await this.executionOrchestrator.resumeExecution(id);
        } else {
          this.logger.warn(
            `Execution ${id} reached max auto-retry attempts (${this.maxAutoRetries})`
          );
        }
      }
    } catch (error: any) {
      this.logger.error(
        `Error handling timeout for execution ${id}: ${error.message}`,
        error.stack
      );
    }
  }

  /**
   * Enable timeout monitoring
   */
  enable(): void {
    this.isEnabled = true;
    this.logger.log('ExecutionTimeoutMonitor enabled');
  }

  /**
   * Disable timeout monitoring
   */
  disable(): void {
    this.isEnabled = false;
    this.logger.log('ExecutionTimeoutMonitor disabled');
  }

  /**
   * Get monitor status
   */
  getStatus(): {
    enabled: boolean;
    checkInterval: number;
    autoRetry: boolean;
    maxAutoRetries: number;
  } {
    return {
      enabled: this.isEnabled,
      checkInterval: this.checkInterval,
      autoRetry: this.autoRetry,
      maxAutoRetries: this.maxAutoRetries,
    };
  }
}
