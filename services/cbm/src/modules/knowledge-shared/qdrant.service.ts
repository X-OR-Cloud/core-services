import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';

export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: {
    chunkId: string;
    sourceId: string;
    sourceType: 'file' | 'document';
    collectionId: string;
    orgId: string;
    content: string;
    [key: string]: any;
  };
}

export interface QdrantSearchResult {
  id: string | number;
  score: number;
  payload: {
    chunkId: string;
    sourceId: string;
    sourceType: 'file' | 'document';
    collectionId: string;
    orgId: string;
    content: string;
    [key: string]: any;
  };
}

export interface QdrantSearchOptions {
  filter?: Record<string, any>;
  topK?: number;
}

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  private client: QdrantClient;

  onModuleInit() {
    this.client = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY,
      checkCompatibility: false, // server 1.13.x vs client 1.17.x
    });
    this.logger.log(`QdrantService initialized: ${process.env.QDRANT_URL || 'http://localhost:6333'}`);
  }

  /**
   * Ensure a Qdrant collection exists with the correct vector dimension.
   * Creates it if it doesn't exist.
   */
  async ensureCollection(collectionName: string, vectorSize: number = 4096): Promise<void> {
    try {
      const exists = await this.client.collectionExists(collectionName);
      if (!exists.exists) {
        await this.client.createCollection(collectionName, {
          vectors: {
            size: vectorSize,
            distance: 'Cosine',
          },
        });
        // Create payload indexes for fast filtering
        await Promise.all([
          this.client.createPayloadIndex(collectionName, {
            field_name: 'collectionId',
            field_schema: 'keyword',
          }),
          this.client.createPayloadIndex(collectionName, {
            field_name: 'orgId',
            field_schema: 'keyword',
          }),
          this.client.createPayloadIndex(collectionName, {
            field_name: 'sourceId',
            field_schema: 'keyword',
          }),
        ]);
        this.logger.log(`Created Qdrant collection: ${collectionName}`);
      }
    } catch (error: any) {
      // Handle race condition: another worker may have created the collection concurrently (409 Conflict)
      const isConflict =
        error.message?.includes('Conflict') ||
        error.status === 409 ||
        error.statusCode === 409;
      if (isConflict) {
        this.logger.debug(`Qdrant collection ${collectionName} already exists (race condition handled)`);
        return;
      }
      this.logger.error(`Failed to ensure Qdrant collection ${collectionName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Upsert points (vector embeddings + payload) into a Qdrant collection
   */
  async upsertPoints(collectionName: string, points: QdrantPoint[]): Promise<void> {
    if (points.length === 0) return;

    const qdrantPoints = points.map((p) => ({
      id: p.id,
      vector: p.vector,
      payload: p.payload,
    }));

    await this.client.upsert(collectionName, {
      wait: true,
      points: qdrantPoints,
    });

    this.logger.debug(`Upserted ${points.length} points to ${collectionName}`);
  }

  /**
   * Vector search in a Qdrant collection
   */
  async search(
    collectionName: string,
    queryVector: number[],
    options: QdrantSearchOptions = {},
  ): Promise<QdrantSearchResult[]> {
    const results = await this.client.search(collectionName, {
      vector: queryVector,
      limit: options.topK || 5,
      filter: options.filter,
      with_payload: true,
    });

    return results.map((r) => ({
      id: r.id,
      score: r.score,
      payload: r.payload as QdrantSearchResult['payload'],
    }));
  }

  /**
   * Delete points by filter (e.g., when deleting a file or document)
   */
  async deletePointsByFilter(
    collectionName: string,
    filter: Record<string, any>,
  ): Promise<void> {
    await this.client.delete(collectionName, {
      wait: true,
      filter,
    });
    this.logger.debug(`Deleted points from ${collectionName} with filter: ${JSON.stringify(filter)}`);
  }

  /**
   * Delete specific points by IDs
   */
  async deletePoints(collectionName: string, pointIds: string[]): Promise<void> {
    if (pointIds.length === 0) return;

    await this.client.delete(collectionName, {
      wait: true,
      points: pointIds,
    });
    this.logger.debug(`Deleted ${pointIds.length} points from ${collectionName}`);
  }
}
