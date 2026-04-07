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
import { InteractionService } from './interaction.service';
import { CreateInteractionDto, UpdateInteractionDto } from './interaction.dto';

@ApiTags('Interactions')
@ApiBearerAuth()
@Controller('interactions')
export class InteractionController {
  constructor(private readonly interactionService: InteractionService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new interaction record' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createInteractionDto: CreateInteractionDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.interactionService.create(createInteractionDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List interactions with pagination and search (filter by contactId, companyId, type)' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext
  ) {
    const { search, ...rest } = query;
    const options = parseQueryString(rest);
    return this.interactionService.findAll({ ...options, search }, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get interaction by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.interactionService.findById(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update interaction by ID' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateInteractionDto: UpdateInteractionDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.interactionService.update(new Types.ObjectId(id) as any, updateInteractionDto as any, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete interaction by ID' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.interactionService.softDelete(new Types.ObjectId(id) as any, context);
  }
}
