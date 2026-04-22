import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LlmProvider, LlmProviderSchemaFactory } from './llm-provider.schema';
import { LlmProviderService } from './llm-provider.service';
import { LlmProviderController } from './llm-provider.controller';
import { LlmRouterService } from '../../shared/llm-router.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: LlmProvider.name, schema: LlmProviderSchemaFactory }]),
  ],
  controllers: [LlmProviderController],
  providers: [LlmProviderService, LlmRouterService],
  exports: [LlmProviderService, LlmRouterService],
})
export class LlmProviderModule {}
