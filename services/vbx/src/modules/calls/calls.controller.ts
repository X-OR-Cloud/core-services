import { Controller, Get, Post, Body, Param, Query, NotFoundException, ValidationPipe, Res, StreamableFile } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { PaginationQueryDto } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { CallsService } from './calls.service';
import { CreateCallDto } from './calls.dto';

const RECORDING_DIR = '/var/recordings/vbx';

const systemContext: RequestContext = {
  orgId: '',
  groupId: '',
  userId: 'system',
  agentId: '',
  appId: '',
  roles: ['universe.owner' as any],
};

@ApiTags('calls')
@Controller('calls')
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Get()
  @ApiOperation({ summary: 'List calls with filters' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to', required: false, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'caller', required: false, description: 'Caller number (partial match)' })
  @ApiQuery({ name: 'status', required: false, enum: ['answered', 'missed', 'failed', 'busy', 'rejected'] })
  @ApiQuery({ name: 'extensionId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('caller') caller?: string,
    @Query('status') status?: string,
    @Query('extensionId') extensionId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const fromDate = from ? new Date(`${from}T00:00:00+07:00`) : undefined;
    const toDate = to ? new Date(`${to}T23:59:59+07:00`) : undefined;

    return this.callsService.findByDateRange(
      fromDate,
      toDate,
      { caller, status, extensionId },
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get call detail with transcript' })
  @ApiParam({ name: 'id', description: 'Call ID' })
  async findOne(@Param('id') id: string) {
    const call = await this.callsService.findById(new Types.ObjectId(id) as any, systemContext);
    if (!call) throw new NotFoundException(`Call ${id} not found`);
    return call;
  }

  @Get(':id/recording')
  @ApiOperation({ summary: 'Stream call recording (WAV)' })
  @ApiParam({ name: 'id', description: 'Call ID' })
  async getRecording(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const call = await this.callsService.findById(new Types.ObjectId(id) as any, systemContext);
    if (!call) throw new NotFoundException(`Call ${id} not found`);
    if (!call.recordingUrl) throw new NotFoundException('No recording for this call');

    // recordingUrl could be absolute path or filename
    const filePath = call.recordingUrl.startsWith('/')
      ? call.recordingUrl
      : join(RECORDING_DIR, call.recordingUrl);

    if (!existsSync(filePath)) {
      throw new NotFoundException(`Recording file not found: ${call.recordingUrl}`);
    }

    res.set({
      'Content-Type': 'audio/wav',
      'Content-Disposition': `inline; filename="${call.callId || id}.wav"`,
    });

    const stream = createReadStream(filePath);
    return new StreamableFile(stream);
  }

  @Post()
  @ApiOperation({ summary: 'Create call record (internal)' })
  async create(@Body(ValidationPipe) dto: CreateCallDto) {
    return this.callsService.create(dto, systemContext);
  }
}
