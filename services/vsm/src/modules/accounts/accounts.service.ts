import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { EncryptionService } from '../../common/encryption.service';
import { AmiCommandsProducer } from '../../queues/producers/ami-commands.producer';
import { Account } from './accounts.schema';
import { CreateAccountDto, UpdateAccountDto } from './accounts.dto';

@Injectable()
export class AccountsService extends BaseService<Account> {
  constructor(
    @InjectModel(Account.name) model: Model<Account>,
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

  async create(dto: CreateAccountDto, context: RequestContext): Promise<Partial<Account>> {
    const account = await super.create(this.encryptPassword(dto), context);
    await this.amiCommands.enqueue({ type: 'syncAccount', accountId: String(account['_id']), nodeId: dto.nodeId });
    return account;
  }

  async update(id: string, dto: UpdateAccountDto, context: RequestContext): Promise<Partial<Account>> {
    const account = await super.update(id, this.encryptPassword(dto), context);
    await this.amiCommands.enqueue({ type: 'syncAccount', accountId: id, nodeId: String(account['nodeId']) });
    return account;
  }

  async softDelete(id: string, context: RequestContext): Promise<Partial<Account>> {
    const account = await super.softDelete(id, context);
    await this.amiCommands.enqueue({ type: 'syncAccount', accountId: id, nodeId: String(account['nodeId']) });
    return account;
  }

  async updateStatus(accountId: string, status: 'registered' | 'unregistered' | 'unknown'): Promise<void> {
    await this.model.findByIdAndUpdate(accountId, { status });
  }

  async updateState(accountId: string, state: 'idle' | 'ringing' | 'in_call' | 'unknown'): Promise<void> {
    await this.model.findByIdAndUpdate(accountId, { state });
  }
}
