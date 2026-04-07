import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Interaction } from './interaction.schema';

/**
 * InteractionService
 * Manages interaction records with org-scoped CRUD.
 * Interactions are append-only in practice — no state machine needed.
 */
@Injectable()
export class InteractionService extends BaseService<Interaction> {
  constructor(
    @InjectModel(Interaction.name) private interactionModel: Model<Interaction>
  ) {
    super(interactionModel);
  }

  /**
   * Override findAll with search support.
   */
  async findAll(
    options: FindManyOptions & { search?: string },
    context: RequestContext
  ): Promise<FindManyResult<Interaction>> {
    const searchQuery = options.search || (options.filter as any)?.search;
    if (searchQuery && typeof searchQuery === 'string') {
      const searchRegex = new RegExp(searchQuery, 'i');
      const searchConditions = [
        { summary: searchRegex },
        { outcome: searchRegex },
        { notes: searchRegex },
        { tags: searchQuery },
      ];
      const existingFilter: any = {};
      if (options) {
        Object.keys(options).forEach((key) => {
          if (key !== 'search') existingFilter[key] = (options as any)[key];
        });
      }
      options = { ...existingFilter, $or: searchConditions };
    }

    delete options.search;

    return super.findAll(options, context);
  }

  async findById(id: ObjectId, context: RequestContext): Promise<Interaction> {
    const interaction = await super.findById(id, context);
    if (!interaction) throw new NotFoundException('Interaction not found');
    return interaction;
  }

  async update(id: ObjectId, data: any, context: RequestContext): Promise<Partial<Interaction>> {
    const interaction = await super.findById(id, context);
    if (!interaction) throw new NotFoundException('Interaction not found');
    return super.update(id, data, context);
  }

  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<Interaction>> {
    const interaction = await super.findById(id, context);
    if (!interaction) throw new NotFoundException('Interaction not found');
    return super.softDelete(id, context);
  }
}
