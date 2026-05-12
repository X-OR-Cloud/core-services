import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser } from '@hydrabyte/base';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { FileService } from './file.service';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

@ApiTags('Files')
@Controller('files')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  /**
   * Upload a file to S3 and return the public URL.
   * Used by engineer agents (and portal) that have local file access.
   */
  @Post('upload')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  @ApiOperation({ summary: 'Upload file to S3, returns public URL' })
  @ApiConsumes('multipart/form-data')
  async upload(
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string },
    @CurrentUser() context: { orgId: string },
  ) {
    if (!file) {
      throw new BadRequestException('No file provided. Use multipart/form-data with field name "file".');
    }

    const result = await this.fileService.uploadBuffer(
      file.buffer,
      file.originalname,
      file.mimetype,
      context.orgId,
    );

    return {
      success: true,
      fileUrl: result.fileUrl,
      filename: result.filename,
      mimeType: result.mimeType,
      size: result.size,
    };
  }
}
