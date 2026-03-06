import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext, InstructionInUseException } from '@hydrabyte/shared';
import { Instruction } from './instruction.schema';
import { Agent } from '../agent/agent.schema';

/**
 * InstructionService
 * Manages instruction entities for AI agent behavior
 * Extends BaseService for automatic CRUD operations
 */
@Injectable()
export class InstructionService extends BaseService<Instruction> {
  constructor(
    @InjectModel(Instruction.name) private instructionModel: Model<Instruction>,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>
  ) {
    super(instructionModel);
  }

  /**
   * Helper method to check if instruction is being used by active agents
   * @param instructionId - Instruction ID to check
   * @returns Array of active agents using this instruction
   */
  private async checkActiveAgentDependencies(
    instructionId: ObjectId
  ): Promise<Array<{ id: string; name: string }>> {
    const activeAgents = await this.agentModel
      .find({
        instructionId: instructionId.toString(),
        isDeleted: false,
      })
      .select('_id name')
      .lean()
      .exec();

    return activeAgents.map((agent) => ({
      id: agent._id.toString(),
      name: agent.name,
    }));
  }

  /**
   * Override update method to validate status changes
   * Prevents deactivating instructions that are in use by active agents
   */
  async update(
    id: ObjectId,
    updateData: Partial<Instruction>,
    context: RequestContext
  ): Promise<Instruction | null> {
    // Check if status is being changed to 'inactive'
    if (updateData.status === 'inactive') {
      const activeAgents = await this.checkActiveAgentDependencies(id);
      if (activeAgents.length > 0) {
        throw new InstructionInUseException(activeAgents, 'deactivate');
      }
    }

    // Call parent update method
    return super.update(id, updateData, context);
  }

  /**
   * Override softDelete method to validate dependencies
   * Prevents deleting instructions that are in use by active agents
   */
  async softDelete(
    id: ObjectId,
    context: RequestContext
  ): Promise<Instruction | null> {
    const activeAgents = await this.checkActiveAgentDependencies(id);
    if (activeAgents.length > 0) {
      throw new InstructionInUseException(activeAgents, 'delete');
    }

    // Call parent softDelete method
    return super.softDelete(id, context);
  }

  /**
   * Override findAll to handle statistics aggregation
   */
  async findAll(
    options: FindManyOptions,
    context: RequestContext
  ): Promise<FindManyResult<Instruction>> {
    if(options.filter !== null) {
      // loop each filter if value = null, "", undefined, remove from filter
      for (const key in options.filter) {
        if (
          options.filter[key] === null ||
          options.filter[key] === '' ||
          options.filter[key] === undefined
        ) {
          delete options.filter[key];
        }
      }
    }
    const findResult = await super.findAll(options, context);
    findResult.data = findResult.data.map((item: any) => {
      const obj = item.toObject ? item.toObject() : { ...item };
      delete obj.content;
      return obj;
    });

    // Aggregate statistics by status


    const statusStats = await super.aggregate(
      [
        { $match: { ...options.filter } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ],
      context
    );

    // Build statistics object
    const statistics: any = {
      total: findResult.pagination.total,
      byStatus: {},
      byType: {},
    };

    // Map status statistics
    statusStats.forEach((stat: any) => {
      statistics.byStatus[stat._id] = stat.count;
    });

    findResult.statistics = statistics;
    return findResult;
  }
}
