import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  JwtAuthGuard,
  CurrentUser,
  PaginationQueryDto,
  FindManyResult,
  ApiCreateErrors,
  ApiReadErrors,
  ApiUpdateErrors,
  ApiDeleteErrors,
  parseQueryString,
  QueryStringParams,
} from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Types } from 'mongoose';
import { InstructionService } from './instruction.service';
import { CreateInstructionDto, UpdateInstructionDto } from './instruction.dto';
import { Instruction } from './instruction.schema';

@ApiTags('Instructions')
@ApiBearerAuth()
@Controller('instructions')
@UseGuards(JwtAuthGuard)
export class InstructionController {
  constructor(private readonly instructionService: InstructionService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new instruction' })
  @ApiCreateErrors()
  async create(
    @Body() createDto: CreateInstructionDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.instructionService.create(createDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'Get all instructions with pagination' })
  @ApiReadErrors({ notFound: false })
  async findAll(
    @Query() query: QueryStringParams,
    @CurrentUser() context: RequestContext
  ) {
    return this.instructionService.findAll(parseQueryString(query), context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get instruction by ID' })
  @ApiReadErrors()
  async findById(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.instructionService.findById(id, context);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an instruction' })
  @ApiUpdateErrors()
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateInstructionDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.instructionService.update(id, updateDto, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an instruction (soft delete)' })
  @ApiDeleteErrors()
  async delete(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return await this.instructionService.softDelete(id, context);
  }
}
