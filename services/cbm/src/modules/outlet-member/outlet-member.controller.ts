import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
import { OutletMemberService } from './outlet-member.service';
import { CreateOutletMemberDto, UpdateOutletMemberDto } from './outlet-member.dto';

@ApiTags('Outlet Members')
@ApiBearerAuth()
@Controller('outlet-members')
export class OutletMemberController {
  constructor(private readonly outletMemberService: OutletMemberService) {}

  @Post()
  @ApiOperation({
    summary: 'Assign a user to an outlet',
    description: 'First assignment auto-sets isDefault = true.',
  })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async assign(
    @Body() dto: CreateOutletMemberDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.outletMemberService.assignMember(dto, context);
  }

  @Get()
  @ApiOperation({
    summary: 'List outlet members',
    description: 'Filter by outletId OR userId. One of the two params is required.',
  })
  @ApiQuery({ name: 'outletId', required: false, description: 'Filter by outlet' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user — returns all outlet assignments for a user' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async list(
    @Query('outletId') outletId: string,
    @Query('userId') userId: string,
    @CurrentUser() context: RequestContext,
  ) {
    if (userId) return this.outletMemberService.listByUser(userId, context);
    return this.outletMemberService.listByOutlet(outletId, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update outlet member (e.g. set isDefault)' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOutletMemberDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.outletMemberService.updateMember(id as any, dto, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove user from outlet (soft delete)' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.outletMemberService.removeMember(id as any, context);
  }
}
