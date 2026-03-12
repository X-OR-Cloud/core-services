import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Guardrail } from './guardrail.schema';
import { Agent } from '../agent/agent.schema';

/**
 * GuardrailService
 * Manages guardrail entities for agent content filtering
 * Extends BaseService for automatic CRUD operations
 */
@Injectable()
export class GuardrailService extends BaseService<Guardrail> {
  constructor(
    @InjectModel(Guardrail.name) private guardrailModel: Model<Guardrail>,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>
  ) {
    super(guardrailModel);
  }

  /**
   * Helper method to check if guardrail is being used by active agents
   * @param guardrailId - Guardrail ID to check
   * @returns Array of active agents using this guardrail
   */
  private async checkActiveAgentDependencies(
    guardrailId: ObjectId
  ): Promise<Array<{ id: string; name: string }>> {
    const activeAgents = await this.agentModel
      .find({
        guardrailId: guardrailId.toString(),
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
   * Prevents disabling guardrails that are in use by active agents
   */
  async update(
    id: ObjectId,
    updateData: Partial<Guardrail>,
    context: RequestContext
  ): Promise<Partial<Guardrail>> {
    // Check if enabled is being changed to false or status to inactive
    if (updateData.enabled === false || updateData.status === 'inactive') {
      const activeAgents = await this.checkActiveAgentDependencies(id);
      if (activeAgents.length > 0) {
        throw new Error(
          `Cannot ${updateData.enabled === false ? 'disable' : 'deactivate'} guardrail: ` +
          `it is currently used by ${activeAgents.length} active agent(s): ` +
          `${activeAgents.map(a => a.name).join(', ')}`
        );
      }
    }

    // Call parent update method
    return super.update(id, updateData, context);
  }

  /**
   * Override softDelete method to validate dependencies
   * Prevents deleting guardrails that are in use by active agents
   */
  async softDelete(
    id: ObjectId,
    context: RequestContext
  ): Promise<Partial<Guardrail>> {
    const activeAgents = await this.checkActiveAgentDependencies(id);
    if (activeAgents.length > 0) {
      throw new Error(
        `Cannot delete guardrail: it is currently used by ${activeAgents.length} active agent(s): ` +
        `${activeAgents.map(a => a.name).join(', ')}`
      );
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
  ): Promise<FindManyResult<Guardrail>> {
    const findResult = await super.findAll(options, context);
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
