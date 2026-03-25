import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import {
  JwtAuthGuard,
  CurrentUser,
  ApiReadErrors,
  ApiDeleteErrors,
  parseQueryString,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { KnowledgeFileService } from './knowledge-file.service';
import { UploadKnowledgeFileDto } from './knowledge-file.dto';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

@ApiTags('Knowledge Files - Test')
@Controller('knowledge-files/test')
export class KnowledgeFileTestController {
  @Post('pdf-parse')
  @ApiOperation({ summary: '[TEST] Parse PDF with pdf-parse and return raw extracted text' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async testPdfParse(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE })],
      }),
    )
    file: Express.Multer.File,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const result = await pdfParse(file.buffer);
    return {
      library: 'pdf-parse',
      pages: result.numpages,
      info: result.info,
      text: result.text,
      charCount: result.text.length,
    };
  }

  @Post('pdf2json')
  @ApiOperation({ summary: '[TEST] Parse PDF with pdf2json → structured Markdown' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async testPdf2Json(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE })],
      }),
    )
    file: Express.Multer.File,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PDFParser = require('pdf2json');

    const pdfData: any = await new Promise((resolve, reject) => {
      const parser = new PDFParser(null, 1);
      parser.on('pdfParser_dataReady', resolve);
      parser.on('pdfParser_dataError', (err: any) => reject(err.parserError));
      parser.parseBuffer(file.buffer);
    });

    type TextItem = { x: number; y: number; text: string; fontSize: number; bold: boolean };
    type YRow = { y: number; items: TextItem[]; xSpread: number; isMultiCol: boolean; isSectionHeading: boolean };
    type LogicalRow = { y: number; cells: Record<number, string> };

    function clusterXs(items: TextItem[], tolerance = 2.5): number[] {
      const clusters: { center: number; xs: number[] }[] = [];
      for (const { x } of [...items].sort((a, b) => a.x - b.x)) {
        const c = clusters.find(c => Math.abs(c.center - x) < tolerance);
        if (c) { c.xs.push(x); c.center = c.xs.reduce((a, b) => a + b, 0) / c.xs.length; }
        else clusters.push({ center: x, xs: [x] });
      }
      return clusters.map(c => c.center).sort((a, b) => a - b);
    }

    function nearestColIdx(x: number, colXs: number[]): number {
      let idx = 0, minD = Infinity;
      for (let i = 0; i < colXs.length; i++) {
        const d = Math.abs(x - colXs[i]);
        if (d < minD) { minD = d; idx = i; }
      }
      return idx;
    }

    function computeLineHeight(texts: TextItem[]): number {
      const ys = [...new Set(texts.map(t => Math.round(t.y * 10) / 10))].sort((a, b) => a - b);
      const gaps: number[] = [];
      for (let i = 1; i < ys.length; i++) {
        const g = ys[i] - ys[i - 1];
        if (g > 0.3 && g < 5) gaps.push(g);
      }
      if (!gaps.length) return 2.0;
      gaps.sort((a, b) => a - b);
      return gaps[Math.floor(gaps.length / 2)];
    }

    const output: string[] = [];
    const pages = pdfData.Pages || [];

    for (let pi = 0; pi < pages.length; pi++) {
      const page = pages[pi];
      const texts: TextItem[] = [];

      for (const t of page.Texts || []) {
        const str = decodeURIComponent(t.R?.map((r: any) => r.T).join('') ?? '');
        if (!str.trim()) continue;
        const r0 = t.R?.[0];
        texts.push({ x: t.x, y: t.y, text: str, fontSize: r0?.TS?.[1] ?? 12, bold: r0?.TS?.[2] === 1 });
      }
      texts.sort((a, b) => a.y - b.y || a.x - b.x);

      const allSizes = texts.map(t => t.fontSize);
      const dominant = allSizes.sort((a, b) =>
        allSizes.filter(v => v === b).length - allSizes.filter(v => v === a).length
      )[0] || 12;
      const maxSize = Math.max(...allSizes);
      // Section heading threshold: midpoint between dominant and maxSize (factor 0.42)
      const sectionFsThreshold = dominant + (maxSize - dominant) * 0.42;
      const lineH = computeLineHeight(texts);
      const WRAP = lineH * 0.6;           // < this = text wrap (same cell, e.g. 0.86)
      const SECTION_BREAK = lineH * 1.4;  // > this = paragraph/section break (e.g. 3.0)

      // Group into y-rows
      const yRows: YRow[] = [];
      for (const item of texts) {
        const existing = yRows.find(r => Math.abs(r.y - item.y) < 0.4);
        if (existing) existing.items.push(item);
        else yRows.push({ y: item.y, items: [item], xSpread: 0, isMultiCol: false, isSectionHeading: false });
      }
      for (const row of yRows) {
        const xs = row.items.map(i => i.x);
        row.xSpread = xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : 0;
        row.isMultiCol = row.xSpread > 5;
        row.isSectionHeading = row.items[0].bold && row.items[0].fontSize >= sectionFsThreshold && !row.isMultiCol;
      }

      // Build blocks
      type Block = { type: 'text'; yRow: YRow } | { type: 'table'; yRows: YRow[] };
      const blocks: Block[] = [];
      let i = 0;
      while (i < yRows.length) {
        const row = yRows[i];
        if (row.isSectionHeading) {
          blocks.push({ type: 'text', yRow: row });
          i++;
        } else if (row.isMultiCol) {
          const tableYRows: YRow[] = [row];
          i++;
          while (i < yRows.length) {
            const next = yRows[i];
            const yGap = next.y - tableYRows[tableYRows.length - 1].y;
            if (next.isSectionHeading || yGap >= SECTION_BREAK) break;
            tableYRows.push(next);
            i++;
          }
          blocks.push({ type: 'table', yRows: tableYRows });
        } else {
          blocks.push({ type: 'text', yRow: row });
          i++;
        }
      }

      // Render
      let prevY = -1;
      for (const block of blocks) {
        if (block.type === 'text') {
          const row = block.yRow;
          const rowText = row.items.map(i => i.text).join('').trim();
          if (!rowText) continue;
          if (prevY >= 0 && row.y - prevY >= SECTION_BREAK) output.push('');
          prevY = row.y;
          const fs = row.items[0].fontSize;
          const bold = row.items[0].bold;
          if (fs >= maxSize) output.push(`# ${rowText}`);
          else if (bold && fs >= sectionFsThreshold) output.push(`## ${rowText}`);
          else if (bold) output.push(`**${rowText}**`);
          else output.push(rowText);
        } else {
          const multiColItems = block.yRows.filter(r => r.isMultiCol).flatMap(r => r.items);
          const colXs = clusterXs(multiColItems, 2.5);

          // Merge wrapped lines into logical rows
          const logicalRows: LogicalRow[] = [];
          for (const yr of block.yRows) {
            const cells: Record<number, string> = {};
            for (const item of yr.items) {
              const ci = nearestColIdx(item.x, colXs);
              cells[ci] = (cells[ci] ? cells[ci] + ' ' : '') + item.text.trim();
            }
            const prev = logicalRows[logicalRows.length - 1];
            const yGap = prev ? yr.y - prev.y : Infinity;
            // Wrap: single-col row close to previous (gap < WRAP * 1.5)
            if (prev && yGap < WRAP * 1.5 && !yr.isMultiCol) {
              for (const [k, v] of Object.entries(cells)) {
                const ki = Number(k);
                prev.cells[ki] = (prev.cells[ki] ? prev.cells[ki] + ' ' : '') + v;
              }
            } else {
              logicalRows.push({ y: yr.y, cells });
            }
          }

          const usedColIdxs = [...new Set(logicalRows.flatMap(r => Object.keys(r.cells).map(Number)))].sort((a, b) => a - b);
          output.push('');
          let headerDone = false;
          for (const lr of logicalRows) {
            const cells = usedColIdxs.map(ci => (lr.cells[ci] || '').trim());
            output.push('| ' + cells.join(' | ') + ' |');
            if (!headerDone) {
              output.push('| ' + usedColIdxs.map(() => '---').join(' | ') + ' |');
              headerDone = true;
            }
          }
          output.push('');
          prevY = block.yRows[block.yRows.length - 1].y;
        }
      }

      if (pi < pages.length - 1) output.push('\n---\n');
    }

    const markdown = output.join('\n');
    return {
      library: 'pdf2json',
      pages: pages.length,
      markdown,
      charCount: markdown.length,
    };
  }
}

@ApiTags('Knowledge Files')
@ApiBearerAuth()
@Controller('knowledge-files')
export class KnowledgeFileController {
  constructor(private readonly fileService: KnowledgeFileService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload file for indexing (multipart/form-data)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'collectionId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        collectionId: { type: 'string' },
        name: { type: 'string' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE })],
      }),
    )
    file: Express.Multer.File,
    @Body() uploadDto: UploadKnowledgeFileDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.fileService.uploadFile(
      file,
      uploadDto.collectionId,
      uploadDto.name,
      context,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List knowledge files (excludes rawContent and filePath)' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext,
  ) {
    const options = parseQueryString(query);
    return this.fileService.findAll(options, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get knowledge file by ID (includes rawContent)' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.fileService.findById(new Types.ObjectId(id) as any, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete file + all its chunks + Qdrant points' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.fileService.deleteFile(id, context);
  }

  @Post(':id/reindex')
  @ApiOperation({ summary: 'Trigger reindex for a file (resets status to pending)' })
  @UseGuards(JwtAuthGuard)
  async reindex(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.fileService.reindex(id, context);
  }
}
