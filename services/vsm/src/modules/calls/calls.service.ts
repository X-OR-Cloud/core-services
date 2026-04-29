import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AmiCommandsProducer } from '../../queues/producers/ami-commands.producer';
import { Call } from './calls.schema';
import { OriginateCallDto, ScheduleAutoCallDto } from './calls.dto';

@Injectable()
export class CallsService extends BaseService<Call> {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly presignTtl: number;

  constructor(
    @InjectModel(Call.name) model: Model<Call>,
    private readonly amiCommands: AmiCommandsProducer,
  ) {
    super(model);

    this.s3 = new S3Client({
      endpoint: process.env['S3_ENDPOINT'],
      region: process.env['S3_REGION'] || 'us-east-1',
      credentials: {
        accessKeyId: process.env['S3_ACCESS_KEY'] || '',
        secretAccessKey: process.env['S3_SECRET_KEY'] || '',
      },
      forcePathStyle: true,
    });
    this.bucket = process.env['S3_BUCKET'] || 'vsm-recordings';
    this.presignTtl = parseInt(process.env['S3_PRESIGN_TTL'] || '900', 10);
  }

  async originate(dto: OriginateCallDto, context: RequestContext): Promise<Partial<Call>> {
    const call = await super.create(
      {
        nodeId: new Types.ObjectId(dto.nodeId),
        fromAccountId: new Types.ObjectId(dto.fromAccountId),
        fromNumber: dto.fromNumber,
        toNumber: dto.toNumber,
        trunkId: dto.trunkId ? new Types.ObjectId(dto.trunkId) : undefined,
        direction: 'outbound',
        mode: dto.mode,
        result: 'queued',
        startedAt: new Date(),
      },
      context,
    );

    await this.amiCommands.enqueue({
      type: 'originate',
      callId: String(call['_id']),
      nodeId: dto.nodeId,
      fromAccountId: dto.fromAccountId,
      fromNumber: dto.fromNumber,
      toNumber: dto.toNumber,
      trunkId: dto.trunkId,
      dialplanContext: dto.dialplanContext,
    });

    return call;
  }

  async scheduleAuto(dto: ScheduleAutoCallDto, context: RequestContext): Promise<Partial<Call>> {
    const scheduledAt = new Date(dto.scheduledAt);
    const delay = Math.max(0, scheduledAt.getTime() - Date.now());

    const call = await super.create(
      {
        nodeId: new Types.ObjectId(dto.nodeId),
        fromAccountId: new Types.ObjectId(dto.fromAccountId),
        fromNumber: dto.fromNumber,
        toNumber: dto.toNumber,
        trunkId: dto.trunkId ? new Types.ObjectId(dto.trunkId) : undefined,
        direction: 'outbound',
        mode: 'auto',
        result: 'queued',
      },
      context,
    );

    await this.amiCommands.enqueue(
      {
        type: 'originate',
        callId: String(call['_id']),
        nodeId: dto.nodeId,
        fromAccountId: dto.fromAccountId,
        fromNumber: dto.fromNumber,
        toNumber: dto.toNumber,
        trunkId: dto.trunkId,
        dialplanContext: dto.dialplanContext,
      },
      { delay },
    );

    return call;
  }

  async getRecordingUrl(id: string, context: RequestContext): Promise<{ url: string; expiresIn: number }> {
    const call = await this.findById(id as any, context);
    if (!(call as any).recordingFile) throw new NotFoundException('No recording available for this call');

    const command = new GetObjectCommand({ Bucket: this.bucket, Key: (call as any).recordingFile });
    const url = await getSignedUrl(this.s3, command, { expiresIn: this.presignTtl });
    return { url, expiresIn: this.presignTtl };
  }

  async createFromCdr(data: {
    nodeId: string;
    asteriskUniqueId: string;
    fromNumber: string;
    toNumber: string;
    direction: string;
    result: string;
    duration: number;
    answeredDuration: number;
    startedAt: Date;
    answeredAt?: Date;
    endedAt?: Date;
    recordingFile?: string;
    fromAccountId?: string;
    toAccountId?: string;
    trunkId?: string;
  }): Promise<any> {
    const doc: any = {
      nodeId: new Types.ObjectId(data.nodeId),
      asteriskUniqueId: data.asteriskUniqueId,
      fromNumber: data.fromNumber,
      toNumber: data.toNumber,
      direction: data.direction,
      result: data.result,
      duration: data.duration,
      answeredDuration: data.answeredDuration,
      startedAt: data.startedAt,
      answeredAt: data.answeredAt,
      endedAt: data.endedAt,
      recordingFile: data.recordingFile,
    };
    if (data.fromAccountId) doc.fromAccountId = new Types.ObjectId(data.fromAccountId);
    if (data.toAccountId) doc.toAccountId = new Types.ObjectId(data.toAccountId);
    if (data.trunkId) doc.trunkId = new Types.ObjectId(data.trunkId);

    const created = await this.model.create(doc);
    return created.toObject();
  }

  async updateByUniqueId(asteriskUniqueId: string, update: Partial<Call>): Promise<void> {
    await this.model.findOneAndUpdate({ asteriskUniqueId }, update);
  }

  async findByUniqueId(asteriskUniqueId: string): Promise<any> {
    return this.model.findOne({ asteriskUniqueId }).lean();
  }

  /** Aggregate call stats for an org — total, by result, by direction */
  async getStats(orgId: string): Promise<any> {
    const match = { 'owner.orgId': orgId, isDeleted: false };

    const [totals, byResult, byDirection] = await Promise.all([
      this.model.countDocuments(match),
      this.model.aggregate([
        { $match: match },
        { $group: { _id: '$result', count: { $sum: 1 } } },
      ]),
      this.model.aggregate([
        { $match: match },
        { $group: { _id: '$direction', count: { $sum: 1 } } },
      ]),
    ]);

    return {
      total: totals,
      byResult: Object.fromEntries(byResult.map((r: any) => [r._id, r.count])),
      byDirection: Object.fromEntries(byDirection.map((r: any) => [r._id, r.count])),
    };
  }
}
