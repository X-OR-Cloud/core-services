import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AmiAuthGuard } from '../../common/ami-auth.guard';
import { WebhooksService } from './webhooks.service';
import { AmiEventDto, SyncResultDto } from './webhooks.dto';

@ApiTags('webhooks')
@Controller('webhooks/ami')
@UseGuards(AmiAuthGuard)
export class WebhooksController {
  constructor(private readonly service: WebhooksService) {}

  @Post()
  @ApiOperation({ summary: '[Internal] Receive AMI event from bridge' })
  @HttpCode(HttpStatus.NO_CONTENT)
  handleEvent(@Body() dto: AmiEventDto) {
    return this.service.handleAmiEvent(dto);
  }

  @Post('sync-result')
  @ApiOperation({ summary: '[Internal] Receive sync result from AMI bridge' })
  @HttpCode(HttpStatus.NO_CONTENT)
  handleSyncResult(@Body() dto: SyncResultDto) {
    return this.service.handleSyncResult(dto);
  }
}
