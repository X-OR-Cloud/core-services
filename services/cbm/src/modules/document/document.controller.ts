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
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  Res,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileService } from '../file/file.service';
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
    private readonly fileService: FileService,
    private readonly configService: ConfigService,
  ) {}

  // --- Notion-lite extension endpoints ---

  @Post(':id/attachments')
  @ApiOperation({ summary: 'Upload an attachment (image/video/file) to a document' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        name: { type: 'string' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 })],
      }),
    )
    file: Express.Multer.File,
    @Body('name') name: string | undefined,
    @CurrentUser() context: RequestContext,
  ) {
    // Verify document exists + caller has write access before uploading
    const doc = await this.documentService.findById(
      new Types.ObjectId(id) as any,
      context,
    );
    if (!doc) throw new NotFoundException(`Document with ID ${id} not found`);
    await this.documentService.assertCanWriteDocument(doc, context);

    const uploaded = await this.fileService.uploadFile(
      file,
      {
        purpose: 'attachment',
        ownerKind: 'document',
        ownerId: id,
        name,
      },
      context,
    );

    const fileId = (uploaded as any)._id?.toString();
    const placeholder = `file:${fileId}`;
    const kind = file.mimetype.startsWith('video/')
      ? 'video'
      : file.mimetype.startsWith('image/')
        ? 'image'
        : 'file';

    return {
      fileId,
      placeholder,
      kind,
      name: (uploaded as any).name,
      fileName: (uploaded as any).fileName,
      mimeType: (uploaded as any).mimeType,
      fileSize: (uploaded as any).fileSize,
    };
  }

  @Post(':id/commit')
  @ApiOperation({
    summary:
      'Commit the collaborative draft into the document content. Send `content` with the serialized editor markdown (via blocksToMarkdownLossy).',
  })
  @UseGuards(JwtAuthGuard)
  async commit(
    @Param('id') id: string,
    @Body() body: { content?: string },
    @CurrentUser() context: RequestContext,
  ) {
    return this.documentService.commitDraft(
      new Types.ObjectId(id) as any,
      body,
      context,
    );
  }

  @Get(':id/session-status')
  @ApiOperation({
    summary: 'Get the realtime collaboration session status (draft flag + active editor count)',
  })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async getSessionStatus(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.documentService.getSessionStatus(
      new Types.ObjectId(id) as any,
      context,
    );
  }

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
    const ttl = dto.ttl || 3600;
    const { shareId, expiresAt } = await this.documentService.createShareLink(
      new Types.ObjectId(id) as any,
      ttl,
      context,
    );

    const port = this.configService.get<string>('PORT') || '3004';
    const baseUrl =
      this.configService.get<string>('CBM_BASE_URL') || `http://localhost:${port}`;

    return {
      shareId,
      url: `${baseUrl}/documents/shared/${shareId}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  @Delete(':id/share/:shareId')
  @ApiOperation({ summary: 'Revoke a share link' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async revokeShareLink(
    @Param('id') id: string,
    @Param('shareId') shareId: string,
    @CurrentUser() context: RequestContext,
  ) {
    await this.documentService.revokeShareLink(
      new Types.ObjectId(id) as any,
      shareId,
      context,
    );
    return { revoked: true, shareId };
  }

  @Get(':id/shares')
  @ApiOperation({ summary: 'List all share links for a document' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async listShareLinks(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.documentService.listShareLinks(
      new Types.ObjectId(id) as any,
      context,
    );
  }

  @Get('shared/:shareId')
  @ApiOperation({
    summary: 'View shared document via shareId (public, no auth required)',
  })
  @ApiResponse({ status: 200, description: 'Document content returned' })
  @ApiResponse({ status: 403, description: 'Share link expired or revoked' })
  @ApiResponse({ status: 404, description: 'Share link or document not found' })
  async viewShared(
    @Param('shareId') shareId: string,
    @Query('render') render: string,
    @Res() res: Response,
  ) {
    const document = await this.documentService.findByShareId(shareId);

    const isRaw = render === 'raw';

    if (isRaw) {
      const mimeTypeMap: Record<string, string> = {
        html: 'text/html',
        text: 'text/plain',
        markdown: 'text/markdown',
        json: 'application/json',
      };
      const mimeType = mimeTypeMap[document.type] || 'text/plain';
      res.setHeader('Content-Type', `${mimeType}; charset=utf-8`);
      res.send(document.content);
    } else {
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

  @Patch(':id/embedding')
  @ApiOperation({
    summary: 'Enable/disable RAG embedding for a document, assign to a KnowledgeCollection',
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async updateEmbedding(
    @Param('id') id: string,
    @Body()
    body: {
      embeddingEnabled: boolean;
      knowledgeCollectionId?: string;
    },
    @CurrentUser() context: RequestContext,
  ) {
    const updateData: Record<string, any> = {
      embeddingEnabled: body.embeddingEnabled,
    };

    if (body.embeddingEnabled) {
      if (body.knowledgeCollectionId) {
        updateData.knowledgeCollectionId = body.knowledgeCollectionId;
      }
      updateData.embeddingStatus = 'pending';
    } else {
      // Disabling: clear embedding fields
      updateData.embeddingStatus = null;
      updateData.knowledgeCollectionId = null;
    }

    return this.documentService.update(
      new Types.ObjectId(id) as any,
      updateData,
      context,
    );
  }
}
