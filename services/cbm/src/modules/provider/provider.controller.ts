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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, parseQueryString, ApiCreateErrors, ApiReadErrors } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { ProviderService } from './provider.service';
import {
  CreateProviderDto,
  UpdateProviderDto,
  UpdateProviderConfigDto,
  ProviderQueryDto,
} from './provider.dto';
import { PaymentService } from '../payment/payment.service';

@ApiTags('providers')
@Controller('providers')
export class ProviderController {
  constructor(
    private readonly providerService: ProviderService,
    private readonly paymentService: PaymentService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiCreateErrors()
  @ApiOperation({ summary: 'Create a new provider config (credentials encrypted at rest)' })
  async create(@Body() dto: CreateProviderDto, @CurrentUser() context: RequestContext) {
    return this.providerService.create(dto, context);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiReadErrors({ notFound: false })
  @ApiOperation({ summary: 'List providers (config field excluded from response)' })
  async findAll(@Query() query: ProviderQueryDto, @CurrentUser() context: RequestContext) {
    const options = parseQueryString(query as any);
    return this.providerService.findAll(options, context);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiReadErrors()
  @ApiOperation({ summary: 'Get provider by ID (config field excluded)' })
  async findOne(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.providerService.findById(id as any, context);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiReadErrors()
  @ApiOperation({ summary: 'Update provider name/status' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProviderDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.providerService.update(id as any, dto, context);
  }

  @Patch(':id/config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiReadErrors()
  @ApiOperation({ summary: 'Replace provider credentials (re-encrypted at rest, status reset to inactive)' })
  async updateConfig(
    @Param('id') id: string,
    @Body() dto: UpdateProviderConfigDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.providerService.updateConfig(id as any, dto.config, context);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiReadErrors()
  @ApiOperation({ summary: 'Delete provider config' })
  async remove(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.providerService.softDelete(id as any, context);
  }

  @Post(':id/test')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiReadErrors()
  @ApiOperation({ summary: 'Test provider connectivity (pings provider API, updates status)' })
  async test(@Param('id') id: string, @CurrentUser() context: RequestContext) {
    return this.providerService.testConnection(id as any, context);
  }

  /**
   * Webhook endpoint — PUBLIC, no JWT.
   * PayOS/VNPay calls this URL. Signature verified internally.
   * URL to register with PayOS: https://api.hydrabyte.co/cbm/providers/:id/webhook
   */
  @Post(':id/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive payment webhook from provider (PayOS, VNPay...)' })
  async handleWebhook(@Param('id') id: string, @Body() body: any) {
    const webhookData = await this.providerService.verifyAndParseWebhook(id, body);
    await this.paymentService.handleWebhookPaid(
      webhookData.orderCode,
      webhookData.paidAt,
      webhookData.amount,
    );
    return { success: true };
  }
}
