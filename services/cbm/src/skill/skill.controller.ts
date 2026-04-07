import { Controller, Get, Delete, UseGuards, Headers, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { SkillService } from './skill.service';
import { SkillManifest } from './skill.types';

@ApiTags('Skill')
@ApiBearerAuth()
@Controller('skill')
export class SkillController {
  private readonly logger = new Logger(SkillController.name);

  constructor(private readonly skillService: SkillService) {}

  /**
   * GET /skill
   *
   * Returns the CBM skill manifest for Agent Runner to install.
   * The manifest contains a files[] array — Agent Runner writes each file
   * into {base_skill_dir}/cbm/ to recreate the full skill directory.
   *
   * Agent Runner should cache by version field (sha256 hash of all files).
   * Only re-fetch when version changes or TTL expires.
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get CBM skill manifest',
    description:
      'Returns skill manifest with files[] for Agent Runner to install. ' +
      'Compare version field with cached version to avoid unnecessary downloads.',
  })
  @ApiHeader({
    name: 'x-skill-version',
    required: false,
    description: 'Current cached version — if matches, returns 304-equivalent with version only',
  })
  async getSkill(
    @Headers('x-skill-version') clientVersion: string | undefined,
    @CurrentUser() context: RequestContext,
  ): Promise<SkillManifest | { upToDate: true; version: string }> {
    const cachedVersion = this.skillService.getCachedVersion();

    // Quick version check — if client already has latest, return lightweight response
    if (clientVersion && cachedVersion && clientVersion === cachedVersion) {
      this.logger.debug(`Skill version match for org=${context.orgId} — skipping full response`);
      return { upToDate: true, version: cachedVersion };
    }

    return this.skillService.getSkill();
  }

  /**
   * DELETE /skill/cache
   *
   * Force-invalidates the in-memory skill cache.
   * Use after hotfix (without redeploy) to push updated *.skill.md content.
   * Requires JWT auth — only for internal/admin use.
   */
  @Delete('cache')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Invalidate skill cache (admin)',
    description: 'Forces regeneration of skill manifest on next GET /skill request.',
  })
  async invalidateCache(@CurrentUser() context: RequestContext): Promise<{ message: string }> {
    this.skillService.invalidateCache();
    return { message: 'Skill cache invalidated. Next GET /skill will regenerate.' };
  }
}
