import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '@hydrabyte/base';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SetupService } from './setup.service';
import { SetupInitializeDto, SetupInitializeResponse, SetupStatusResponse } from './setup.dto';

@ApiTags('Setup')
@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get('status')
  @ApiOperation({ summary: 'Check if system has been initialized' })
  getStatus(): Promise<SetupStatusResponse> {
    return this.setupService.getStatus();
  }

  @Post('initialize')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('x-api-key')
  @ApiOperation({ summary: 'Initialize system: create first org and universe.owner admin' })
  initialize(@Body() dto: SetupInitializeDto): Promise<SetupInitializeResponse> {
    return this.setupService.initialize(dto);
  }
}
