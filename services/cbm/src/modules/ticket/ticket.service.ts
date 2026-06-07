import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Ticket } from './ticket.schema';

@Injectable()
export class TicketService extends BaseService<Ticket> {
  constructor(@InjectModel(Ticket.name) private ticketModel: Model<Ticket>) {
    super(ticketModel);
  }

  async findAll(
    options: FindManyOptions & { search?: string },
    context: RequestContext
  ): Promise<FindManyResult<Ticket>> {
    const { search, ...rest } = options as any;
    if (search) {
      const regex = new RegExp(search, 'i');
      (rest as any).$or = [
        { category: regex },
        { content: regex },
        { 'submitter.name': regex },
        { 'submitter.phone': regex },
        { 'submitter.email': regex },
        { 'outlet.name': regex },
      ];
    }
    return super.findAll(rest, context);
  }

  async findById(id: ObjectId, context: RequestContext): Promise<Partial<Ticket>> {
    const ticket = await super.findById(id, context);
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async update(id: ObjectId, data: any, context: RequestContext): Promise<Partial<Ticket>> {
    const ticket = await super.findById(id, context);
    if (!ticket) throw new NotFoundException('Ticket not found');
    return super.update(id, data, context);
  }

  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<Ticket>> {
    const ticket = await super.findById(id, context);
    if (!ticket) throw new NotFoundException('Ticket not found');
    return super.softDelete(id, context);
  }

  async submit(data: Omit<any, 'orgId'>, orgId: string): Promise<Partial<Ticket>> {
    const publicContext: RequestContext = {
      orgId,
      userId: '',
      groupId: '',
      agentId: '',
      appId: '',
      roles: [],
    };
    return super.create(data, publicContext);
  }
}
