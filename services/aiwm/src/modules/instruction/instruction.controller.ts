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
  HttpException,
  NotFoundException,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
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
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { Response } from 'express';
import { marked } from 'marked';
import { InstructionService } from './instruction.service';
import { CreateInstructionDto, UpdateInstructionDto, CreateInstructionShareLinkDto } from './instruction.dto';
import { Instruction } from './instruction.schema';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function wrapInHtmlPage(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #333; }
    pre { background: #f4f4f4; padding: 1rem; overflow-x: auto; border-radius: 4px; }
    code { background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
    pre code { background: none; padding: 0; }
    img { max-width: 100%; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 1rem; color: #666; }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

@ApiTags('Instructions')
@ApiBearerAuth()
@Controller('instructions')
@UseGuards(JwtAuthGuard)
export class InstructionController {
  constructor(
    private readonly instructionService: InstructionService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

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

  // --- Share link endpoints (must be BEFORE :id routes) ---

  @Post(':id/share')
  @ApiOperation({ summary: 'Create a share link for an instruction' })
  @ApiCreateErrors()
  async createShareLink(
    @Param('id') id: string,
    @Body() dto: CreateInstructionShareLinkDto,
    @CurrentUser() context: RequestContext,
  ) {
    const instruction = await this.instructionService.findById(id, context);
    if (!instruction) {
      throw new NotFoundException(`Instruction with ID ${id} not found`);
    }

    const ttl = dto.ttl || 3600;
    const token = this.jwtService.sign(
      { instructionId: id, purpose: 'instruction-share' },
      { expiresIn: ttl },
    );

    const port = this.configService.get<string>('PORT') || '3003';
    const baseUrl =
      this.configService.get<string>('AIWM_BASE_URL') || `http://localhost:${port}`;

    return {
      token,
      url: `${baseUrl}/instructions/shared/${token}`,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  @Get('shared/:token')
  @ApiOperation({ summary: 'View shared instruction via token (public, no auth required)' })
  @ApiResponse({ status: 200, description: 'Instruction content rendered as HTML' })
  @ApiResponse({ status: 410, description: 'Share link has expired' })
  @ApiResponse({ status: 404, description: 'Instruction not found' })
  async viewShared(
    @Param('token') token: string,
    @Query('raw') raw: string,
    @Res() res: Response,
  ) {
    let payload: { instructionId: string; purpose: string };
    try {
      payload = this.jwtService.verify(token);
    } catch (error: unknown) {
      if ((error as { name?: string }).name === 'TokenExpiredError') {
        throw new HttpException('Share link has expired', HttpStatus.GONE);
      }
      throw new HttpException('Invalid share token', HttpStatus.BAD_REQUEST);
    }

    if (payload.purpose !== 'instruction-share') {
      throw new HttpException('Invalid share token', HttpStatus.BAD_REQUEST);
    }

    const instruction = await this.instructionService.findByIdForShare(payload.instructionId);
    if (!instruction) {
      throw new NotFoundException('Instruction not found');
    }

    if (raw === 'true') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.json({
        name: instruction.name,
        description: instruction.description,
        systemPrompt: instruction.systemPrompt,
        tags: instruction.tags,
        status: instruction.status,
      });
    }

    // Default: render systemPrompt as markdown HTML
    const contentHtml = await marked.parse(instruction.systemPrompt);
    const descHtml = instruction.description
      ? `<p style="color:#666;font-size:0.95em">${escapeHtml(instruction.description)}</p>`
      : '';
    const tagsHtml = instruction.tags?.length
      ? `<p>${instruction.tags.map(t => `<span style="background:#eee;padding:2px 8px;border-radius:12px;font-size:0.85em;margin-right:4px">${escapeHtml(t)}</span>`).join('')}</p>`
      : '';

    const bodyHtml = `<h1>${escapeHtml(instruction.name)}</h1>${descHtml}${tagsHtml}<hr>${contentHtml}`;
    const html = wrapInHtmlPage(instruction.name, bodyHtml);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
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
