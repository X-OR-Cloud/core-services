import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AsteriskNode, AsteriskNodeSchema } from './nodes.schema';
import { NodesService } from './nodes.service';
import { NodesController } from './nodes.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: AsteriskNode.name, schema: AsteriskNodeSchema }])],
  providers: [NodesService],
  controllers: [NodesController],
  exports: [NodesService],
})
export class NodesModule {}
