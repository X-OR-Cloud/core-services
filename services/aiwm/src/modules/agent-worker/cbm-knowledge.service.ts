import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface RagChunk {
  score: number;
  content: string;
}

@Injectable()
export class CbmKnowledgeService {
  private readonly logger = new Logger(CbmKnowledgeService.name);
  private readonly cbmUrl = process.env.CBM_SERVICE_URL || 'http://localhost:3004';

  async search(
    collectionId: string,
    query: string,
    topK: number,
    minScore: number,
    bearerToken: string,
  ): Promise<RagChunk[]> {
    try {
      const resp = await axios.post(
        `${this.cbmUrl}/knowledge-collections/${collectionId}/search`,
        { query, topK },
        {
          headers: { Authorization: `Bearer ${bearerToken}` },
          timeout: 5000,
        },
      );

      const results: any[] = resp.data?.results ?? [];
      return results
        .filter((r) => r.score >= minScore)
        .map((r) => ({
          score: r.score as number,
          content: (r.payload?.content ?? '') as string,
        }));
    } catch (err: unknown) {
      this.logger.warn(
        `CBM knowledge search failed for collection=${collectionId}: ${(err as Error).message}`,
      );
      return [];
    }
  }
}
