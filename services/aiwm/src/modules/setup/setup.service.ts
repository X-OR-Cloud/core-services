import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigKey } from '@hydrabyte/shared';
import { Configuration } from '../configuration/configuration.schema';
import { ConfigurationService } from '../configuration/configuration.service';
import { SetupInitializeDto, SetupInitializeResponse, SetupStatusResponse } from './setup.dto';

@Injectable()
export class SetupService {
  constructor(
    @InjectModel(Configuration.name) private readonly configModel: Model<Configuration>,
    private readonly configurationService: ConfigurationService,
  ) {}

  async getStatus(orgId?: string): Promise<SetupStatusResponse> {
    const filter: any = { isDeleted: false };
    if (orgId) filter['owner.orgId'] = orgId;

    const count = await this.configModel.countDocuments(filter);
    return { initialized: count > 0, orgId };
  }

  async initialize(dto: SetupInitializeDto): Promise<SetupInitializeResponse> {
    const { orgId, userId } = dto;

    // Guard: chỉ cho phép init một lần cho org này
    const existing = await this.configModel.countDocuments({
      'owner.orgId': orgId,
      isDeleted: false,
    });
    if (existing > 0) {
      throw new ConflictException(`AIWM has already been initialized for org ${orgId}`);
    }

    const systemContext = {
      userId,
      orgId,
      groupId: '',
      agentId: '',
      appId: '',
      roles: [],
      licenses: {},
    };

    // 1. Khởi tạo tất cả keys với giá trị rỗng
    const result = await this.configurationService.initializeAll(systemContext);

    // 2. Upsert 6 service URL keys với giá trị thực
    const urlMappings: Array<{ key: ConfigKey; value: string }> = [
      { key: ConfigKey.IAM_BASE_API_URL, value: dto.serviceUrls.iamBaseApiUrl },
      { key: ConfigKey.AIWM_BASE_API_URL, value: dto.serviceUrls.aiwmBaseApiUrl },
      { key: ConfigKey.AIWM_BASE_MCP_URL, value: dto.serviceUrls.aiwmBaseMcpUrl },
      { key: ConfigKey.AIWM_BASE_WS_URL, value: dto.serviceUrls.aiwmBaseWsUrl },
      { key: ConfigKey.CBM_BASE_API_URL, value: dto.serviceUrls.cbmBaseApiUrl },
      { key: ConfigKey.MONA_BASE_API_URL, value: dto.serviceUrls.monaBaseApiUrl },
    ];

    for (const { key, value } of urlMappings) {
      await this.configurationService.createOrUpdate({ key, value }, systemContext);
    }

    return {
      orgId,
      total: result.total,
      created: result.created,
      skipped: result.skipped,
    };
  }
}
