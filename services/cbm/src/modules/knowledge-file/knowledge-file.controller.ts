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
import type { Multer } from 'multer';
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
    file: Multer.File,
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
