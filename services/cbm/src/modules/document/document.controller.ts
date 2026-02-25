import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import {
  JwtAuthGuard,
  CurrentUser,
  ApiCreateErrors,
  ApiReadErrors,
  ApiUpdateErrors,
  ApiDeleteErrors,
  parseQueryString,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { Response } from 'express';
import { marked } from 'marked';
import { DocumentService } from './document.service';
import {
  CreateDocumentDto,
  UpdateDocumentDto,
  UpdateContentDto,
  CreateShareLinkDto,
} from './document.dto';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function wrapInHtmlPage(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #333; }
    pre { background: #f4f4f4; padding: 1rem; overflow-x: auto; border-radius: 4px; }
    code { background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
    pre code { background: none; padding: 0; }
    img { max-width: 100%; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 1rem; color: #666; }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new document' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createDocumentDto: CreateDocumentDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.documentService.create(createDocumentDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List all documents with pagination, search, and statistics' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext
  ) {
    const { search, ...rest } = query;
    const options = parseQueryString(rest);
    return this.documentService.findAll({ ...options, search }, context);
  }

  // --- Share link endpoints (must be BEFORE :id routes) ---

  @Post(':id/share')
  @ApiOperation({ summary: 'Create a share link for the document' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async createShareLink(
    @Param('id') id: string,
    @Body() dto: CreateShareLinkDto,
    @CurrentUser() context: RequestContext,
  ) {
    const document = await this.documentService.findById(
      new Types.ObjectId(id) as any,
      context,
    );

    if (!document) {
      throw new NotFoundException(`Document with ID ${id} not found`);
    }

    const ttl = dto.ttl || 3600;

    const token = this.jwtService.sign(
      { documentId: id, purpose: 'document-share' },
      { expiresIn: ttl },
    );

    const port = this.configService.get<string>('PORT') || '3004';
    const baseUrl =
      this.configService.get<string>('CBM_BASE_URL') || `http://localhost:${port}`;

    return {
      token,
      url: `${baseUrl}/documents/shared/${token}`,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  @Get('shared/:token')
  @ApiOperation({
    summary: 'View shared document via share token (public, no auth required)',
  })
  @ApiResponse({ status: 200, description: 'Document content returned' })
  @ApiResponse({ status: 410, description: 'Share link has expired' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async viewShared(
    @Param('token') token: string,
    @Query('render') render: string,
    @Res() res: Response,
  ) {
    let payload: { documentId: string; purpose: string };
    try {
      payload = this.jwtService.verify(token);
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new HttpException('Share link has expired', HttpStatus.GONE);
      }
      throw new HttpException('Invalid share token', HttpStatus.BAD_REQUEST);
    }

    if (payload.purpose !== 'document-share') {
      throw new HttpException('Invalid share token', HttpStatus.BAD_REQUEST);
    }

    const document = await this.documentService.findByIdForShare(
      new Types.ObjectId(payload.documentId) as any,
    );

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const shouldRender = render === 'true';

    if (shouldRender) {
      let bodyHtml: string;

      switch (document.type) {
        case 'markdown':
          bodyHtml = await marked.parse(document.content);
          break;
        case 'html':
          bodyHtml = document.content;
          break;
        default:
          bodyHtml = `<pre>${escapeHtml(document.content)}</pre>`;
          break;
      }

      const html = wrapInHtmlPage(document.summary, bodyHtml);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } else {
      const mimeTypeMap: Record<string, string> = {
        html: 'text/html',
        text: 'text/plain',
        markdown: 'text/markdown',
        json: 'application/json',
      };
      const mimeType = mimeTypeMap[document.type] || 'text/plain';
      res.setHeader('Content-Type', `${mimeType}; charset=utf-8`);
      res.send(document.content);
    }
  }

  // --- Standard CRUD endpoints ---

  @Get(':id/content')
  @ApiOperation({ summary: 'Get document content with appropriate MIME type' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async getContent(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
    @Res() res: Response
  ) {
    const document = await this.documentService.findByIdWithContent(new Types.ObjectId(id) as any, context);

    if (!document) {
      throw new NotFoundException(`Document with ID ${id} not found`);
    }

    // Map document type to MIME type
    const mimeTypeMap: Record<string, string> = {
      html: 'text/html',
      text: 'text/plain',
      markdown: 'text/markdown',
      json: 'application/json',
    };

    const mimeType = mimeTypeMap[document.type] || 'text/plain';

    // Set content type and send content
    res.setHeader('Content-Type', `${mimeType}; charset=utf-8`);
    res.send(document.content);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.documentService.findById(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update document by ID' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateDocumentDto: UpdateDocumentDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.documentService.update(new Types.ObjectId(id) as any, updateDocumentDto as any, context);
  }

  @Patch(':id/content')
  @ApiOperation({
    summary: 'Update document content with advanced operations',
    description: 'Supports: replace all, find-replace text, find-replace regex, find-replace markdown section'
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async updateContent(
    @Param('id') id: string,
    @Body() updateContentDto: UpdateContentDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.documentService.updateContent(new Types.ObjectId(id) as any, updateContentDto, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete document by ID' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.documentService.softDelete(new Types.ObjectId(id) as any, context);
  }
}
