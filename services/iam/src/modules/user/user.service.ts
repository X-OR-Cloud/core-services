import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { User } from './user.schema';
import { PasswordHashAlgorithms } from '../../core/enums/other.enum';
import {
  encodeBase64,
  hashPasswordWithAlgorithm,
} from '../../core/utils/encryption.util';
import { CreateUserData, ChangePasswordDto, ChangeRoleDto, CreateGoogleUserData } from './user.dto';
import { AuthProvider } from '../../core/enums/auth-provider.enum';
@Injectable()
export class UsersService extends BaseService<User> {

  constructor(@InjectModel(User.name) userModel: Model<User>) {
    super(userModel);
  }

  /**
   * Check if caller (organization-level) is trying to act on a universe-level user.
   * Throws ForbiddenException if so.
   */
  private assertNotEscalatingPrivilege(callerRoles: string[], targetRole: string): void {
    const callerIsOrgLevel = callerRoles?.some(r => r.startsWith('organization.'));
    const targetIsUniverseLevel = targetRole?.startsWith('universe.');

    if (callerIsOrgLevel && !callerRoles?.some(r => r.startsWith('universe.')) && targetIsUniverseLevel) {
      throw new ForbiddenException('Organization-level users cannot modify universe-level users');
    }
  }

   /**
   * Override findAll to handle statistics aggregation
   */
  async findAll(
    options: FindManyOptions,
    context: RequestContext
  ): Promise<FindManyResult<User>> {
    if (options.filter) {
      if (options.filter['fullname']) {
        options.filter['fullname'] = { $regex: options.filter['fullname'], $options: 'i' };
      }
      if (options.filter['address']) {
        options.filter['address'] = { $regex: options.filter['address'], $options: 'i' };
      }
    }
    const findResult = await super.findAll(options, context);
    // Aggregate statistics by status
    const statusStats = await super.aggregate(
      [
        { $match: { ...options.filter } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ],
      context
    );

    // Build statistics object
    const statistics: any = {
      total: findResult.pagination.total,
      byStatus: {},
    };

    // Map status statistics
    statusStats.forEach((stat: any) => {
      statistics.byStatus[stat._id] = stat.count;
    });

    findResult.statistics = statistics;
    return findResult;
  }

  async create(data: CreateUserData, context: RequestContext): Promise<Partial<User>> {
    const user = new User();
    user.username = data.username;
    user.password = {
      hashedValue: '',
      algorithm: PasswordHashAlgorithms.BCrypt,
      ref: `r${encodeBase64(data.password)}`,
    };
    user.status = data.status;
    user.password.hashedValue = await hashPasswordWithAlgorithm(
      data.password,
      user.password.algorithm
    );
    user.owner = {
      orgId: context.orgId,
      groupId: context.groupId,
      userId: context.userId,
      agentId: '',
      appId: '',
    };
    user.role = data.role;
    return await super.create(user, context);
  }

  /**
   * Override update to prevent org-level users from modifying universe-level users
   */
  async update(
    id: ObjectId,
    data: Partial<User>,
    context: RequestContext
  ): Promise<User | null> {
    const targetUser = await this.model.findById(id).exec();
    if (!targetUser) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    this.assertNotEscalatingPrivilege(context.roles, targetUser.role);

    return super.update(id, data, context);
  }

  /**
   * Override softDelete to prevent self-deletion, protect last org owner,
   * and prevent org-level users from deleting universe-level users
   */
  async softDelete(
    id: ObjectId,
    context: RequestContext
  ): Promise<User | null> {
    this.logger.debug('User soft delete requested', {
      targetUserId: id.toString(),
      currentUserId: context.userId,
    });

    // Prevent user from deleting themselves
    if (id.toString() === context.userId) {
      this.logger.warn('Self-deletion attempt blocked', {
        userId: context.userId,
      });
      throw new ForbiddenException('Self-deletion is not allowed for security reasons');
    }

    // Find the target user
    const targetUser = await this.model.findById(id).exec();

    if (targetUser) {
      // Prevent org-level from acting on universe-level
      this.assertNotEscalatingPrivilege(context.roles, targetUser.role);
    }

    if (targetUser && targetUser.role === 'organization.owner') {
      // Count how many organization owners exist in this org
      const orgOwnerCount = await this.model.countDocuments({
        'owner.orgId': context.orgId,
        role: 'organization.owner',
        isDeleted: false,
      }).exec();

      if (orgOwnerCount <= 1) {
        this.logger.warn('Attempted to delete last organization owner', {
          targetUserId: id.toString(),
          currentUserId: context.userId,
          orgId: context.orgId,
        });
        throw new ForbiddenException(
          'Cannot delete the last organization owner. Please assign another owner first.'
        );
      }
    }

    // Call parent softDelete method
    return super.softDelete(id, context);
  }

  /**
   * Change role for a specific user
   * Only organization.owner or universe.owner can change roles
   * organization.owner can only change organization-level users in their org
   */
  async changeRole(
    userId: ObjectId,
    changeRoleDto: ChangeRoleDto,
    context: RequestContext
  ): Promise<User> {
    // Check caller is organization.owner or universe.owner
    const hasOwnerRole = context.roles?.some(role =>
      role === 'organization.owner' || role === 'universe.owner'
    );
    if (!hasOwnerRole) {
      throw new ForbiddenException('Only organization owner can change user roles');
    }

    const user = await this.model.findById(userId).exec();
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Prevent org-level from acting on universe-level
    this.assertNotEscalatingPrivilege(context.roles, user.role);

    // Check same organization
    if (user.owner.orgId !== context.orgId) {
      throw new ForbiddenException('You can only change roles for users in your organization');
    }

    // Prevent changing own role
    if (userId.toString() === context.userId) {
      throw new ForbiddenException('You cannot change your own role');
    }

    user.role = changeRoleDto.role;
    return user.save();
  }

  /**
   * Change password for a specific user
   * Only organization.owner can change password for users in their organization
   */
  async changePassword(
    userId: ObjectId,
    changePasswordDto: ChangePasswordDto,
    context: RequestContext
  ): Promise<User> {
    // Check if current user has organization.owner role
    const hasOrgOwnerRole = context.roles?.some(role =>
      role === 'organization.owner' || role === 'universe.owner'
    );

    if (!hasOrgOwnerRole) {
      throw new ForbiddenException('Only organization owner can change user passwords');
    }

    // Find the target user
    const user = await this.model.findById(userId).exec();
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Prevent org-level from acting on universe-level
    this.assertNotEscalatingPrivilege(context.roles, user.role);

    // Check if target user belongs to the same organization
    if (user.owner.orgId !== context.orgId) {
      throw new ForbiddenException('You can only change passwords for users in your organization');
    }

    // Hash the new password
    const hashedPassword = await hashPasswordWithAlgorithm(
      changePasswordDto.newPassword,
      PasswordHashAlgorithms.BCrypt
    );

    // Update the password
    user.password = {
      hashedValue: hashedPassword,
      algorithm: PasswordHashAlgorithms.BCrypt,
      ref: `r${encodeBase64(changePasswordDto.newPassword)}`,
    };

    // Save and return updated user
    const updatedUser = await user.save();
    return updatedUser;
  }

  /**
   * Find a user by their Google ID
   * @param googleId - Google account ID
   * @returns User document or null
   */
  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.model.findOne({ googleId, isDeleted: false }).exec();
  }

  /**
   * Find a user by username (email)
   * @param username - Username (email address)
   * @returns User document or null
   */
  async findByUsername(username: string): Promise<User | null> {
    return this.model.findOne({ username, isDeleted: false }).exec();
  }

  /**
   * Create a new Google SSO user with password = null
   * @param data - Google user data
   * @returns Created user document
   */
  async createGoogleUser(data: CreateGoogleUserData): Promise<User> {
    const user = new this.model({
      username: data.username,
      password: null,
      provider: data.provider,
      googleId: data.googleId,
      fullname: data.fullname || data.username,
      avatarUrl: data.avatarUrl,
      role: data.role,
      status: data.status,
      owner: {
        orgId: '',
        groupId: '',
        userId: '',
        agentId: '',
        appId: '',
      },
      isDeleted: false,
    });
    return user.save();
  }

  /**
   * Update the last login timestamp for a user
   * @param userId - User ID
   */
  async updateLastLogin(userId: string): Promise<void> {
    await this.model.updateOne(
      { _id: userId },
      { $set: { lastLoginAt: new Date(), updatedAt: new Date() } }
    ).exec();
  }
}
