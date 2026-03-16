import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Organization } from '../organization/organization.schema';
import { User } from '../user/user.schema';
import { UsersService } from '../user/user.service';
import { OrganizationsService } from '../organization/organization.service';
import { UserStatuses } from '../../core/enums/user.enum';
import { PredefinedRole } from '@hydrabyte/shared';
import { SetupInitializeDto, SetupInitializeResponse, SetupStatusResponse } from './setup.dto';

@Injectable()
export class SetupService {
  constructor(
    @InjectModel(Organization.name) private readonly orgModel: Model<Organization>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly orgsService: OrganizationsService,
    private readonly usersService: UsersService,
  ) {}

  async getStatus(): Promise<SetupStatusResponse> {
    const count = await this.orgModel.countDocuments({ isDeleted: false });
    return { initialized: count > 0 };
  }

  async initialize(dto: SetupInitializeDto): Promise<SetupInitializeResponse> {
    // Guard: chỉ cho phép init một lần
    const orgCount = await this.orgModel.countDocuments({ isDeleted: false });
    if (orgCount > 0) {
      throw new ConflictException('System has already been initialized');
    }

    // System context dùng để tạo org + user (không cần orgId/userId thật)
    const systemContext = {
      userId: 'system',
      orgId: '',
      groupId: '',
      agentId: '',
      appId: '',
      roles: [PredefinedRole.UniverseOwner],
      licenses: {},
    };

    // 1. Tạo organization
    const org = await this.orgsService.create(
      { name: dto.orgName, description: dto.orgDescription ?? '' },
      systemContext,
    );
    const orgId = (org as any)._id.toString();

    // 2. Tạo admin user với role universe.owner
    const userContext = { ...systemContext, orgId };
    const user = await this.usersService.create(
      {
        username: dto.adminUsername,
        password: dto.adminPassword,
        role: PredefinedRole.UniverseOwner,
        status: UserStatuses.Active,
        fullname: dto.adminFullname,
      },
      userContext,
    );
    const userId = (user as any)._id.toString();

    return { orgId, userId, username: dto.adminUsername };
  }
}
