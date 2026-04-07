import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InteractionController } from './interaction.controller';
import { InteractionService } from './interaction.service';
import { Interaction, InteractionSchema } from './interaction.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Interaction.name, schema: InteractionSchema }]),
  ],
  controllers: [InteractionController],
  providers: [InteractionService],
  exports: [InteractionService, MongooseModule],
})
export class InteractionModule {}
