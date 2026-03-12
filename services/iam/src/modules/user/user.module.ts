import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersController } from './user.controller';
import { UsersService } from './user.service';
import { User, UserSchema } from './user.schema';
import { IamQueueModule } from '../../queues/queue.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    IamQueueModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
