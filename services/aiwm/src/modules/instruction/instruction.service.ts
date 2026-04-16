import { Injectable, Logger, OnModuleDestroy, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import Redis from 'ioredis';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext, InstructionInUseException } from '@hydrabyte/shared';
import {
  InstructionUpdatedEvent,
  REDIS_CHANNEL_INSTRUCTION_UPDATED,
  redisConfig,
} from '../../config/redis.config';
import { Instruction } from './instruction.schema';
import { Agent } from '../agent/agent.schema';
import { CreateInstructionDto } from './instruction.dto';

/**
 * InstructionService
 * Manages instruction entities for AI agent behavior
 * Extends BaseService for automatic CRUD operations
 */
@Injectable()
export class InstructionService extends BaseService<Instruction> implements OnModuleDestroy {
  private readonly instructionLogger = new Logger(InstructionService.name);
  private redisPub: Redis | null = null;

  constructor(
    @InjectModel(Instruction.name) private instructionModel: Model<Instruction>,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>
  ) {
    super(instructionModel);
  }

  onModuleDestroy() {
    this.redisPub?.disconnect();
    this.redisPub = null;
  }

  private getRedisPub(): Redis {
    if (!this.redisPub) {
      this.redisPub = new Redis(redisConfig);
    }
    return this.redisPub;
  }

  private publishInstructionUpdated(instructionId: string, updatedAt: Date | string | undefined) {
    const payload: InstructionUpdatedEvent = {
      instructionId,
      updatedAt: (updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt) ?? new Date().toISOString(),
    };
    this.getRedisPub()
      .publish(REDIS_CHANNEL_INSTRUCTION_UPDATED, JSON.stringify(payload))
      .catch((err) => {
        this.instructionLogger.warn(`Failed to publish instruction-updated event: ${(err as Error).message}`);
      });
  }
  /**
   * Override create method to add custom validation or processing
   */
  async create(
    createData: CreateInstructionDto,
    context: RequestContext
  ): Promise<Partial<Instruction>> {
    // Additional validation or processing can be added here
    if(!createData.status){
      createData.status = 'active'; // Default status to active if not provided
    }
    return super.create(createData, context);
  }

  private isOrgOwner(context: RequestContext): boolean {
    return !!context.roles?.some(r => r === 'organization.owner' || r === 'universe.owner');
  }

  /**
   * Override findAll to handle statistics aggregation
   */
  async findAll(
    options: FindManyOptions,
    context: RequestContext
  ): Promise<FindManyResult<Instruction>> {
    options.selectFields = ['-systemPrompt'];
    options.statisticFields = ['status'];
    if (!this.isOrgOwner(context)) {
      options.filter = { ...options.filter, 'owner.userId': context.userId };
    }
    return await super.findAll(options, context);
  }

  /**
   * Override findById
   */
  async findById(id: string, context: RequestContext): Promise<Partial<Instruction>> {
    const instruction = await super.findById(id, context);
    if (!this.isOrgOwner(context) && (instruction as any)?.owner?.userId !== context.userId) {
      throw new ForbiddenException('You can only access instructions you created');
    }
    return instruction;
  }

  /**
   * Override update method to validate status changes
   * Prevents deactivating instructions that are in use by active agents
   */
  async update(
    id: string,
    updateData: Partial<Instruction>,
    context: RequestContext
  ): Promise<Partial<Instruction>> {
    if (!this.isOrgOwner(context)) {
      const existing = await this.model.findOne({ _id: id, isDeleted: false }).lean().exec();
      if (!existing || (existing as any).owner?.userId !== context.userId) {
        throw new ForbiddenException('You can only update instructions you created');
      }
    }

    if (updateData.status === 'inactive') {
      const activeAgents = await this.checkActiveAgentDependencies(id);
      if (activeAgents.length > 0) {
        throw new InstructionInUseException(activeAgents, 'deactivate');
      }
    }

    const updated = await super.update(id, updateData, context);
    this.publishInstructionUpdated(id, (updated as { updatedAt?: Date })?.updatedAt);
    return updated;
  }

  /**
   * Override softDelete method to validate dependencies
   * Prevents deleting instructions that are in use by active agents
   */
  async softDelete(
    id: string,
    context: RequestContext
  ): Promise<Partial<Instruction>> {
    if (!this.isOrgOwner(context)) {
      const existing = await this.model.findOne({ _id: id, isDeleted: false }).lean().exec();
      if (!existing || (existing as any).owner?.userId !== context.userId) {
        throw new ForbiddenException('You can only delete instructions you created');
      }
    }

    const activeAgents = await this.checkActiveAgentDependencies(id);
    if (activeAgents.length > 0) {
      throw new InstructionInUseException(activeAgents, 'delete');
    }
    return super.softDelete(id, context);
  }

  /**
   * Find instruction by ID for public share access (no ownership check)
   */
  async findByIdForShare(id: string): Promise<Instruction | null> {
    return this.instructionModel
      .findOne({ _id: id, isDeleted: false })
      .lean()
      .exec() as Promise<Instruction | null>;
  }

  /**
   * Helper method to check if instruction is being used by active agents
   * @param instructionId - Instruction ID to check
   * @returns Array of active agents using this instruction
   */
  private async checkActiveAgentDependencies(
    instructionId: string | ObjectId
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
}
