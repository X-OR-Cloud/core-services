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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  JwtAuthGuard,
  CurrentUser,
  ApiCreateErrors,
  ApiReadErrors,
  ApiUpdateErrors,
  ApiDeleteErrors,
  parseQueryString,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { TicketService } from './ticket.service';
import { CreateTicketDto, UpdateTicketDto, SubmitTicketDto } from './ticket.dto';

@ApiTags('Tickets')
@ApiBearerAuth()
@Controller('tickets')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Post('public')
  @ApiOperation({ summary: 'Submit a ticket from public webapp — no auth required, orgId in body' })
  @ApiCreateErrors()
  async submit(@Body() dto: SubmitTicketDto) {
    const { orgId, ...data } = dto;
    return this.ticketService.submit(data, orgId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new ticket' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(@Body() dto: CreateTicketDto, @CurrentUser() context: RequestContext) {
    return this.ticketService.create(dto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List tickets with pagination and search' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(@Query() query: Record<string, any>, @CurrentUser() context: RequestContext) {
    const { search, ...rest } = query;
    const options = parseQueryString(rest);
    return this.ticketService.findAll({ ...options, search }, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ticket by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.ticketService.findById(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update ticket — assign, change status, add resolution' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.ticketService.update(new Types.ObjectId(id) as any, dto as any, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete ticket' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.ticketService.softDelete(new Types.ObjectId(id) as any, context);
  }
}
