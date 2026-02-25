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
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
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
import { Types } from 'mongoose';
import { Response } from 'express';
import { DocumentService } from './document.service';
import { CreateDocumentDto, UpdateDocumentDto, UpdateContentDto } from './document.dto';

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

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
