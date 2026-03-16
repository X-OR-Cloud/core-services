import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '@hydrabyte/base';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SetupService } from './setup.service';
import { SetupInitializeDto, SetupInitializeResponse, SetupStatusResponse } from './setup.dto';

@ApiTags('Setup')
@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get('status')
  @ApiOperation({ summary: 'Check if AIWM has been initialized for an org' })
  @ApiQuery({ name: 'orgId', required: false })
  getStatus(@Query('orgId') orgId?: string): Promise<SetupStatusResponse> {
    return this.setupService.getStatus(orgId);
  }

  @Post('initialize')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('x-api-key')
  @ApiOperation({ summary: 'Initialize AIWM: create all configurations and set service URLs' })
  initialize(@Body() dto: SetupInitializeDto): Promise<SetupInitializeResponse> {
    return this.setupService.initialize(dto);
  }
}
