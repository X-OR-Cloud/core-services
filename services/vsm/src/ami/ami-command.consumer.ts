import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../config/queue.config';
import { AmiCommand } from '../queues/producers/ami-commands.producer';
import { AmiCommandService } from './ami-command.service';

@Processor(QUEUE_NAMES.AMI_COMMANDS)
export class AmiCommandConsumer extends WorkerHost {
  private readonly logger = new Logger(AmiCommandConsumer.name);

  constructor(private readonly commandService: AmiCommandService) {
    super();
  }

  async process(job: Job<AmiCommand>): Promise<void> {
    this.logger.debug(`Processing job ${job.id}: ${job.data.type}`);
    await this.commandService.execute(job.data);
  }
}
