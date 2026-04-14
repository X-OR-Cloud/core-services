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
  BadRequestException,
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
import { FileService } from './file.service';
import { UploadFileDto } from './file.dto';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

@ApiTags('Files - Test')
@Controller('files/test')
export class FileTestController {
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
}

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Post()
  @ApiOperation({ summary: 'Upload a file with a specific purpose (multipart/form-data)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'purpose'],
      properties: {
        file: { type: 'string', format: 'binary' },
        purpose: { type: 'string', enum: ['knowledge', 'attachment', 'avatar', 'cover', 'other'] },
        ownerKind: { type: 'string', enum: ['knowledge-collection', 'document', 'work', 'project', 'user', 'organization'] },
        ownerId: { type: 'string' },
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
    @Body() dto: UploadFileDto,
    @CurrentUser() context: RequestContext,
  ) {
    if (dto.ownerKind && !dto.ownerId) {
      throw new BadRequestException('ownerId is required when ownerKind is set');
    }
    if (dto.purpose === 'knowledge' && dto.ownerKind !== 'knowledge-collection') {
      throw new BadRequestException("purpose='knowledge' requires ownerKind='knowledge-collection' with a valid collectionId");
    }
    return this.fileService.uploadFile(
      file,
      {
        purpose: dto.purpose,
        ownerKind: dto.ownerKind,
        ownerId: dto.ownerId,
        name: dto.name,
      },
      context,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List files (excludes rawContent and storageKey)' })
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
  @ApiOperation({ summary: 'Get file by ID (includes rawContent for knowledge files)' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.fileService.findById(new Types.ObjectId(id) as any, context);
  }

  @Get(':id/url')
  @ApiOperation({ summary: 'Get a short-lived signed URL to download the file' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async getUrl(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.fileService.getSignedUrl(id, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete file (S3 object retained for undelete window)' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.fileService.deleteFile(id, context);
  }

  @Post(':id/reindex')
  @ApiOperation({ summary: 'Reindex a knowledge file (resets embeddingStatus to pending)' })
  @UseGuards(JwtAuthGuard)
  async reindex(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.fileService.reindex(id, context);
  }
}
