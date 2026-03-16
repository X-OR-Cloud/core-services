import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DeploymentController } from './deployment.controller';
import { DeploymentService } from './deployment.service';
import { ProxyService } from './proxy.service';
import { Deployment, DeploymentSchema } from './deployment.schema';
import { Model, ModelSchema } from '../model/model.schema';
import { Node, NodeSchema } from '../node/node.schema';
import { Resource, ResourceSchema } from '../resource/resource.schema';
import { ConfigurationModule } from '../configuration/configuration.module';
import { ApiKeyModule } from '../api-key/api-key.module';
import { CombinedAuthGuard } from '../../guards/combined-auth.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Deployment.name, schema: DeploymentSchema },
      { name: Model.name, schema: ModelSchema },
      { name: Node.name, schema: NodeSchema },
      { name: Resource.name, schema: ResourceSchema },
    ]),
    ConfigurationModule,
    ApiKeyModule,
  ],
  controllers: [DeploymentController],
  providers: [DeploymentService, ProxyService, CombinedAuthGuard],
  exports: [DeploymentService, MongooseModule],
})
export class DeploymentModule {}