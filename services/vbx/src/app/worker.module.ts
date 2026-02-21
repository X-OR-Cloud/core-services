/**
 * VBX Worker Module - AudioSocket server + OpenAI Realtime
 * No HTTP endpoints — runs AudioSocket TCP server
 */
import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ExtensionsModule } from '../modules/extensions/extensions.module';
import { CallsModule } from '../modules/calls/calls.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    MongooseModule.forRootAsync({
      useFactory: () => {
        const uri = process.env['MONGODB_URI'] || 'mongodb://localhost:27017';
        const dbName = 'hydra_vbx';
        if (uri.includes('?')) {
          const [base, query] = uri.split('?');
          return { uri: `${base.replace(/\/$/, '')}/${dbName}?${query}` };
        }
        return { uri: `${uri.replace(/\/$/, '')}/${dbName}` };
      },
    }),
    ExtensionsModule,
    CallsModule,
  ],
})
export class WorkerModule {
  private readonly logger = new Logger(WorkerModule.name);

  onModuleInit() {
    this.logger.log('🔧 VBX Worker started — AudioSocket + AI processing');
  }
}
