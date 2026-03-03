import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Account } from './account.schema';
import { CreateAccountDto } from './account.dto';

@Injectable()
export class AccountService extends BaseService<Account> {
  constructor(
    @InjectModel(Account.name) accountModel: Model<Account>,
  ) {
    super(accountModel as any);
  }

  async create(dto: CreateAccountDto, context: RequestContext): Promise<Partial<Account>> {
    const data = {
      ...dto,
      balance: dto.initialBalance || 0,
    };
    return super.create(data, context);
  }
}
