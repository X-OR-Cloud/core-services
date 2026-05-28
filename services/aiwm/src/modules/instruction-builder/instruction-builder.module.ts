import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { Agent, AgentSchema } from '../agent/agent.schema';
import { Instruction, InstructionSchema } from '../instruction/instruction.schema';
import { Tool, ToolSchema } from '../tool/tool.schema';
import { AgentMemory, AgentMemorySchema } from '../memory/memory.schema';
import { ConfigurationModule } from '../configuration/configuration.module';
import { InstructionBuilderService } from './instruction-builder.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Agent.name, schema: AgentSchema },
      { name: Instruction.name, schema: InstructionSchema },
      { name: Tool.name, schema: ToolSchema },
      { name: AgentMemory.name, schema: AgentMemorySchema },
    ]),
    HttpModule.register({ timeout: 10000, maxRedirects: 3 }),
    ConfigurationModule,
  ],
  providers: [InstructionBuilderService],
  exports: [InstructionBuilderService],
})
export class InstructionBuilderModule {}
