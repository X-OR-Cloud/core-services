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
import { FileService } from './file.service';

@ApiTags('Files')
@Controller('files')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  /**
   * Upload a file to S3 and return the public URL.
   * Used by engineer agents (and portal) that have local file access.
   */
  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload file to S3, returns public URL' })
  @ApiConsumes('multipart/form-data')
  async upload(@UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string }) {
    if (!file) {
      throw new BadRequestException('No file provided. Use multipart/form-data with field name "file".');
    }

    const result = await this.fileService.uploadBuffer(
      file.buffer,
      file.originalname,
      file.mimetype,
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
