import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { AmiCommandsProducer } from '../../queues/producers/ami-commands.producer';
import { Dialplan } from './dialplans.schema';
import { CreateDialplanDto, UpdateDialplanDto } from './dialplans.dto';

@Injectable()
export class DialplansService extends BaseService<Dialplan> {
  constructor(
    @InjectModel(Dialplan.name) model: Model<Dialplan>,
    private readonly amiCommands: AmiCommandsProducer,
  ) {
    super(model);
  }

  async create(dto: CreateDialplanDto, context: RequestContext): Promise<Partial<Dialplan>> {
    const dialplan = await super.create(dto, context);
    await this.amiCommands.enqueue({ type: 'syncDialplan', dialplanId: String(dialplan['_id']), nodeId: dto.nodeId });
    return dialplan;
  }

  async update(id: string, dto: UpdateDialplanDto, context: RequestContext): Promise<Partial<Dialplan>> {
    const dialplan = await super.update(id, dto, context);
    await this.amiCommands.enqueue({ type: 'syncDialplan', dialplanId: id, nodeId: String(dialplan['nodeId']) });
    return dialplan;
  }

  async softDelete(id: string, context: RequestContext): Promise<Partial<Dialplan>> {
    const dialplan = await super.softDelete(id, context);
    await this.amiCommands.enqueue({ type: 'syncDialplan', dialplanId: id, nodeId: String(dialplan['nodeId']) });
    return dialplan;
  }
}
