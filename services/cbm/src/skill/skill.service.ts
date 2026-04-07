import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SkillGeneratorService } from './skill-generator.service';
import { SkillManifest } from './skill.types';

/**
 * SkillService
 *
 * Manages in-memory cache of the generated skill manifest.
 * Cache is populated on application bootstrap (warmUp) and
 * expires after TTL_MS (1 hour). Cache is invalidated on each deploy
 * because warmUp() runs on every fresh start.
 */
@Injectable()
export class SkillService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SkillService.name);
  private readonly TTL_MS = 60 * 60 * 1000; // 1 hour

  private cache: { manifest: SkillManifest; generatedAt: number } | null = null;

  constructor(private readonly skillGeneratorService: SkillGeneratorService) {}

  /**
   * Called automatically on application bootstrap.
   * Pre-warms the cache so the first /skill request is instant.
   * Also acts as a deploy-time cache invalidation — previous in-memory
   * cache is discarded when the process restarts on each deploy.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.getSkill();
      this.logger.log('Skill manifest pre-warmed successfully');
    } catch (err) {
      // Non-fatal — skill will be generated on first request
      this.logger.warn(`Skill pre-warm failed (will retry on first request): ${err.message}`);
    }
  }

  async getSkill(): Promise<SkillManifest> {
    if (this.cache && Date.now() - this.cache.generatedAt < this.TTL_MS) {
      return this.cache.manifest;
    }
    const manifest = await this.skillGeneratorService.generate();
    this.cache = { manifest, generatedAt: Date.now() };
    return manifest;
  }

  /**
   * Force cache invalidation (e.g. after hotfix without redeploy).
   * Next request will regenerate the manifest.
   */
  invalidateCache(): void {
    this.cache = null;
    this.logger.log('Skill cache invalidated');
  }

  /**
   * Returns the cached version string without regenerating.
   * Used for quick version checks (If-None-Match equivalent).
   */
  getCachedVersion(): string | null {
    return this.cache?.manifest.version ?? null;
  }
}
