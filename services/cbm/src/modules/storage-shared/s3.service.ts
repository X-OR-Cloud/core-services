import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

export type StorageDriver = 's3' | 'local';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private client: S3Client | null = null;
  private readonly driver: StorageDriver;
  private readonly endpoint: string;
  private readonly region: string;
  private readonly bucket: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly useSSL: boolean;
  private readonly presignExpires: number;

  constructor() {
    this.driver = (process.env.CBM_STORAGE_DRIVER as StorageDriver) || 's3';
    this.endpoint = process.env.CBM_S3_ENDPOINT || '';
    this.region = process.env.CBM_S3_REGION || 'us-east-1';
    this.bucket = process.env.CBM_S3_BUCKET || '';
    this.accessKey = process.env.CBM_S3_ACCESS_KEY || '';
    this.secretKey = process.env.CBM_S3_SECRET_KEY || '';
    this.useSSL = (process.env.CBM_S3_USE_SSL ?? 'true') !== 'false';
    this.presignExpires = parseInt(process.env.CBM_S3_PRESIGN_EXPIRES || '3600', 10);
  }

  getDriver(): StorageDriver {
    return this.driver;
  }

  getBucket(): string {
    return this.bucket;
  }

  private getClient(): S3Client {
    if (this.client) return this.client;
    if (!this.endpoint || !this.bucket || !this.accessKey || !this.secretKey) {
      throw new InternalServerErrorException(
        'S3 storage is not configured. Set CBM_S3_ENDPOINT, CBM_S3_BUCKET, CBM_S3_ACCESS_KEY, CBM_S3_SECRET_KEY.',
      );
    }
    this.client = new S3Client({
      endpoint: this.endpoint,
      region: this.region,
      credentials: { accessKeyId: this.accessKey, secretAccessKey: this.secretKey },
      forcePathStyle: true,
      tls: this.useSSL,
    });
    return this.client;
  }

  async upload(buffer: Buffer, key: string, mimeType: string): Promise<{ key: string; bucket: string }> {
    const client = this.getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ContentLength: buffer.length,
      }),
    );
    this.logger.debug(`[S3] uploaded key=${key} size=${buffer.length} mimeType=${mimeType}`);
    return { key, bucket: this.bucket };
  }

  async delete(key: string): Promise<void> {
    const client = this.getClient();
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    this.logger.debug(`[S3] deleted key=${key}`);
  }

  async presignGetUrl(key: string, expiresIn?: number): Promise<string> {
    const client = this.getClient();
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(client, command, { expiresIn: expiresIn ?? this.presignExpires });
  }

  async getBuffer(key: string): Promise<Buffer> {
    const client = this.getClient();
    const result = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const stream = result.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  buildKey(orgId: string, purpose: string, fileId: string, originalFileName: string): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const sanitized = originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${orgId || 'default'}/${purpose}/${yyyy}/${mm}/${fileId}_${sanitized}`;
  }

  getPresignExpires(): number {
    return this.presignExpires;
  }
}
