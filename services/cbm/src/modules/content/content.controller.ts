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
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { Response } from 'express';
import { ContentService } from './content.service';
import {
  CreateContentDto,
  UpdateContentDto,
  ContentQueryDto,
  UpdateBodyDto,
  AddAttachmentDto,
} from './content.dto';

@ApiTags('Contents')
@ApiBearerAuth()
@Controller('contents')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Post()
  @ApiOperation({ summary: 'Create new content' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createContentDto: CreateContentDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.contentService.create(createContentDto, context);
  }

  @Get()
  @ApiOperation({
    summary: 'List all contents with pagination, search, and statistics',
  })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: ContentQueryDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.contentService.findAll(query, context);
  }

  @Get(':id/full')
  @ApiOperation({
    summary: 'Get content with full body and appropriate MIME type',
  })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async getFullContent(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
    @Res() res: Response
  ) {
    const content = await this.contentService.findByIdWithContent(
      new Types.ObjectId(id) as any,
      context
    );

    if (!content) {
      throw new NotFoundException(`Content with ID ${id} not found`);
    }

    // Map content type to MIME type
    const mimeTypeMap: Record<string, string> = {
      html: 'text/html',
      text: 'text/plain',
      markdown: 'text/markdown',
      json: 'application/json',
      multipart: 'text/plain', // Default for multipart
    };

    const mimeType = mimeTypeMap[content.contentType] || 'text/plain';

    // Set content type and send body
    res.setHeader('Content-Type', `${mimeType}; charset=utf-8`);
    res.send(content.body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get content metadata by ID (without body)' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.contentService.findById(
      new Types.ObjectId(id) as any,
      context
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update content metadata by ID' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateContentDto: UpdateContentDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.contentService.update(
      new Types.ObjectId(id) as any,
      updateContentDto as any,
      context
    );
  }

  @Patch(':id/body')
  @ApiOperation({
    summary: 'Update content body with advanced operations',
    description:
      'Supports: replace all, find-replace text, find-replace regex, find-replace markdown section, append operations',
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async updateBody(
    @Param('id') id: string,
    @Body() updateBodyDto: UpdateBodyDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.contentService.updateBody(
      new Types.ObjectId(id) as any,
      updateBodyDto,
      context
    );
  }

  @Post(':id/attachments')
  @ApiOperation({
    summary: 'Add attachment to content',
    description: 'Add media attachment metadata (file upload handled separately)',
  })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async addAttachment(
    @Param('id') id: string,
    @Body() addAttachmentDto: AddAttachmentDto,
    @CurrentUser() context: RequestContext
  ) {
    const content = await this.contentService.findByIdWithContent(
      new Types.ObjectId(id) as any,
      context
    );

    if (!content) {
      throw new NotFoundException(`Content with ID ${id} not found`);
    }

    // Add uploadedAt timestamp
    const attachmentWithTimestamp = {
      ...addAttachmentDto.attachment,
      uploadedAt: new Date(),
    };

    // Add attachment to array
    const updatedAttachments = [
      ...(content.attachments || []),
      attachmentWithTimestamp,
    ];

    // Update content with new attachments
    return this.contentService.update(
      new Types.ObjectId(id) as any,
      { attachments: updatedAttachments } as any,
      context
    );
  }

  @Get(':id/attachments')
  @ApiOperation({ summary: 'List all attachments for content' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async listAttachments(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    const content = await this.contentService.findById(
      new Types.ObjectId(id) as any,
      context
    );

    if (!content) {
      throw new NotFoundException(`Content with ID ${id} not found`);
    }

    return {
      contentId: id,
      attachments: content.attachments || [],
    };
  }

  @Delete(':id/attachments/:attachmentId')
  @ApiOperation({ summary: 'Remove attachment from content' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() context: RequestContext
  ) {
    const content = await this.contentService.findByIdWithContent(
      new Types.ObjectId(id) as any,
      context
    );

    if (!content) {
      throw new NotFoundException(`Content with ID ${id} not found`);
    }

    // Filter out the attachment
    const updatedAttachments = (content.attachments || []).filter(
      (att) => att.id !== attachmentId
    );

    // Update content with filtered attachments
    return this.contentService.update(
      new Types.ObjectId(id) as any,
      { attachments: updatedAttachments } as any,
      context
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete content by ID' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.contentService.softDelete(
      new Types.ObjectId(id) as any,
      context
    );
  }
}
