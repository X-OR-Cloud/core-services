import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ConfigKey } from '@hydrabyte/shared';
import { ConfigService } from '../configuration/config.service';
import { randomUUID } from 'crypto';
import { extname } from 'path';

export interface UploadResult {
  fileUrl: string;
  filename: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Upload a buffer to S3-compatible storage.
   * Used internally by assistant agents and the REST upload endpoint.
   */
  async uploadBuffer(
    buffer: Buffer,
    originalFilename: string,
    mimeType: string,
  ): Promise<UploadResult> {
    const endpoint = await this.configService.getString(ConfigKey.S3_ENDPOINT);
    const accessKey = await this.configService.getString(ConfigKey.S3_ACCESS_KEY);
    const secretKey = await this.configService.getString(ConfigKey.S3_SECRET_KEY);
    const bucket = await this.configService.getString(ConfigKey.S3_BUCKET_FILES);
    const region = await this.configService.getOrDefault(ConfigKey.S3_REGION, 'us-east-1');
    const useSSL = await this.configService.getBoolean(ConfigKey.S3_USE_SSL);

    if (!endpoint || !accessKey || !secretKey || !bucket) {
      throw new Error('S3 storage is not configured. Please set s3.endpoint, s3.access_key, s3.secret_key, and s3.bucket.files in Configuration.');
    }

    const s3 = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle: true, // required for MinIO
      tls: useSSL ?? true,
    });

    const ext = extname(originalFilename) || this._mimeToExt(mimeType);
    const key = `chat-files/${randomUUID()}${ext}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ContentLength: buffer.length,
      }),
    );

    // Build public URL — strip trailing slash from endpoint
    const baseUrl = endpoint.replace(/\/$/, '');
    const fileUrl = `${baseUrl}/${bucket}/${key}`;

    this.logger.debug(`[S3] uploaded key=${key} size=${buffer.length} mimeType=${mimeType}`);

    return { fileUrl, filename: originalFilename, mimeType, size: buffer.length };
  }

  /**
   * Upload from base64 string.
   */
  async uploadBase64(
    base64: string,
    filename: string,
    mimeType: string,
  ): Promise<UploadResult> {
    const buffer = Buffer.from(base64, 'base64');
    return this.uploadBuffer(buffer, filename, mimeType);
  }

  private _mimeToExt(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
      'text/plain': '.txt',
      'video/mp4': '.mp4',
      'audio/mpeg': '.mp3',
    };
    return map[mimeType] ?? '.bin';
  }
}
