import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiExcludeController } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { CidrAllowlistGuard, InternalApiKeyGuard } from '../../guards';
import { AuditLogService } from './audit-log.service';
import { AuditLogQueryDto, CreateAuditLogBatchDto } from './audit-log.dto';

/**
 * Audit-log UI controller (JWT auth).
 *
 * Ref: docs/sys/PROPOSAL.md §5.3
 */
@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly service: AuditLogService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Search audit logs (paginated, filterable)' })
  async findAll(@Query() query: AuditLogQueryDto, @CurrentUser() ctx: RequestContext) {
    return this.service.findAll(query, ctx);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Aggregate counts by service+action+result' })
  async getStats(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @CurrentUser() ctx?: RequestContext,
  ) {
    return this.service.getStats({ from, to }, ctx as RequestContext);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get audit log by id' })
  async findById(@Param('id') id: string, @CurrentUser() ctx: RequestContext) {
    return this.service.findById(id, ctx);
  }
}

/**
 * Internal audit-log ingest endpoint (CIDR + APIKey).
 *
 * Alternative to BullMQ direct enqueue — useful when consumer can't reach
 * Redis but can reach sys over HTTP.
 *
 * Excluded from Swagger.
 */
@ApiExcludeController()
@Controller('audit-logs/internal')
@UseGuards(CidrAllowlistGuard, InternalApiKeyGuard)
export class AuditLogInternalController {
  constructor(private readonly service: AuditLogService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async ingestBatch(@Body() dto: CreateAuditLogBatchDto) {
    return this.service.persistMany(dto.events);
  }
}
