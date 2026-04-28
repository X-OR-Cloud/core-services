import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { EncryptionService } from '../../common/encryption.service';
import { AsteriskNode } from './nodes.schema';
import { CreateNodeDto, UpdateNodeDto } from './nodes.dto';

@Injectable()
export class NodesService extends BaseService<AsteriskNode> {
  constructor(
    @InjectModel(AsteriskNode.name) model: Model<AsteriskNode>,
    private readonly encryption: EncryptionService,
  ) {
    super(model);
  }

  private encryptSecret(dto: any): any {
    if (dto.ami?.secret) {
      return { ...dto, ami: { ...dto.ami, secret: this.encryption.encrypt(dto.ami.secret) } };
    }
    return dto;
  }

  async create(dto: CreateNodeDto, context: RequestContext): Promise<Partial<AsteriskNode>> {
    return super.create(this.encryptSecret(dto), context);
  }

  async update(id: string, dto: UpdateNodeDto, context: RequestContext): Promise<Partial<AsteriskNode>> {
    return super.update(id, this.encryptSecret(dto), context);
  }

  async getCredentials(nodeId: string): Promise<{ port: number; username: string; secret: string }> {
    const node = await this.model.findById(nodeId).select('+ami.secret').lean();
    if (!node) throw new NotFoundException('Node not found');
    return {
      port: (node as any).ami.port,
      username: (node as any).ami.username,
      secret: this.encryption.decrypt((node as any).ami.secret),
    };
  }

  async updateStatus(nodeId: string, status: 'online' | 'offline' | 'error'): Promise<void> {
    await this.model.findByIdAndUpdate(nodeId, { status });
  }
}
