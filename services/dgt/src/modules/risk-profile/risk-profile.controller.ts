import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, QueryStringParams, ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { RiskProfileService } from './risk-profile.service';
import { CreateRiskProfileDto, UpdateRiskProfileDto } from './risk-profile.dto';

@ApiTags('risk-profiles')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('risk-profiles')
export class RiskProfileController {
  constructor(private readonly riskProfileService: RiskProfileService) {}

  @Post()
  @ApiOperation({ summary: 'Create risk profile' })
  @ApiCreateErrors()
  async create(
    @Body() dto: CreateRiskProfileDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.riskProfileService.create(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all risk profiles' })
  @ApiReadErrors({ notFound: false })
  async findAll(
    @Query() query: QueryStringParams,
    @CurrentUser() context: RequestContext,
  ) {
    return this.riskProfileService.findAll(parseQueryString(query), context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get risk profile by ID' })
  @ApiReadErrors()
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    const profile = await this.riskProfileService.findById(id, context);
    if (!profile) throw new NotFoundException(`RiskProfile ${id} not found`);
    return profile;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update risk profile' })
  @ApiUpdateErrors()
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRiskProfileDto,
    @CurrentUser() context: RequestContext,
  ) {
    const updated = await this.riskProfileService.update(id, dto, context);
    if (!updated) throw new NotFoundException(`RiskProfile ${id} not found`);
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete risk profile' })
  @ApiDeleteErrors()
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    await this.riskProfileService.softDelete(id, context);
    return { message: 'Risk profile deleted successfully' };
  }
}
