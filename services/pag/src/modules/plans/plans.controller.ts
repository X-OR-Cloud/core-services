import { Body, Controller, Get, NotFoundException, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlansService, UpdatePlanDto } from './plans.service';
import { AdminKeyGuard } from '../../guards/admin-key.guard';

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @ApiOperation({ summary: 'List all plans' })
  async findAll() {
    return this.plansService.findAll();
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get plan by slug' })
  async findOne(@Param('slug') slug: string) {
    const plan = await this.plansService.findBySlug(slug);
    if (!plan) throw new NotFoundException(`Plan not found: ${slug}`);
    return plan;
  }

  @Patch(':slug')
  @UseGuards(AdminKeyGuard)
  @ApiOperation({ summary: 'Update plan (admin only)' })
  @ApiHeader({ name: 'x-admin-key', required: true, description: 'Admin API key' })
  async update(@Param('slug') slug: string, @Body() dto: UpdatePlanDto) {
    const updated = await this.plansService.update(slug, dto);
    if (!updated) throw new NotFoundException(`Plan not found: ${slug}`);
    return updated;
  }
}
