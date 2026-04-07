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
import { MODULE_CLASSService } from './MODULE_NAME.service';
import { CreateMODULE_CLASSDto, UpdateMODULE_CLASSDto } from './MODULE_NAME.dto';
// import { RejectMODULE_CLASSDto } from './MODULE_NAME.dto'; // if state machine with reject action

@ApiTags('MODULE_CLASSes')
@ApiBearerAuth()
@Controller('MODULE_ROUTE')
export class MODULE_CLASSController {
  constructor(private readonly MODULE_NAMEService: MODULE_CLASSService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new MODULE_CLASS' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createDto: CreateMODULE_CLASSDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.MODULE_NAMEService.create(createDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List MODULE_CLASSes with pagination, search and statistics' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext
  ) {
    const { search, ...rest } = query;       // ALWAYS extract search separately
    const options = parseQueryString(rest);
    return this.MODULE_NAMEService.findAll({ ...options, search }, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get MODULE_CLASS by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.MODULE_NAMEService.findById(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update MODULE_CLASS' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateMODULE_CLASSDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.MODULE_NAMEService.update(new Types.ObjectId(id) as any, updateDto as any, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete MODULE_CLASS' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.MODULE_NAMEService.softDelete(new Types.ObjectId(id) as any, context);
  }

  // =============== TODO: State machine actions (if applicable) ===============
  // Uncomment and customize as needed. See references/state-machine.md

  // @Post(':id/activate')
  // @ApiOperation({ summary: 'Activate MODULE_CLASS', description: 'Transition: inactive → active' })
  // @ApiUpdateErrors()
  // @UseGuards(JwtAuthGuard)
  // async activate(@Param('id') id: string, @CurrentUser() context: RequestContext) {
  //   return this.MODULE_NAMEService.activate(new Types.ObjectId(id) as any, context);
  // }

  // @Post(':id/deactivate')
  // @ApiOperation({ summary: 'Deactivate MODULE_CLASS', description: 'Transition: active → inactive' })
  // @ApiUpdateErrors()
  // @UseGuards(JwtAuthGuard)
  // async deactivate(@Param('id') id: string, @CurrentUser() context: RequestContext) {
  //   return this.MODULE_NAMEService.deactivate(new Types.ObjectId(id) as any, context);
  // }

  // @Post(':id/approve')
  // @ApiOperation({ summary: 'Approve MODULE_CLASS', description: 'Transition: pending → approved' })
  // @ApiUpdateErrors()
  // @UseGuards(JwtAuthGuard)
  // async approve(@Param('id') id: string, @CurrentUser() context: RequestContext) {
  //   return this.MODULE_NAMEService.approve(new Types.ObjectId(id) as any, context);
  // }

  // @Post(':id/reject')
  // @ApiOperation({ summary: 'Reject MODULE_CLASS', description: 'Transition: pending → rejected' })
  // @ApiUpdateErrors()
  // @UseGuards(JwtAuthGuard)
  // async reject(
  //   @Param('id') id: string,
  //   @Body() dto: RejectMODULE_CLASSDto,
  //   @CurrentUser() context: RequestContext
  // ) {
  //   return this.MODULE_NAMEService.reject(new Types.ObjectId(id) as any, dto.rejectionReason, context);
  // }
}
