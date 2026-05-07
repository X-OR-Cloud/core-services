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
import { OutletService } from './outlet.service';
import { CreateOutletDto, UpdateOutletDto } from './outlet.dto';

@ApiTags('Outlets')
@ApiBearerAuth()
@Controller('outlets')
export class OutletController {
  constructor(private readonly outletService: OutletService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Get outlets accessible to current user',
    description: 'organization.owner sees all active outlets. organization.editor sees only assigned outlets. Also returns defaultOutletId.',
  })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async getMyOutlets(@CurrentUser() context: RequestContext) {
    return this.outletService.getOutletsForUser(context);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new outlet' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createOutletDto: CreateOutletDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.outletService.create(createOutletDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List all outlets' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext,
  ) {
    const { search, ...rest } = query;
    const options = parseQueryString(rest);
    return this.outletService.findAll({ ...options, search }, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get outlet by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.outletService.findById(id, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update outlet by ID' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateOutletDto: UpdateOutletDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.outletService.update(id, updateOutletDto, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete outlet by ID' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.outletService.softDelete(id, context);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate outlet', description: 'Transition: inactive → active' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async activate(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.outletService.activate(id, context);
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate outlet', description: 'Transition: active → inactive' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async deactivate(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.outletService.deactivate(id, context);
  }
}
