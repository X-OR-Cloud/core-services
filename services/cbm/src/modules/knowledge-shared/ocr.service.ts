import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { fromPath } = require('pdf2pic');

// Minimum text length threshold to consider pdf-parse result valid
const MIN_TEXT_LENGTH = 100;

// Max pages to OCR per file (to avoid excessive API calls)
const DEFAULT_MAX_PAGES = 50;

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  private get apiUrl(): string {
    return process.env.KB_OCR_API_URL || '';
  }

  private get apiKey(): string {
    return process.env.KB_OCR_API_KEY || '';
  }

  private get model(): string {
    return process.env.KB_OCR_MODEL || 'Qwen/Qwen2.5-VL-72B-Instruct';
  }

  private get maxPages(): number {
    return parseInt(process.env.KB_OCR_MAX_PAGES || String(DEFAULT_MAX_PAGES), 10);
  }

  /**
   * Check if OCR fallback is needed based on extracted text length
   */
  isTextInsufficient(text: string): boolean {
    return text.trim().length < MIN_TEXT_LENGTH;
  }

  /**
   * Check if OCR is configured
   */
  isConfigured(): boolean {
    return !!this.apiUrl;
  }

  /**
   * OCR a PDF file using Vision LLM (Qwen2.5-VL)
   * Renders each page to PNG, sends to VLM, concatenates text
   */
  async ocrPdf(pdfPath: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('OCR not configured: KB_OCR_API_URL is not set');
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-ocr-'));

    try {
      // Convert PDF pages to PNG images
      const convert = fromPath(pdfPath, {
        density: 150,
        saveFilename: 'page',
        savePath: tmpDir,
        format: 'png',
        width: 1700,
        height: 2200,
      });

      // Get page count first
      const info = await convert.bulk(-1, { responseType: 'image' });
      const pageCount = Math.min(info.length, this.maxPages);

      if (pageCount === 0) {
        throw new Error('No pages found in PDF');
      }

      this.logger.log(`OCR: processing ${pageCount} pages from ${path.basename(pdfPath)}`);

      const pageTexts: string[] = [];

      for (let i = 0; i < pageCount; i++) {
        const imagePath = info[i].path!;
        const imageBuffer = fs.readFileSync(imagePath);
        const base64 = imageBuffer.toString('base64');

        const text = await this.extractTextFromImage(base64);
        pageTexts.push(text);

        this.logger.debug(`OCR: page ${i + 1}/${pageCount} done`);
      }

      return pageTexts.join('\n\n');
    } finally {
      // Cleanup tmp dir
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /**
   * Call Qwen2.5-VL via OpenAI-compatible chat/completions API
   */
  private async extractTextFromImage(base64Image: string): Promise<string> {
    const response = await fetch(`${this.apiUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${base64Image}`,
                },
              },
              {
                type: 'text',
                text: 'Extract all text from this image exactly as it appears. Output only the extracted text, no explanations.',
              },
            ],
          },
        ],
        max_tokens: 4096,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OCR API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    return data.choices[0]?.message?.content || '';
  }
}
