import { Injectable, Optional } from '@nestjs/common';
import { SchedulerService } from '../scheduler/scheduler.service';

@Injectable()
export class AppService {
  constructor(
    @Optional() private readonly schedulerService?: SchedulerService,
  ) {}

  getData(): { message: string; service: string; version: string } {
    return {
      message: 'SCHD - Scheduler Service',
      service: 'schd',
      version: '1.0.0',
    };
  }

  getSchedulerStatus(): { isRunning: boolean; message: string; mode: string } {
    if (this.schedulerService) {
      const status = this.schedulerService.getStatus();
      return {
        ...status,
        mode: 'worker',
      };
    }

    return {
      isRunning: false,
      message: 'Scheduler not loaded (API mode)',
      mode: 'api',
    };
  }
}
