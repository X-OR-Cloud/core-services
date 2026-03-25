import { Injectable } from '@nestjs/common';

type TextItem = { x: number; y: number; text: string; fontSize: number; bold: boolean };
type YRow = {
  y: number;
  items: TextItem[];
  xSpread: number;
  isMultiCol: boolean;
  isSectionHeading: boolean;
};
type LogicalRow = { y: number; cells: Record<number, string> };
type Block = { type: 'text'; yRow: YRow } | { type: 'table'; yRows: YRow[] };

@Injectable()
export class PdfParserService {
  /**
   * Parse PDF buffer and return structured Markdown preserving headings and tables.
   * Uses pdf2json for layout-aware extraction (coordinates, font size, bold).
   */
  async parseToMarkdown(buffer: Buffer): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PDFParser = require('pdf2json');

    const pdfData: any = await new Promise((resolve, reject) => {
      const parser = new PDFParser(null, 1);
      parser.on('pdfParser_dataReady', resolve);
      parser.on('pdfParser_dataError', (err: any) => reject(err.parserError));
      parser.parseBuffer(buffer);
    });

    const output: string[] = [];
    const pages = pdfData.Pages || [];

    for (let pi = 0; pi < pages.length; pi++) {
      const page = pages[pi];
      const texts: TextItem[] = [];

      for (const t of page.Texts || []) {
        const str = decodeURIComponent(t.R?.map((r: any) => r.T).join('') ?? '');
        if (!str.trim()) continue;
        const r0 = t.R?.[0];
        texts.push({
          x: t.x,
          y: t.y,
          text: str,
          fontSize: r0?.TS?.[1] ?? 12,
          bold: r0?.TS?.[2] === 1,
        });
      }
      texts.sort((a, b) => a.y - b.y || a.x - b.x);

      if (texts.length === 0) {
        if (pi < pages.length - 1) output.push('\n---\n');
        continue;
      }

      const allSizes = texts.map(t => t.fontSize);
      const dominant = allSizes.sort((a, b) =>
        allSizes.filter(v => v === b).length - allSizes.filter(v => v === a).length
      )[0] || 12;
      const maxSize = Math.max(...allSizes);
      // Threshold: midpoint between dominant and maxSize — separates section headings from table labels
      const sectionFsThreshold = dominant + (maxSize - dominant) * 0.42;
      const lineH = this.computeLineHeight(texts);
      const WRAP = lineH * 0.6;          // gap < this → text wraps within same cell
      const SECTION_BREAK = lineH * 1.4; // gap > this → new paragraph/section

      // Group into y-rows (tolerance 0.4 units)
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

      // Build blocks: section headings become text, multi-col rows start table regions
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

      // Render blocks
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
          // Table: compute column boundaries from multi-col rows only
          const multiColItems = block.yRows.filter(r => r.isMultiCol).flatMap(r => r.items);
          const colXs = this.clusterXs(multiColItems, 2.5);

          // Merge wrapped lines into logical rows
          const logicalRows: LogicalRow[] = [];
          for (const yr of block.yRows) {
            const cells: Record<number, string> = {};
            for (const item of yr.items) {
              const ci = this.nearestColIdx(item.x, colXs);
              cells[ci] = (cells[ci] ? cells[ci] + ' ' : '') + item.text.trim();
            }
            const prev = logicalRows[logicalRows.length - 1];
            const yGap = prev ? yr.y - prev.y : Infinity;
            if (prev && yGap < WRAP * 1.5 && !yr.isMultiCol) {
              // Wrap: append to existing cells
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

    return output.join('\n');
  }

  private computeLineHeight(texts: TextItem[]): number {
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

  private clusterXs(items: TextItem[], tolerance = 2.5): number[] {
    const clusters: { center: number; xs: number[] }[] = [];
    for (const { x } of [...items].sort((a, b) => a.x - b.x)) {
      const c = clusters.find(c => Math.abs(c.center - x) < tolerance);
      if (c) { c.xs.push(x); c.center = c.xs.reduce((a, b) => a + b, 0) / c.xs.length; }
      else clusters.push({ center: x, xs: [x] });
    }
    return clusters.map(c => c.center).sort((a, b) => a - b);
  }

  private nearestColIdx(x: number, colXs: number[]): number {
    let idx = 0, minD = Infinity;
    for (let i = 0; i < colXs.length; i++) {
      const d = Math.abs(x - colXs[i]);
      if (d < minD) { minD = d; idx = i; }
    }
    return idx;
  }
}
