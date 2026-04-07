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
import { ExpenseService } from './expense.service';
import { CreateExpenseDto, UpdateExpenseDto, RejectExpenseDto } from './expense.dto';

@ApiTags('Expenses')
@ApiBearerAuth()
@Controller('expenses')
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new expense (status forced: pending)' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createExpenseDto: CreateExpenseDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.expenseService.create(createExpenseDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List expenses with pagination, search and statistics' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext
  ) {
    const { search, ...rest } = query;
    const options = parseQueryString(rest);
    return this.expenseService.findAll({ ...options, search }, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get expense by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.expenseService.findById(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update expense (only allowed in pending/rejected status)' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateExpenseDto: UpdateExpenseDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.expenseService.update(new Types.ObjectId(id) as any, updateExpenseDto as any, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete expense (only pending or rejected)' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.expenseService.softDelete(new Types.ObjectId(id) as any, context);
  }

  // =============== Phase 3: State machine ===============

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve expense', description: 'Transition: pending → approved. Auto-creates Transaction.' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async approve(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.expenseService.approve(new Types.ObjectId(id) as any, context);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject expense (requires rejectionReason)', description: 'Transition: pending → rejected' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectExpenseDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.expenseService.reject(new Types.ObjectId(id) as any, dto.rejectionReason, context);
  }

  @Post(':id/resubmit')
  @ApiOperation({ summary: 'Resubmit rejected expense', description: 'Transition: rejected → pending' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async resubmit(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.expenseService.resubmit(new Types.ObjectId(id) as any, context);
  }
}
