import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../config/queue.config';

export type AmiCommandType =
  | 'originate'
  | 'syncAccount'
  | 'syncTrunk'
  | 'syncDialplan'
  | 'hangupChannel';

export interface AmiCommand {
  type: AmiCommandType;
  [key: string]: any;
}

@Injectable()
export class AmiCommandsProducer {
  constructor(
    @InjectQueue(QUEUE_NAMES.AMI_COMMANDS) private readonly queue: Queue,
  ) {}

  async enqueue(command: AmiCommand, opts?: { delay?: number }): Promise<void> {
    await this.queue.add(command.type, command, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      delay: opts?.delay,
    });
  }
}
