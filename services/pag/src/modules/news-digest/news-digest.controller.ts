import { Controller, Get, Param } from '@nestjs/common';
import { NewsDigestService } from './news-digest.service';

/** Admin/test endpoint — preview digest for a user */
@Controller('news-digest')
export class NewsDigestController {
  constructor(private readonly newsDigestService: NewsDigestService) {}

  @Get('preview/:platformUserId/:soulId')
  async preview(
    @Param('platformUserId') platformUserId: string,
    @Param('soulId') soulId: string,
  ): Promise<{ digest: string }> {
    const digest = await this.newsDigestService.buildDigest(platformUserId, soulId);
    return { digest };
  }
}
