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
import { ContactService } from './contact.service';
import { CreateContactDto, UpdateContactDto, PlatformLinkDto } from './contact.dto';

@ApiTags('Contacts')
@ApiBearerAuth()
@Controller('contacts')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new contact' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createContactDto: CreateContactDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.contactService.create(createContactDto, context);
  }

  @Get()
  @ApiOperation({ summary: 'List all contacts with pagination, search and statistics' })
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() context: RequestContext
  ) {
    const { search, ...rest } = query;
    const options = parseQueryString(rest);
    return this.contactService.findAll({ ...options, search }, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get contact by ID' })
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.contactService.findById(new Types.ObjectId(id) as any, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update contact by ID' })
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateContactDto: UpdateContactDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.contactService.update(new Types.ObjectId(id) as any, updateContactDto as any, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete contact by ID' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.contactService.softDelete(new Types.ObjectId(id) as any, context);
  }

  // =============== Phase 3: Platform Links ===============

  @Post(':id/platform-links')
  @ApiOperation({ summary: 'Add a platform link to contact (Discord, Telegram, Zalo...)' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async addPlatformLink(
    @Param('id') id: string,
    @Body() dto: PlatformLinkDto,
    @CurrentUser() context: RequestContext
  ) {
    return this.contactService.addPlatformLink(new Types.ObjectId(id) as any, dto, context);
  }

  @Delete(':id/platform-links/:platform/:platformUserId')
  @ApiOperation({ summary: 'Remove a platform link from contact by platform + platformUserId' })
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async removePlatformLink(
    @Param('id') id: string,
    @Param('platform') platform: string,
    @Param('platformUserId') platformUserId: string,
    @CurrentUser() context: RequestContext
  ) {
    return this.contactService.removePlatformLink(new Types.ObjectId(id) as any, platform, platformUserId, context);
  }
}
