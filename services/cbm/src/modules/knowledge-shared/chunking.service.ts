import { Injectable, Logger } from '@nestjs/common';

export interface ChunkingConfig {
  strategy: 'fixed' | 'sentence' | 'paragraph';
  chunkSize: number;   // target tokens (approx: 1 token ≈ 4 chars)
  chunkOverlap: number;
}

export interface TextChunk {
  content: string;
  chunkIndex: number;
  metadata: {
    charStart: number;
    charEnd: number;
    page?: number;
    section?: string;
  };
}

@Injectable()
export class ChunkingService {
  private readonly logger = new Logger(ChunkingService.name);

  /**
   * Get default chunking config from environment
   */
  getDefaultConfig(): ChunkingConfig {
    return {
      strategy: (process.env.KB_CHUNK_STRATEGY as any) || 'sentence',
      chunkSize: parseInt(process.env.KB_CHUNK_SIZE || '512', 10),
      chunkOverlap: parseInt(process.env.KB_CHUNK_OVERLAP || '64', 10),
    };
  }

  /**
   * Chunk rawContent text into segments per config
   */
  chunk(rawContent: string, config?: Partial<ChunkingConfig>): TextChunk[] {
    const fullConfig: ChunkingConfig = {
      ...this.getDefaultConfig(),
      ...config,
    };

    switch (fullConfig.strategy) {
      case 'fixed':
        return this.chunkFixed(rawContent, fullConfig);
      case 'paragraph':
        return this.chunkByParagraph(rawContent, fullConfig);
      case 'sentence':
      default:
        return this.chunkBySentence(rawContent, fullConfig);
    }
  }

  /**
   * Fixed-size chunking: split by character count approximation (4 chars ≈ 1 token)
   */
  private chunkFixed(text: string, config: ChunkingConfig): TextChunk[] {
    const chunkSizeChars = config.chunkSize * 4;
    const overlapChars = config.chunkOverlap * 4;
    const chunks: TextChunk[] = [];

    let start = 0;
    let chunkIndex = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSizeChars, text.length);
      const content = text.slice(start, end).trim();

      if (content.length > 0) {
        chunks.push({
          content,
          chunkIndex: chunkIndex++,
          metadata: { charStart: start, charEnd: end },
        });
      }

      start = end - overlapChars;
      if (start >= end) break;
    }

    return chunks;
  }

  /**
   * Sentence-based chunking: accumulate sentences until chunkSize reached, then overlap
   */
  private chunkBySentence(text: string, config: ChunkingConfig): TextChunk[] {
    // Split by sentence boundaries (., ?, !, \n\n)
    const sentenceRegex = /(?<=[.?!])\s+|(?<=\n\n)/;
    const sentences = text.split(sentenceRegex).filter((s) => s.trim().length > 0);

    const chunkSizeChars = config.chunkSize * 4;
    const overlapChars = config.chunkOverlap * 4;

    const chunks: TextChunk[] = [];
    let buffer = '';
    let bufferStart = 0;
    let currentPos = 0;
    let chunkIndex = 0;

    for (const sentence of sentences) {
      const sentenceWithSpace = sentence + ' ';

      if (buffer.length + sentenceWithSpace.length > chunkSizeChars && buffer.length > 0) {
        const content = buffer.trim();
        if (content.length > 0) {
          chunks.push({
            content,
            chunkIndex: chunkIndex++,
            metadata: {
              charStart: bufferStart,
              charEnd: bufferStart + buffer.length,
            },
          });
        }

        // Start next chunk with overlap
        const overlapText = buffer.slice(Math.max(0, buffer.length - overlapChars));
        bufferStart = currentPos - overlapText.length;
        buffer = overlapText;
      }

      buffer += sentenceWithSpace;
      currentPos += sentenceWithSpace.length;
    }

    // Flush remaining buffer
    if (buffer.trim().length > 0) {
      chunks.push({
        content: buffer.trim(),
        chunkIndex: chunkIndex++,
        metadata: {
          charStart: bufferStart,
          charEnd: bufferStart + buffer.length,
        },
      });
    }

    return chunks;
  }

  /**
   * Paragraph-based chunking: split on double newlines, merge small paragraphs
   */
  private chunkByParagraph(text: string, config: ChunkingConfig): TextChunk[] {
    const chunkSizeChars = config.chunkSize * 4;
    const overlapChars = config.chunkOverlap * 4;

    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
    const chunks: TextChunk[] = [];
    let buffer = '';
    let bufferStart = 0;
    let currentPos = 0;
    let chunkIndex = 0;

    for (const para of paragraphs) {
      const paraWithBreak = para + '\n\n';

      if (buffer.length + paraWithBreak.length > chunkSizeChars && buffer.length > 0) {
        const content = buffer.trim();
        if (content.length > 0) {
          chunks.push({
            content,
            chunkIndex: chunkIndex++,
            metadata: {
              charStart: bufferStart,
              charEnd: bufferStart + buffer.length,
            },
          });
        }

        // Overlap: carry last chars
        const overlapText = buffer.slice(Math.max(0, buffer.length - overlapChars));
        bufferStart = currentPos - overlapText.length;
        buffer = overlapText;
      }

      buffer += paraWithBreak;
      currentPos += paraWithBreak.length;
    }

    if (buffer.trim().length > 0) {
      chunks.push({
        content: buffer.trim(),
        chunkIndex: chunkIndex++,
        metadata: {
          charStart: bufferStart,
          charEnd: bufferStart + buffer.length,
        },
      });
    }

    return chunks;
  }
}
