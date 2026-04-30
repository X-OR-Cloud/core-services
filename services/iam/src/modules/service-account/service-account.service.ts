import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { sign } from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { BaseService } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { ServiceAccount } from './service-account.schema';
import { CreateServiceAccountDto } from './dto/create-service-account.dto';
import { UpdateServiceAccountDto } from './dto/update-service-account.dto';
import { TokenRequestDto } from './dto/token-request.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class ServiceAccountService extends BaseService<ServiceAccount> {
  constructor(
    @InjectModel(ServiceAccount.name) private readonly saModel: Model<ServiceAccount>,
  ) {
    super(saModel as any);
  }

  async create(dto: CreateServiceAccountDto, context: RequestContext): Promise<any> {
    const rawSecret = crypto.randomBytes(32).toString('hex');
    const hashedSecret = await bcrypt.hash(rawSecret, SALT_ROUNDS);

    const record = await super.create({ ...dto, secret: hashedSecret }, context);

    // Return rawSecret only once — not stored in plain text
    return { ...record, secret: rawSecret };
  }

  async update(id: string, dto: UpdateServiceAccountDto, context: RequestContext): Promise<Partial<ServiceAccount>> {
    return super.update(id as any, dto, context);
  }

  async issueToken(dto: TokenRequestDto): Promise<{ accessToken: string; expiresIn: number }> {
    const record = await this.saModel.findOne({
      _id: dto.clientId,
      isDeleted: false,
      status: 'active',
    }).lean();

    if (!record) {
      throw new UnauthorizedException('Invalid client credentials');
    }

    const isMatch = await bcrypt.compare(dto.secret, record.secret);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid client credentials');
    }

    const expiresInStr = process.env['SA_JWT_EXPIRES_IN'] || '4h';
    const expiresInSeconds = this.parseExpiresIn(expiresInStr);
    const jwtSecret = process.env['JWT_SECRET'] || 'R4md0m_S3cr3t';

    // @ts-expect-error - TypeScript has issues with jsonwebtoken types
    const accessToken = sign(
      {
        sub: `sa:${record._id}`,
        orgId: record.owner?.orgId || '',
        type: 'service_account',
        permissions: record.permissions || [],
      },
      jwtSecret,
      { expiresIn: expiresInStr },
    );

    await this.saModel.updateOne({ _id: record._id }, { $set: { lastUsedAt: new Date() } });

    return { accessToken, expiresIn: expiresInSeconds };
  }

  private parseExpiresIn(value: string): number {
    const match = value.match(/^(\d+)(h|m|s)?$/);
    if (!match) return 14400; // default 4h
    const num = parseInt(match[1], 10);
    const unit = match[2] || 's';
    if (unit === 'h') return num * 3600;
    if (unit === 'm') return num * 60;
    return num;
  }
}
