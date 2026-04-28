import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { UserNewsPrefsService } from '../user-news-prefs/user-news-prefs.service';
import { NewsItemsService } from '../news-items/news-items.service';
import { MemoriesService } from '../memories/memories.service';
import { UserPlansService } from '../user-plans/user-plans.service';
import { NewsItemDocument } from '../news-items/news-items.schema';
import { UserNewsPrefDocument } from '../user-news-prefs/user-news-prefs.schema';

const PRE_FILTER_LIMITS: Record<string, number> = { mortal: 10, immortal: 20, god: 30 };
const DIGEST_LIMITS: Record<string, number> = { mortal: 3, immortal: 5, god: 7 };
const FALLBACK = 'Xin lỗi, hôm nay em không tổng hợp được bản tin. Bạn thử lại sau nhé!';

@Injectable()
export class NewsDigestService {
  private readonly logger = new Logger(NewsDigestService.name);
  private genAI: GoogleGenAI | null = null;

  constructor(
    private readonly userNewsPrefsService: UserNewsPrefsService,
    private readonly newsItemsService: NewsItemsService,
    private readonly memoriesService: MemoriesService,
    private readonly userPlansService: UserPlansService,
  ) {
    const apiKey = process.env['GOOGLE_API_KEY'];
    if (apiKey) {
      this.genAI = new GoogleGenAI({ apiKey });
    } else {
      this.logger.warn('GOOGLE_API_KEY not set - NewsDigestService disabled');
    }
  }

  async buildDigest(platformUserId: string, soulId: string): Promise<string> {
    try {
      if (!this.genAI) return FALLBACK;

      const [pref, userPlan] = await Promise.all([
        this.userNewsPrefsService.findByUser(platformUserId, soulId),
        this.userPlansService.getOrCreate(platformUserId),
      ]);

      if (!pref || !pref.active) return FALLBACK;

      const planSlug = userPlan.planSlug || 'mortal';
      const preFilterLimit = PRE_FILTER_LIMITS[planSlug] ?? 10;
      const maxDigestItems = DIGEST_LIMITS[planSlug] ?? 3;

      // Fetch recent news (last 24h)
      const items = await this.newsItemsService.findRecent({
        categories: pref.categories?.length ? pref.categories : undefined,
        language: pref.language || 'vi',
        sourceIds: pref.sourceIds?.length ? pref.sourceIds : undefined,
        sinceHours: 24,
        limitPerSource: preFilterLimit * 3,
      });

      if (!items.length) return FALLBACK;

      // Score → sort → take top preFilterLimit
      const topItems = items
        .map(item => ({ item, score: this.scoreItem(item, pref) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, preFilterLimit)
        .map(x => x.item);

      // Load memories for personalization context
      const memories = await this.memoriesService.getByPlatformUser(soulId, platformUserId);

      const { system, user } = this.buildPrompt(pref, topItems, memories, maxDigestItems);

      const result = await this.genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `${system}\n\n${user}`,
        config: { temperature: 0.7, maxOutputTokens: 1024 },
      });

      const text = result.text?.trim();
      return text || FALLBACK;
    } catch (err: any) {
      this.logger.error(`buildDigest failed: ${err.message}`, err.stack);
      return FALLBACK;
    }
  }

  private scoreItem(item: NewsItemDocument, pref: UserNewsPrefDocument): number {
    let score = 0;

    // Category match: +3 per matching category
    const prefCats = pref.categories ?? [];
    for (const cat of item.categories ?? []) {
      if (prefCats.includes(cat)) score += 3;
    }

    // Source priority: +5 if in user's preferred sources
    if (pref.sourceIds?.includes(String((item as any).sourceId))) score += 5;

    // Recency: linear decay, max +4 over 24h
    const ageHours = (Date.now() - new Date(item.publishedAt).getTime()) / 3_600_000;
    score += Math.max(0, 4 * (1 - ageHours / 24));

    return score;
  }

  private buildPrompt(
    pref: UserNewsPrefDocument,
    items: NewsItemDocument[],
    memories: any[],
    maxDigestItems: number,
  ): { system: string; user: string } {
    const vtTime = new Date(Date.now() + 7 * 3_600_000)
      .toISOString()
      .replace('T', ' ')
      .slice(0, 16) + ' (GMT+7)';

    const memorySummary = memories
      .slice(0, 10)
      .map(m => `- ${m.key}: ${m.value}`)
      .join('\n') || '(chưa có)';

    const newsLines = items
      .slice(0, maxDigestItems * 3)
      .map((item, i) =>
        `${i + 1}. [${item.sourceName}] ${item.title}\n   ${item.summary || '(không có tóm tắt)'}`,
      )
      .join('\n\n');

    const system = 'Bạn là trợ lý tin tức thân thiện, ngắn gọn, phù hợp gửi qua Zalo. Không dùng # heading. Dùng *tiêu đề* để in đậm. Dùng — cho danh sách.';

    const user = `Thời gian: ${vtTime}

Thông tin người dùng:
${memorySummary}

Tin tức hôm nay:
${newsLines}

Hãy tổng hợp bản tin với đúng ${maxDigestItems} bài hay nhất phù hợp với người dùng. Kết thúc bằng câu hỏi thăm hoặc gợi ý ngắn.`;

    return { system, user };
  }
}
