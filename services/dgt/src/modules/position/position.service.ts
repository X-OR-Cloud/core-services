import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { Position } from './position.schema';

@Injectable()
export class PositionService extends BaseService<Position> {
  constructor(
    @InjectModel(Position.name) positionModel: Model<Position>,
  ) {
    super(positionModel as any);
  }
}
