import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LlmProvider, LlmProviderSchemaFactory } from './llm-provider.schema';
import { LlmProviderService } from './llm-provider.service';
import { LlmProviderController } from './llm-provider.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: LlmProvider.name, schema: LlmProviderSchemaFactory }]),
  ],
  controllers: [LlmProviderController],
  providers: [LlmProviderService],
  exports: [LlmProviderService],
})
export class LlmProviderModule {}
