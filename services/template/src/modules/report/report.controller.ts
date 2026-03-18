import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, ApiCreateErrors } from '@hydrabyte/base';
import { ProductSummaryReportDto } from './report.dto';
import { ReportProducer } from '../../queues/producers/report.producer';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportController {
  constructor(private readonly reportProducer: ReportProducer) {}

  @Post('product-summary')
  @ApiOperation({ summary: 'Queue product summary report generation' })
  @ApiResponse({ status: 201, description: 'Report generation queued successfully', type: ProductSummaryReportDto })
  @ApiCreateErrors()
  async generateProductSummary(): Promise<ProductSummaryReportDto> {
    const job = await this.reportProducer.emitReportGenerate('product-summary');
    return {
      reportType: 'product-summary',
      status: 'queued',
      message: `Report generation has been queued with job ID: ${job.id}`,
    };
  }
}
