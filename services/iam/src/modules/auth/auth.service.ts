import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { sign, verify } from 'jsonwebtoken';
import { TokenData } from './auth.entity';
import { LoginData, UpdateProfileDto, ProfileResponseDto, NodeLoginDto, NodeTokenData } from './auth.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AccessTokenTypes } from '../../core/enums/other.enum';
import { UserStatuses } from '../../core/enums/user.enum';
import {
  verifyPasswordWithAlgorithm,
  hashPasswordWithAlgorithm,
} from '../../core/utils/encryption.util';
import { Organization } from '../organization/organization.schema';
import { User } from '../user/user.schema';
import { TokenStorageService } from './token-storage.service';
import { LicenseService } from '../license/license.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Organization.name) private readonly orgRepo: Model<Organization>,
    @InjectModel(User.name) private readonly userRepo: Model<User>,
    private readonly tokenStorage: TokenStorageService,
    private readonly licenseService: LicenseService,
    private readonly httpService: HttpService
  ) {}

  async login(data: LoginData): Promise<TokenData> {
    // Find user by username
    const user = await this.userRepo.findOne({
      username: data.username,
      status: UserStatuses.Active,
      isDeleted: false,
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await verifyPasswordWithAlgorithm(
      data.password,
      user.password.hashedValue,
      user.password.algorithm,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Validate JWT secret
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured');
    }

    const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '1h';

    // Fetch licenses for organization
    const orgId = user.owner?.orgId || '';
    let licenses: Record<string, string> = {};
    if (orgId) {
      try {
        licenses = await this.licenseService.getLicensesForJWT(orgId);
      } catch (error) {
        console.error('Failed to fetch licenses for JWT:', error.message);
        // Continue with empty licenses if fetch fails
      }
    }

    // Create JWT payload
    const jwtPayload = {
      sub: user._id.toString(),
      username: user.username,
      status: user.status,
      roles: user.roles || [],
      orgId,
      groupId: user.owner?.groupId || '',
      agentId: user.owner?.agentId || '',
      appId: user.owner?.appId || '',
      licenses, // Add licenses to JWT payload
    };

    // Sign access token
    // @ts-expect-error - TypeScript has issues with jsonwebtoken types
    const accessToken = sign(jwtPayload, jwtSecret, {
      expiresIn: jwtExpiresIn,
    });

    // Calculate expiration time in seconds
    const expiresIn = this.parseExpirationTime(jwtExpiresIn);

    // Generate refresh token (valid for 7 days)
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const refreshExpiresIn = 7 * 24 * 60 * 60; // 7 days in seconds
    const refreshExpiresAt = Date.now() + refreshExpiresIn * 1000;

    // Store refresh token
    this.tokenStorage.storeRefreshToken(
      refreshToken,
      user._id.toString(),
      refreshExpiresAt
    );

    const tokenData: TokenData = {
      accessToken,
      expiresIn,
      refreshToken,
      refreshExpiresIn,
      tokenType: AccessTokenTypes.Bearer,
    };

    return tokenData;
  }

  /**
   * Get user profile by user ID
   * @param userId - User ID from JWT token
   * @returns User profile with only selected fields
   */
  async getProfile(userId: string): Promise<ProfileResponseDto> {
    const user = await this.userRepo
      .findOne({
        _id: userId,
        status: UserStatuses.Active,
        isDeleted: false,
      })
      .select('_id username fullname phonenumbers address metadata')
      .lean()
      .exec();

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      _id: user._id.toString(),
      username: user.username,
      fullname: user.fullname,
      phonenumbers: user.phonenumbers,
      address: user.address,
      metadata: user.metadata,
    };
  }

  /**
   * Change user password
   * @param userId - User ID from JWT token
   * @param oldPassword - Current password
   * @param newPassword - New password
   */
  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    // Find user
    const user = await this.userRepo.findOne({
      _id: userId,
      status: UserStatuses.Active,
      isDeleted: false,
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Verify old password
    const isOldPasswordValid = await verifyPasswordWithAlgorithm(
      oldPassword,
      user.password.hashedValue,
      user.password.algorithm
    );

    if (!isOldPasswordValid) {
      throw new UnauthorizedException('Old password is incorrect');
    }

    // Hash new password
    const newHashedPassword = await hashPasswordWithAlgorithm(
      newPassword,
      user.password.algorithm
    );

    // Update password
    await this.userRepo.updateOne(
      { _id: userId },
      {
        $set: {
          'password.hashedValue': newHashedPassword,
          updatedAt: new Date(),
        },
      }
    );

    return {
      success: true,
      message: 'Password changed successfully',
    };
  }

  /**
   * Refresh access token using refresh token
   * @param refreshToken - Refresh token
   * @returns New token data
   */
  async refreshToken(refreshToken: string): Promise<TokenData> {
    // Validate refresh token
    const userId = this.tokenStorage.validateRefreshToken(refreshToken);

    if (!userId) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Get user
    const user = await this.userRepo.findOne({
      _id: userId,
      status: UserStatuses.Active,
      isDeleted: false,
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured');
    }

    const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '1h';

    // Fetch CURRENT licenses from database (passive update)
    const orgId = user.owner?.orgId || '';
    let licenses: Record<string, string> = {};
    if (orgId) {
      try {
        licenses = await this.licenseService.getLicensesForJWT(orgId);
      } catch (error) {
        console.error('Failed to fetch licenses for JWT:', error.message);
        // Continue with empty licenses if fetch fails
      }
    }

    // Create new JWT payload
    const jwtPayload = {
      sub: user._id.toString(),
      username: user.username,
      status: user.status,
      roles: user.roles || [],
      orgId,
      groupId: user.owner?.groupId || '',
      agentId: user.owner?.agentId || '',
      appId: user.owner?.appId || '',
      licenses, // Add updated licenses to JWT payload
    };

    // Sign new access token
    // @ts-expect-error - TypeScript has issues with jsonwebtoken types
    const accessToken = sign(jwtPayload, jwtSecret, {
      expiresIn: jwtExpiresIn,
    });

    const expiresIn = this.parseExpirationTime(jwtExpiresIn);

    return {
      accessToken,
      expiresIn,
      refreshToken, // Return same refresh token
      refreshExpiresIn: 7 * 24 * 60 * 60,
      tokenType: AccessTokenTypes.Bearer,
    };
  }

  /**
   * Logout user - blacklist access token and revoke refresh token
   * @param accessToken - Access token to blacklist
   * @param refreshToken - Optional refresh token to revoke
   * @param userId - User ID
   */
  async logout(
    accessToken: string,
    refreshToken: string | undefined,
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    // Decode access token to get expiration
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured');
    }

    try {
      const decoded = verify(accessToken, jwtSecret) as any;
      const expiresAt = decoded.exp * 1000; // Convert to milliseconds

      // Blacklist access token
      this.tokenStorage.blacklistAccessToken(accessToken, expiresAt);

      // Revoke refresh token if provided
      if (refreshToken) {
        this.tokenStorage.revokeRefreshToken(refreshToken);
      }

      return {
        success: true,
        message: 'Logged out successfully',
      };
    } catch (error) {
      // Even if token is invalid, try to revoke refresh token
      if (refreshToken) {
        this.tokenStorage.revokeRefreshToken(refreshToken);
      }

      return {
        success: true,
        message: 'Logged out successfully',
      };
    }
  }

  /**
   * Update user profile (fullname, phonenumbers, address only)
   * @param userId - User ID from JWT token
   * @param updateData - Profile data to update
   * @returns Updated user profile with only selected fields
   */
  async updateProfile(
    userId: string,
    updateData: UpdateProfileDto
  ): Promise<ProfileResponseDto> {
    // Find user
    const user = await this.userRepo.findOne({
      _id: userId,
      status: UserStatuses.Active,
      isDeleted: false,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update only allowed fields
    const updateFields: any = {};

    if (updateData.fullname !== undefined) {
      updateFields.fullname = updateData.fullname;
    }

    if (updateData.phonenumbers !== undefined) {
      updateFields.phonenumbers = updateData.phonenumbers;
    }

    if (updateData.address !== undefined) {
      updateFields.address = updateData.address;
    }

    updateFields.updatedAt = new Date();

    // Update user
    await this.userRepo.updateOne(
      { _id: userId },
      { $set: updateFields }
    );

    // Return updated profile
    return this.getProfile(userId);
  }

  /**
   * Node authentication - verify credentials via AIWM and issue JWT
   * @param dto - Node login credentials
   * @returns JWT token for node
   */
  async nodeLogin(dto: NodeLoginDto): Promise<NodeTokenData> {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured');
    }

    const aiwmUrl = process.env.AIWM_SERVICE_URL;
    const internalApiKey = process.env.INTERNAL_API_KEY;

    if (!aiwmUrl || !internalApiKey) {
      throw new Error('AIWM_SERVICE_URL or INTERNAL_API_KEY is not configured');
    }

    try {
      // Call AIWM to verify node credentials
      const response = await firstValueFrom(
        this.httpService.post(
          `${aiwmUrl}/nodes/verify-credentials`,
          {
            nodeId: dto.nodeId,
            apiKey: dto.apiKey,
            secret: dto.secret,
          },
          {
            headers: {
              'X-API-Key': internalApiKey,
              'Content-Type': 'application/json',
            },
          }
        )
      );

      const { valid, node } = response.data.data;

      if (!valid) {
        throw new UnauthorizedException('Invalid node credentials');
      }

      // Generate JWT token with node data
      const payload = {
        sub: node._id,
        nodeId: node._id,
        orgId: node.owner?.orgId || '',
        roles: node.roles || [],
        type: 'node',
      };

      const token = sign(payload, jwtSecret, {
        expiresIn: '7d', // 7 days
      });

      const expiresIn = 7 * 24 * 60 * 60; // 7 days in seconds

      return {
        accessToken: token,
        expiresIn,
        tokenType: AccessTokenTypes.Bearer,
        node: {
          _id: node._id,
          name: node.name,
          roles: node.roles || ['node-operator'],
        },
      };
    } catch (error) {
      // Handle AIWM API errors
      if (error.response?.status === 401) {
        throw new UnauthorizedException('Invalid node credentials');
      }
      throw error;
    }
  }

  /**
   * Parse expiration time string to seconds
   * @param expiresIn - Time string like '1h', '3600', '30m'
   * @returns Time in seconds
   */
  private parseExpirationTime(expiresIn: string): number {
    if (expiresIn.endsWith('h')) {
      return parseInt(expiresIn.replace('h', '')) * 3600;
    } else if (expiresIn.endsWith('m')) {
      return parseInt(expiresIn.replace('m', '')) * 60;
    } else if (expiresIn.endsWith('d')) {
      return parseInt(expiresIn.replace('d', '')) * 86400;
    } else {
      return parseInt(expiresIn);
    }
  }
}
