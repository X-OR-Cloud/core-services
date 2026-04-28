import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { Route } from './routes.schema';

@Injectable()
export class RoutesService extends BaseService<Route> {
  constructor(@InjectModel(Route.name) model: Model<Route>) {
    super(model);
  }
}
