import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Setting, SettingSchema } from './setting.schema';

/**
 * Setting Module (skeleton — full impl in P1).
 *
 * P0 only registers the schema so Mongo collection + indexes are created
 * on first connect. Service, controller, RBAC, pub/sub publisher land in P1.
 *
 * Ref: docs/sys/PLAN_v1.md Phase P1
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Setting.name, schema: SettingSchema }]),
  ],
})
export class SettingModule {}
