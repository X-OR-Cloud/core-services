import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { KnowledgeFile } from '../knowledge-file/knowledge-file.schema';
import { KnowledgeLockService } from './knowledge-lock.service';
import { KnowledgeIndexerService } from './knowledge-indexer.service';

const POLL_INTERVAL_MS = 5000; // Poll every 5s for pending files
const MAX_CONCURRENT = parseInt(process.env.KB_WORKER_CONCURRENCY || '3', 10);

/**
 * KnowledgeWorkerService — background loop that picks up pending files
 * and runs the indexing pipeline with Redis distributed lock.
 *
 * Multiple worker instances can run safely — lock prevents duplicate processing.
 */
@Injectable()
export class KnowledgeWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KnowledgeWorkerService.name);
  private pollTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private activeJobs = 0;

  constructor(
    @InjectModel(KnowledgeFile.name)
    private readonly fileModel: Model<KnowledgeFile>,
    private readonly lockService: KnowledgeLockService,
    private readonly indexerService: KnowledgeIndexerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.lockService.connect();
    this.isRunning = true;
    this.startPollLoop();
    this.logger.log(`KB Worker started | concurrency=${MAX_CONCURRENT}`);
  }

  async onModuleDestroy(): Promise<void> {
    this.isRunning = false;
    this.stopPollLoop();
    this.logger.log('KB Worker stopped');
  }

  private startPollLoop(): void {
    this.pollTimer = setInterval(() => {
      this.poll().catch((err) =>
        this.logger.error(`Poll error: ${err.message}`),
      );
    }, POLL_INTERVAL_MS);
  }

  private stopPollLoop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async poll(): Promise<void> {
    if (!this.isRunning || this.activeJobs >= MAX_CONCURRENT) return;

    const available = MAX_CONCURRENT - this.activeJobs;
    const pendingFiles = await this.fileModel
      .find({ embeddingStatus: 'pending', isDeleted: false })
      .select('_id')
      .limit(available * 2) // fetch extra to compensate for lock contention
      .lean()
      .exec();

    if (pendingFiles.length === 0) return;

    for (const file of pendingFiles) {
      if (this.activeJobs >= MAX_CONCURRENT) break;

      const fileId = (file as any)._id.toString();
      const acquired = await this.lockService.tryAcquire(fileId);

      if (acquired) {
        this.activeJobs++;
        this.processFile(fileId).finally(() => {
          this.activeJobs--;
          this.lockService.release(fileId).catch(() => {});
        });
      }
    }
  }

  private async processFile(fileId: string): Promise<void> {
    this.logger.log(`Processing file: ${fileId}`);
    try {
      await this.indexerService.indexFile(fileId);
    } catch (error: any) {
      this.logger.error(`Unhandled error processing file ${fileId}: ${error.message}`);
    }
  }
}
