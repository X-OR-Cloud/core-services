import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { createHash } from 'crypto';
import { QUEUE_NAMES, QUEUE_EVENTS } from '../../config/queue.config';
import { NewsSourcesService } from '../../modules/news-sources/news-sources.service';
import { NewsItemsService } from '../../modules/news-items/news-items.service';

// rss-parser is CJS — require for correct constructor interop with webpack
// eslint-disable-next-line @typescript-eslint/no-var-requires
const RssParserCtor = require('rss-parser');
const rssParser = new RssParserCtor({ timeout: 15000 });

function hashUrl(url: string): string {
  return createHash('sha256').update(url.trim().toLowerCase()).digest('hex');
}

function truncate(text: string | null | undefined, max: number): string | null {
  if (!text) return null;
  const clean = text.replace(/<[^>]+>/g, '').trim(); // strip HTML tags
  return clean.length > max ? clean.slice(0, max) : clean;
}

@Injectable()
@Processor(QUEUE_NAMES.NEWS_FETCH)
export class NewsFetchProcessor extends WorkerHost {
  private readonly logger = new Logger(NewsFetchProcessor.name);

  constructor(
    private readonly newsSourcesService: NewsSourcesService,
    private readonly newsItemsService: NewsItemsService,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    if (job.name !== QUEUE_EVENTS.NEWS_FETCH) {
      this.logger.warn(`Unknown job type: ${job.name}`);
      return null;
    }
    this.logger.log(`Processing news-fetch job ${job.id}`);
    return this.handleFetch(job.data?.sourceId);
  }

  private async handleFetch(specificSourceId?: string): Promise<{ fetched: number; sources: number }> {
    const sources = specificSourceId
      ? [await this.newsSourcesService.findById(specificSourceId)]
      : await this.newsSourcesService.findAll(true);

    let totalFetched = 0;

    for (const source of sources) {
      try {
        const feed = await rssParser.parseURL(source.url);
        let inserted = 0;

        for (const item of feed.items ?? []) {
          const url = item.link || item.guid;
          if (!url) continue;

          const title = item.title?.trim();
          if (!title) continue;

          const urlHash = hashUrl(url);
          const summary = truncate(item.contentSnippet || item.content, 500);
          const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();
          if (isNaN(publishedAt.getTime())) continue;

          const isNew = await this.newsItemsService.upsert({
            urlHash,
            url,
            title,
            summary,
            sourceId: String(source._id),
            sourceName: source.name,
            categories: source.categories ?? [],
            language: source.language,
            publishedAt,
          });

          if (isNew) inserted++;
        }

        totalFetched += inserted;
        await this.newsSourcesService.markFetched(String(source._id));
        this.logger.log(`[${source.name}] fetched ${feed.items?.length ?? 0} items, ${inserted} new`);
      } catch (err: any) {
        this.logger.error(`[${source.name}] fetch failed: ${err.message}`);
      }
    }

    this.logger.log(`News fetch done — ${totalFetched} new items from ${sources.length} sources`);
    return { fetched: totalFetched, sources: sources.length };
  }
}
