import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { EncryptionService } from '../../common/encryption.service';
import { AmiCommandsProducer } from '../../queues/producers/ami-commands.producer';
import { Trunk } from './trunks.schema';
import { CreateTrunkDto, UpdateTrunkDto } from './trunks.dto';

@Injectable()
export class TrunksService extends BaseService<Trunk> {
  constructor(
    @InjectModel(Trunk.name) model: Model<Trunk>,
    private readonly encryption: EncryptionService,
    private readonly amiCommands: AmiCommandsProducer,
  ) {
    super(model);
  }

  private encryptPassword(dto: any): any {
    if (dto.password) {
      return { ...dto, password: this.encryption.encrypt(dto.password) };
    }
    return dto;
  }

  async create(dto: CreateTrunkDto, context: RequestContext): Promise<Partial<Trunk>> {
    const trunk = await super.create(this.encryptPassword(dto), context);
    await this.amiCommands.enqueue({ type: 'syncTrunk', trunkId: String(trunk['_id']), nodeId: dto.nodeId });
    return trunk;
  }

  async update(id: string, dto: UpdateTrunkDto, context: RequestContext): Promise<Partial<Trunk>> {
    const trunk = await super.update(id, this.encryptPassword(dto), context);
    await this.amiCommands.enqueue({ type: 'syncTrunk', trunkId: id, nodeId: String(trunk['nodeId']) });
    return trunk;
  }

  async softDelete(id: string, context: RequestContext): Promise<Partial<Trunk>> {
    const trunk = await super.softDelete(id, context);
    await this.amiCommands.enqueue({ type: 'syncTrunk', trunkId: id, nodeId: String(trunk['nodeId']) });
    return trunk;
  }

  async updateStatus(trunkId: string, status: 'registered' | 'unregistered' | 'unknown'): Promise<void> {
    await this.model.findByIdAndUpdate(trunkId, { status });
  }
}
