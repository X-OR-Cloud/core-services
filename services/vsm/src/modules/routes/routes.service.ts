import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseService } from '@hydrabyte/base';
import { Route } from './routes.schema';

export interface ResolveRouteParams {
  direction: 'inbound' | 'outbound';
  fromNumber?: string;
  toNumber?: string;
  fromAccountId?: string;
  orgId: string;
}

@Injectable()
export class RoutesService extends BaseService<Route> {
  constructor(@InjectModel(Route.name) model: Model<Route>) {
    super(model);
  }

  /**
   * Resolve the best matching route by direction + number patterns.
   * Matches in priority order (lower number = higher priority).
   */
  async resolve(params: ResolveRouteParams): Promise<Partial<Route>> {
    const { direction, fromNumber, toNumber, fromAccountId, orgId } = params;

    const candidates = await this.model
      .find({ direction, isDeleted: false, 'owner.orgId': orgId })
      .sort({ priority: 1 })
      .lean();

    for (const route of candidates) {
      if (!this.matchRoute(route as any, { fromNumber, toNumber, fromAccountId })) continue;
      return route;
    }

    throw new NotFoundException('No matching route found');
  }

  private matchRoute(
    route: Route,
    params: { fromNumber?: string; toNumber?: string; fromAccountId?: string },
  ): boolean {
    // Match fromAccountId if route specifies it
    if (route.fromAccountId && params.fromAccountId) {
      if (String(route.fromAccountId) !== params.fromAccountId) return false;
    }

    // Match number pattern (regex or exact)
    if (route.matchNumber) {
      const target = route.direction === 'inbound' ? params.toNumber : params.toNumber;
      if (!target) return false;
      try {
        if (!new RegExp(route.matchNumber).test(target)) return false;
      } catch {
        if (route.matchNumber !== target) return false;
      }
    }

    return true;
  }
}
