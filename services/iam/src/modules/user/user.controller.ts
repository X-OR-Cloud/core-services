import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  JwtAuthGuard,
  LicenseGuard,
  RequireLicense,
  CurrentUser,
  PaginationQueryDto,
  ApiCreateErrors,
  ApiReadErrors,
  ApiUpdateErrors,
  ApiDeleteErrors,
} from '@hydrabyte/base';
import { RequestContext, LicenseType } from '@hydrabyte/shared';
import { Types, ObjectId } from 'mongoose';
import { UsersService } from './user.service';
import { User } from './user.schema';
import { CreateUserData, UpdateUserData, ChangeRoleDto, ChangePasswordDto } from './user.dto';

@ApiTags('users')
@ApiBearerAuth('JWT-auth')
@Controller('users')
export class UsersController {
  constructor(private readonly userService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create user', description: 'Create a new user - Requires FULL license' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiCreateErrors()
  @RequireLicense(LicenseType.FULL)
  @UseGuards(JwtAuthGuard, LicenseGuard)
  async create(
    @Body() createDTO: CreateUserData,
    @CurrentUser() context: RequestContext
  ): Promise<Partial<User>> {
    return this.userService.create(createDTO, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all users', description: 'Get list of users with pagination and filtering' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() paginationQuery: PaginationQueryDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.userService.findAll(paginationQuery, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID', description: 'Get a single user by ID' })
  @ApiResponse({ status: 200, description: 'User found' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ): Promise<Partial<User>> {
    const user = await this.userService.findById(new Types.ObjectId(id) as unknown as ObjectId, context);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update user', description: 'Update user information' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateDTO: UpdateUserData,
    @CurrentUser() context: RequestContext
  ): Promise<Partial<User>> {
    const updated = await this.userService.update(new Types.ObjectId(id) as unknown as ObjectId, updateDTO, context);
    if (!updated) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete user', description: 'Soft delete a user' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async delete(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    await this.userService.softDelete(new Types.ObjectId(id) as unknown as ObjectId, context);
    return { message: 'User deleted successfully' };
  }

  @Patch(':id/change-role')
  @ApiOperation({
    summary: 'Change user role',
    description: 'Change role for a specific user. Only organization.owner can change organization-level users in their org.'
  })
  @ApiResponse({ status: 200, description: 'Role changed successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async changeRole(
    @Param('id') id: string,
    @Body() changeRoleDto: ChangeRoleDto,
    @CurrentUser() context: RequestContext
  ): Promise<{ message: string }> {
    await this.userService.changeRole(
      new Types.ObjectId(id) as unknown as ObjectId,
      changeRoleDto,
      context
    );
    return { message: 'Role changed successfully' };
  }

  @Patch(':id/change-password')
  @ApiOperation({
    summary: 'Change user password',
    description: 'Change password for a specific user. Only organization.owner can perform this action.'
  })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only organization owner can change passwords' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Param('id') id: string,
    @Body() changePasswordDto: ChangePasswordDto,
    @CurrentUser() context: RequestContext
  ): Promise<{ message: string }> {
    await this.userService.changePassword(
      new Types.ObjectId(id) as unknown as ObjectId,
      changePasswordDto,
      context
    );
    return { message: 'Password changed successfully' };
  }
}
