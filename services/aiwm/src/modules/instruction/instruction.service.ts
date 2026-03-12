import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext, InstructionInUseException } from '@hydrabyte/shared';
import { Instruction } from './instruction.schema';
import { Agent } from '../agent/agent.schema';
import { CreateInstructionDto } from './instruction.dto';

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

  /**
   * Override findAll to handle statistics aggregation
   */
  async findAll(
    options: FindManyOptions,
    context: RequestContext
  ): Promise<FindManyResult<Instruction>> {
    options.selectFields = ['-systemPrompt'];
    options.statisticFields = ['status']; // Specify fields for statistics aggregation
    return await super.findAll(options, context);
  }

  /**
   * Override findById
   */
  async findById(id: string, context: RequestContext): Promise<Partial<Instruction>> {
    const instruction = await super.findById(id, context);
    // additional processing if needed
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
    id: string,
    context: RequestContext
  ): Promise<Partial<Instruction>> {
    const activeAgents = await this.checkActiveAgentDependencies(id);
    if (activeAgents.length > 0) {
      throw new InstructionInUseException(activeAgents, 'delete');
    }
    // Call parent softDelete method
    return super.softDelete(id, context);
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
