import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import {
  JwtAuthGuard,
  CurrentUser,
  ApiCreateErrors,
  ApiReadErrors,
  ApiUpdateErrors,
  ApiDeleteErrors,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { StaffService } from './staff.service';
import { CreateStaffDto, UpdateStaffDto, ResetPasswordDto } from './staff.dto';

@ApiTags('Staff')
@ApiBearerAuth()
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new staff member',
    description: 'Creates user in IAM with role organization.editor. Password auto-generated if not provided — returned as generatedPassword.',
  })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Headers('authorization') auth: string,
    @Body() dto: CreateStaffDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.staffService.create(dto, auth, context);
  }

  @Get()
  @ApiOperation({ summary: 'List all staff members (organization.editor role)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'filter[status]', required: false, description: 'active | inactive' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Headers('authorization') auth: string,
    @Query() query: Record<string, any>,
    @CurrentUser() _context: RequestContext,
  ) {
    // Remove role filter from query — service always forces organization.editor
    const { 'filter[role]': _role, ...rest } = query;
    return this.staffService.findAll(rest, auth);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get staff member by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
  ) {
    return this.staffService.findById(id, auth);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update staff member',
    description: 'Can update status (active/inactive), fullname, phone, address. Cannot disable yourself.',
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.staffService.update(id, dto, auth, context);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete staff member',
    description: 'Hard deletes user in IAM. Cannot delete yourself.',
  })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.staffService.remove(id, auth, context);
  }

  @Post(':id/reset-password')
  @ApiOperation({
    summary: 'Reset staff password',
    description: 'Password auto-generated if not provided — returned as generatedPassword.',
  })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async resetPassword(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.staffService.resetPassword(id, dto, auth);
  }
}
