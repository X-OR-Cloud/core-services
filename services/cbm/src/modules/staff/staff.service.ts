import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { RequestContext } from '@hydrabyte/shared';
import { CreateStaffDto, UpdateStaffDto, ResetPasswordDto } from './staff.dto';

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);
  private readonly iamBaseUrl: string;

  constructor(private configService: ConfigService) {
    this.iamBaseUrl = this.configService.get<string>('IAM_SERVICE_URL') || 'https://api.hydrabyte.co/iam';
  }

  /** Generate a secure random password that meets IAM requirements */
  private generatePassword(): string {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const special = '@#$%!';
    const all = upper + lower + digits + special;

    const chars = [
      upper[Math.floor(Math.random() * upper.length)],
      upper[Math.floor(Math.random() * upper.length)],
      lower[Math.floor(Math.random() * lower.length)],
      lower[Math.floor(Math.random() * lower.length)],
      digits[Math.floor(Math.random() * digits.length)],
      digits[Math.floor(Math.random() * digits.length)],
      special[Math.floor(Math.random() * special.length)],
      all[Math.floor(Math.random() * all.length)],
    ];

    // Shuffle
    return chars.sort(() => Math.random() - 0.5).join('');
  }

  private handleIamError(err: unknown, defaultMsg: string): never {
    if (err instanceof AxiosError) {
      const status = err.response?.status;
      const data = err.response?.data;
      if (status === 403) throw new ForbiddenException(data?.message || 'Forbidden');
      if (status === 404) throw new NotFoundException(data?.message || 'Staff not found');
      if (status === 409) throw new ForbiddenException(data?.message || 'User already exists');
      this.logger.error(`IAM error ${status}: ${JSON.stringify(data)}`);
    }
    throw new InternalServerErrorException(defaultMsg);
  }

  async create(dto: CreateStaffDto, auth: string, context: RequestContext) {
    const generatedPassword = dto.password ? undefined : this.generatePassword();
    const password = dto.password || generatedPassword!;

    try {
      const response = await axios.post(
        `${this.iamBaseUrl}/users`,
        {
          username: dto.username,
          password,
          role: 'organization.editor',
          status: 'active',
          fullname: dto.fullname,
          phonenumbers: dto.phonenumbers,
          address: dto.address,
        },
        {
          headers: { Authorization: auth },
          // Accept 500 too — IAM has a Redis bug where user is created but 500 is returned
          validateStatus: () => true,
        },
      );

      if (response.status === 201 || response.status === 200) {
        const result: any = { ...response.data };
        if (generatedPassword) result.generatedPassword = generatedPassword;
        return result;
      }

      // Handle IAM Redis bug: user may have been created despite 500
      if (response.status === 500) {
        this.logger.warn(`IAM POST /users returned 500 for ${dto.username} — checking if user was created`);
        try {
          const listRes = await axios.get(`${this.iamBaseUrl}/users`, {
            params: { 'filter[username]': dto.username, limit: 1 },
            headers: { Authorization: auth },
          });
          const users: any[] = listRes.data?.data || [];
          const created = users.find((u: any) => u.username === dto.username);
          if (created) {
            const result: any = { ...created };
            if (generatedPassword) result.generatedPassword = generatedPassword;
            return result;
          }
        } catch {
          // ignore lookup error
        }
        throw new InternalServerErrorException('Failed to create staff — IAM service error');
      }

      // Other errors
      throw new InternalServerErrorException(`IAM error ${response.status}: ${JSON.stringify(response.data)}`);
    } catch (err) {
      if (err instanceof InternalServerErrorException || err instanceof ForbiddenException) throw err;
      this.handleIamError(err, 'Failed to create staff');
    }
  }

  async findAll(query: Record<string, any>, auth: string) {
    try {
      const params: Record<string, any> = {
        'filter[role]': 'organization.editor',
        ...query,
      };
      const response = await axios.get(`${this.iamBaseUrl}/users`, {
        params,
        headers: { Authorization: auth },
      });
      return response.data;
    } catch (err) {
      this.handleIamError(err, 'Failed to fetch staff list');
    }
  }

  async findById(id: string, auth: string) {
    try {
      const response = await axios.get(`${this.iamBaseUrl}/users/${id}`, {
        headers: { Authorization: auth },
      });
      return response.data;
    } catch (err) {
      this.handleIamError(err, 'Failed to fetch staff member');
    }
  }

  async update(id: string, dto: UpdateStaffDto, auth: string, context: RequestContext) {
    // Guard: cannot disable yourself
    if (dto.status === 'inactive' && id === context.userId) {
      throw new ForbiddenException('You cannot disable your own account');
    }

    try {
      const response = await axios.put(`${this.iamBaseUrl}/users/${id}`, dto, {
        headers: { Authorization: auth },
      });
      return response.data;
    } catch (err) {
      this.handleIamError(err, 'Failed to update staff member');
    }
  }

  async remove(id: string, auth: string, context: RequestContext) {
    // Guard: cannot delete yourself
    if (id === context.userId) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    try {
      const response = await axios.delete(`${this.iamBaseUrl}/users/${id}`, {
        headers: { Authorization: auth },
      });
      return response.data;
    } catch (err) {
      this.handleIamError(err, 'Failed to delete staff member');
    }
  }

  async resetPassword(id: string, dto: ResetPasswordDto, auth: string) {
    const generatedPassword = dto.newPassword ? undefined : this.generatePassword();
    const newPassword = dto.newPassword || generatedPassword!;

    try {
      const response = await axios.patch(
        `${this.iamBaseUrl}/users/${id}/change-password`,
        { newPassword },
        { headers: { Authorization: auth } },
      );
      const result: any = { ...(typeof response.data === 'object' ? response.data : { message: response.data }) };
      if (generatedPassword) result.generatedPassword = generatedPassword;
      return result;
    } catch (err) {
      this.handleIamError(err, 'Failed to reset password');
    }
  }
}
