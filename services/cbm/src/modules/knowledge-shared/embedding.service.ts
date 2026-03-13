import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  private get apiUrl(): string {
    return process.env.KB_EMBEDDING_API_URL || 'http://localhost:8080';
  }

  private get apiKey(): string {
    return process.env.KB_EMBEDDING_API_KEY || '';
  }

  private get model(): string {
    return process.env.KB_EMBEDDING_MODEL || 'Qwen/Qwen3-Embedding-8B';
  }

  /**
   * Embed a single text string — returns float[] vector
   */
  async embedText(text: string): Promise<number[]> {
    const vectors = await this.embedBatch([text]);
    return vectors[0];
  }

  /**
   * Embed batch of texts — returns list of float[] vectors
   * Calls OpenAI-compatible /v1/embeddings endpoint
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch(`${this.apiUrl}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embedding API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as {
      data: Array<{ index: number; embedding: number[] }>;
    };

    // Sort by index to maintain input order
    const sorted = data.data.sort((a, b) => a.index - b.index);
    return sorted.map((d) => d.embedding);
  }
}
