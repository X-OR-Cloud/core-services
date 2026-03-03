import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { RiskProfileService } from './risk-profile.service';
import { CreateRiskProfileDto, UpdateRiskProfileDto } from './risk-profile.dto';

@ApiTags('risk-profiles')
@ApiBearerAuth('JWT-auth')
@Controller('risk-profiles')
export class RiskProfileController {
  constructor(private readonly riskProfileService: RiskProfileService) {}

  @Post()
  @ApiOperation({ summary: 'Create risk profile' })
  @ApiResponse({ status: 201, description: 'Risk profile created successfully' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() dto: CreateRiskProfileDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.riskProfileService.create(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all risk profiles' })
  @ApiResponse({ status: 200, description: 'Risk profiles retrieved successfully' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext,
  ) {
    const options = parseQueryString(query);
    return this.riskProfileService.findAll(options, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get risk profile by ID' })
  @ApiResponse({ status: 200, description: 'Risk profile found' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const profile = await this.riskProfileService.findById(new Types.ObjectId(id) as any, context);
    if (!profile) throw new NotFoundException(`RiskProfile ${id} not found`);
    return profile;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update risk profile' })
  @ApiResponse({ status: 200, description: 'Risk profile updated successfully' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRiskProfileDto,
    @CurrentUser() context: RequestContext,
  ) {
    const updated = await this.riskProfileService.update(new Types.ObjectId(id) as any, dto, context);
    if (!updated) throw new NotFoundException(`RiskProfile ${id} not found`);
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete risk profile' })
  @ApiResponse({ status: 200, description: 'Risk profile deleted successfully' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    await this.riskProfileService.softDelete(new Types.ObjectId(id) as any, context);
    return { message: 'Risk profile deleted successfully' };
  }
}
