import { Module } from '@nestjs/common';
import { SkillController } from './skill.controller';
import { SkillService } from './skill.service';
import { SkillGeneratorService } from './skill-generator.service';
import { OpenApiStore } from './openapi.store';

@Module({
  controllers: [SkillController],
  providers: [OpenApiStore, SkillGeneratorService, SkillService],
  exports: [OpenApiStore, SkillService],
})
export class SkillModule {}
