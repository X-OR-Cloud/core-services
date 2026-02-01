import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Service info', description: 'Get basic service information' })
  @ApiResponse({ status: 200, description: 'Service info retrieved successfully' })
  getData() {
    return this.appService.getData();
  }

  @Get('scheduler/status')
  @ApiOperation({ summary: 'Scheduler status', description: 'Get scheduler worker status' })
  @ApiResponse({ status: 200, description: 'Scheduler status retrieved successfully' })
  getSchedulerStatus() {
    return this.appService.getSchedulerStatus();
  }
}
