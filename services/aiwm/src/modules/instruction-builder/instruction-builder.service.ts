import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Model, Types } from 'mongoose';
import { Agent } from '../agent/agent.schema';
import { Instruction } from '../instruction/instruction.schema';
import { Tool } from '../tool/tool.schema';
import { AgentMemory, MemoryCategory } from '../memory/memory.schema';
import { ConfigurationService } from '../configuration/configuration.service';
import { ConfigKey } from '../configuration/enums/config-key.enum';
import { RequestContext } from '@hydrabyte/shared';

@Injectable()
export class InstructionBuilderService {
  private readonly logger = new Logger(InstructionBuilderService.name);

  constructor(
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(Instruction.name) private readonly instructionModel: Model<Instruction>,
    @InjectModel(Tool.name) private readonly toolModel: Model<Tool>,
    @InjectModel(AgentMemory.name) private readonly memoryModel: Model<AgentMemory>,
    private readonly httpService: HttpService,
    private readonly configurationService: ConfigurationService,
  ) {}

  async buildInstructionForAgent(
    agent: Agent,
    accessToken?: string,
    systemPromptOverride?: string,
  ): Promise<{ id: string; systemPrompt: string; isPreview?: boolean }> {
    if (!agent.instructionId) {
      return { id: '', systemPrompt: 'No instruction configured for this agent.' };
    }

    const instruction = await this.instructionModel
      .findOne({ _id: agent.instructionId, isDeleted: false })
      .exec();

    if (!instruction) {
      this.logger.warn('Instruction not found for agent', {
        agentId: (agent as any)._id,
        instructionId: agent.instructionId,
      });
      return { id: '', systemPrompt: 'Instruction not found.' };
    }

    if (instruction.status !== 'active') {
      this.logger.warn('Instruction is inactive for agent', {
        agentId: (agent as any)._id,
        instructionId: agent.instructionId,
        instructionStatus: instruction.status,
      });
      return {
        id: (instruction as any)._id.toString(),
        systemPrompt: 'Instruction is currently inactive.',
      };
    }

    const corePrompt = systemPromptOverride ?? instruction.systemPrompt;
    const agentId = (agent as any)._id.toString();

    let contextBlocks: string[] = [];
    if (accessToken) {
      contextBlocks = await this.resolveContextReferences(corePrompt, accessToken, agent.owner?.orgId);

      const manualProjectIds = new Set(
        [...corePrompt.matchAll(/@project:([a-f0-9]{24})/g)].map((m) => m[1]),
      );
      const leadBlocks = await this.resolveLeadProjectContexts(
        agentId,
        accessToken,
        agent.owner?.orgId,
        manualProjectIds,
      );
      contextBlocks = [...contextBlocks, ...leadBlocks];
    }

    const tools = await this.getAllowedTools(agent);

    const hasMemory = tools.some((t) => t.name === 'MemoryManagement');
    const memorySummaries = hasMemory ? await this.fetchMemorySummaries(agentId) : [];

    const result: { id: string; systemPrompt: string; isPreview?: boolean } = {
      id: agentId,
      systemPrompt: this.buildFinalSystemPrompt(
        corePrompt,
        contextBlocks,
        tools,
        agentId,
        memorySummaries,
        agent.code || undefined,
        agent.instructionId?.toString(),
        agent.owner?.orgId,
      ),
    };

    if (systemPromptOverride !== undefined) {
      result.isPreview = true;
    }

    return result;
  }

  async buildRawInstructionForAgent(
    agent: Agent,
  ): Promise<{ id: string; systemPrompt: string; mode: string }> {
    if (!agent.instructionId) {
      return { id: '', systemPrompt: 'No instruction configured for this agent.', mode: 'raw' };
    }

    const instruction = await this.instructionModel
      .findOne({ _id: agent.instructionId, isDeleted: false })
      .exec();

    if (!instruction) {
      return { id: '', systemPrompt: 'Instruction not found.', mode: 'raw' };
    }

    return {
      id: (instruction._id as Types.ObjectId).toString(),
      systemPrompt: instruction.systemPrompt,
      mode: 'raw',
    };
  }

  private async resolveContextReferences(
    systemPrompt: string,
    accessToken: string,
    orgId: string,
  ): Promise<string[]> {
    const refPattern = /@(project|document):([a-f0-9]{24})/g;
    const matches = [...systemPrompt.matchAll(refPattern)];

    if (matches.length === 0) {
      return [];
    }

    let cbmBaseUrl = process.env.CBM_BASE_URL || 'http://localhost:3004';
    try {
      const cbmConfig = await this.configurationService.findByKey(
        ConfigKey.CBM_BASE_API_URL as any,
        { orgId } as RequestContext,
      );
      if (cbmConfig?.value) {
        cbmBaseUrl = cbmConfig.value;
      }
    } catch {
      // Fallback to default
    }

    const contextBlocks: string[] = [];

    for (const match of matches) {
      const [, refType, refId] = match;
      try {
        const response = await firstValueFrom(
          this.httpService.get(`${cbmBaseUrl}/${refType}s/${refId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        );
        const data = (response as any).data;

        if (refType === 'project') {
          const startDate = data.startDate
            ? new Date(data.startDate).toISOString().split('T')[0]
            : 'N/A';
          const endDate = data.endDate
            ? new Date(data.endDate).toISOString().split('T')[0]
            : 'N/A';

          let documentsBlock = '';
          try {
            const [publishedRes, totalRes] = await Promise.all([
              firstValueFrom(
                this.httpService.get(
                  `${cbmBaseUrl}/documents?projectId=${refId}&status=published&limit=100`,
                  { headers: { Authorization: `Bearer ${accessToken}` } },
                ),
              ),
              firstValueFrom(
                this.httpService.get(
                  `${cbmBaseUrl}/documents?projectId=${refId}&limit=1`,
                  { headers: { Authorization: `Bearer ${accessToken}` } },
                ),
              ),
            ]);
            const docs =
              (publishedRes as any).data?.data ||
              (publishedRes as any).data?.items ||
              [];
            const totalData = (totalRes as any).data;
            const totalCount =
              totalData?.total ?? totalData?.pagination?.total ?? totalData?.meta?.total ?? docs.length;
            if (docs.length > 0 || totalCount > 0) {
              const docsList = docs
                .map((doc: any) => `  - \`${doc._id || doc.id}\`: ${doc.summary || 'Untitled'}`)
                .join('\n');
              documentsBlock =
                `\n- Published Documents (${docs.length} published trong tổng ${totalCount} document):` +
                (docsList ? `\n${docsList}` : '');
            }
          } catch (docError: any) {
            this.logger.warn(`Failed to fetch documents for project ${refId}: ${docError.message}`);
          }

          let membersBlock = '';
          const members: Array<{ type: string; id: string; role: string }> = data.members || [];
          if (members.length > 0) {
            const memberLines: string[] = [];
            for (const member of members) {
              if (member.type === 'agent') {
                try {
                  const agentData = await this.agentModel
                    .findById(member.id)
                    .select('code name instructionId')
                    .lean();
                  memberLines.push(
                    `  - [agent] id=${member.id} code=${agentData?.code || 'N/A'} name=${agentData?.name || 'N/A'} instructionId=${agentData?.instructionId || 'N/A'} role=${member.role}`,
                  );
                } catch {
                  memberLines.push(`  - [agent] id=${member.id} role=${member.role}`);
                }
              } else {
                memberLines.push(`  - [user] userId=${member.id} role=${member.role}`);
              }
            }
            membersBlock = `\n- Members (${members.length}):\n${memberLines.join('\n')}`;
          }

          contextBlocks.push(
            `Project: ${data.name}\n` +
              `-ID: ${refId}\n` +
              `-Status: ${data.status || 'N/A'}\n` +
              `-Timeline: ${startDate} → ${endDate}\n` +
              `-Description: ${data.description || 'N/A'}\n` +
              `-Tags: ${(data.tags || []).join(', ') || 'N/A'}` +
              membersBlock +
              documentsBlock,
          );
        } else if (refType === 'document') {
          const lines = [
            `Document: ${data.summary}`,
            `- ID: ${refId}`,
            `- Type: ${data.type || 'N/A'}`,
            `- Status: ${data.status || 'N/A'}`,
            `- Share Mode: ${data.shareMode || 'N/A'}`,
          ];
          if (data.projectId) {
            lines.push(`- Project ID: ${data.projectId}`);
          }
          contextBlocks.push(lines.join('\n'));
        }

        this.logger.debug(`Resolved @${refType}:${refId} successfully`);
      } catch (error: any) {
        this.logger.warn(`Failed to resolve @${refType}:${refId}: ${error.message}`);
        contextBlocks.push(
          `${refType === 'project' ? 'Project' : 'Document'}: ${refId}\n` +
            `-Error: Could not resolve reference (${error.response?.status || error.message})`,
        );
      }
    }

    return contextBlocks;
  }

  private async resolveLeadProjectContexts(
    agentId: string,
    accessToken: string,
    orgId: string,
    alreadyInjectedIds: Set<string>,
  ): Promise<string[]> {
    let cbmBaseUrl = process.env.CBM_BASE_URL || 'http://localhost:3004';
    try {
      const cbmConfig = await this.configurationService.findByKey(
        ConfigKey.CBM_BASE_API_URL as any,
        { orgId } as RequestContext,
      );
      if (cbmConfig?.value) cbmBaseUrl = cbmConfig.value;
    } catch {
      // Fallback to default
    }

    let projects: any[] = [];
    try {
      const res = await firstValueFrom(
        this.httpService.get(`${cbmBaseUrl}/projects?member=agent:${agentId}&limit=100`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      const resData = (res as any).data;
      projects = resData?.data || resData?.items || [];
    } catch (err: any) {
      this.logger.warn(
        `resolveLeadProjectContexts: failed to fetch projects for agent ${agentId}: ${err.message}`,
      );
      return [];
    }

    const leadProjects = projects.filter((p: any) => {
      const members: Array<{ type: string; id: string; role: string }> = p.members || [];
      return members.some(
        (m) => m.type === 'agent' && m.id === agentId && m.role === 'project.lead',
      );
    });

    const contextBlocks: string[] = [];

    for (const project of leadProjects) {
      const projectId = (project._id || project.id)?.toString();
      if (!projectId || alreadyInjectedIds.has(projectId)) continue;

      const memberCount = (project.members || []).length;

      let publishedCount = 0;
      let totalCount = 0;
      try {
        const [publishedRes, totalRes] = await Promise.all([
          firstValueFrom(
            this.httpService.get(
              `${cbmBaseUrl}/documents?projectId=${projectId}&status=published&limit=1`,
              { headers: { Authorization: `Bearer ${accessToken}` } },
            ),
          ),
          firstValueFrom(
            this.httpService.get(
              `${cbmBaseUrl}/documents?projectId=${projectId}&limit=1`,
              { headers: { Authorization: `Bearer ${accessToken}` } },
            ),
          ),
        ]);
        const pd = (publishedRes as any).data;
        const td = (totalRes as any).data;
        publishedCount = pd?.total ?? pd?.pagination?.total ?? pd?.meta?.total ?? 0;
        totalCount = td?.total ?? td?.pagination?.total ?? td?.meta?.total ?? 0;
      } catch {
        // Leave counts at 0 if fetch fails
      }

      contextBlocks.push(
        `[Auto] Project: ${project.name}\n` +
          `- ID: ${projectId}\n` +
          `- Summary: ${project.summary || project.description || 'N/A'}\n` +
          `- Members: ${memberCount}\n` +
          `- Documents: ${publishedCount} published trong tổng ${totalCount} document`,
      );
    }

    return contextBlocks;
  }

  buildFinalSystemPrompt(
    corePrompt: string,
    contextBlocks: string[],
    tools: Tool[],
    agentId: string,
    memorySummaries: { category: MemoryCategory; key: string; summary: string }[],
    agentCode?: string,
    instructionId?: string,
    orgId?: string,
  ): string {
    const toolNames = new Set(tools.map((t) => t.name));

    const ruleBlocks: string[] = [];

    if (toolNames.has('MemoryManagement')) {
      const snapshotLines: string[] = [];
      if (memorySummaries.length > 0) {
        const byCategory = new Map<string, typeof memorySummaries>();
        for (const m of memorySummaries) {
          if (!byCategory.has(m.category)) byCategory.set(m.category, []);
          byCategory.get(m.category)!.push(m);
        }
        for (const [cat, entries] of byCategory) {
          snapshotLines.push(`[${cat}]`);
          for (const e of entries) snapshotLines.push(`- ${e.key}: ${e.summary}`);
        }
      }

      const snapshotBlock =
        snapshotLines.length > 0
          ? `MEMORY SNAPSHOT (at session start):\n${snapshotLines.join('\n')}\n\n`
          : '';

      ruleBlocks.push(
        `${snapshotBlock}MEMORY RULES:
- Trước khi trả lời về quyết định đã đưa ra, preferences của ai đó, notes đặc biệt:
  gọi mcp__Builtin__SearchMemory với category và keyword phù hợp trước
- Sau cuộc trò chuyện có thông tin mới thuộc 1 trong 4 categories:
  gọi mcp__Builtin__UpsertMemory để lưu lại ngay, không để quên
- Nếu muốn biết đang lưu gì hoặc tránh duplicate key:
  gọi mcp__Builtin__ListMemoryKeys

MEMORY CATEGORIES:
- user-preferences: cách làm việc, style giao tiếp, preferences của từng người
- decisions: quyết định quan trọng đã được approve (ghi rõ ngày, người quyết định, lý do)
- notes: thông tin team, ngữ cảnh dự án, thông tin không có trong tài liệu chính thức
- lessons: bài học rút ra, điều cần tránh lặp lại`,
      );
    }

    if (toolNames.has('WorkManagement')) {
      ruleBlocks.push(
        `SCHEDULING RULES:
- Khi user yêu cầu báo cáo định kỳ, nhắc nhở, hoặc task lặp lại:
  chủ động tạo scheduled/recurring task qua WorkManagement tool, không chờ user nhắc lại
- Ví dụ triggers: "nhắc anh", "hàng tuần", "mỗi sáng thứ 2", "trước deadline 2 ngày"`,
      );
    }

    const systemContent =
      ruleBlocks.length > 0 ? `${corePrompt}\n\n${ruleBlocks.join('\n\n')}` : corePrompt;

    const parts: string[] = [`<system>\n${systemContent}\n</system>`];

    if (contextBlocks.length > 0) {
      parts.push(`<context>\n${contextBlocks.join('\n\n')}\n</context>`);
    }

    const runtimeLines = [
      `Datetime: ${new Date().toISOString()}`,
      `Agent ID: ${agentId}`,
    ];
    if (agentCode) runtimeLines.push(`Agent Code: ${agentCode}`);
    if (instructionId) runtimeLines.push(`Instruction ID: ${instructionId}`);
    if (orgId) runtimeLines.push(`Organization ID: ${orgId}`);
    parts.push(`<runtime>\n${runtimeLines.join('\n')}\n</runtime>`);

    parts.push(
      `<message_format>
User messages may contain optional metadata blocks prepended before the actual message content:

- <user_info>: Identity metadata of the sender (User ID, Username, Discord ID, Channel ID, etc.).
  → Read silently for context. Do NOT acknowledge, quote, or explain this block to the user.

- <references>: Resources or text snippets the user selected in the UI (documents, notes, etc.).
  → Treat as context the user wants you to use when answering. Do NOT describe or explain the XML structure itself — just use the referenced content naturally in your response.

- <knowledge_context>: Relevant knowledge chunks retrieved from the knowledge base.
  → Use as supporting information when formulating your answer. Please mention <knowledge_context> as part of your reasoning if it helps you answer the question, but do NOT quote the XML tags or explain the structure to the user.

These blocks are system metadata, not questions. Never explain them. Never repeat them back. Focus solely on the user's actual message after the blocks.
</message_format>`,
    );

    return parts.join('\n\n---\n\n');
  }

  async fetchMemorySummaries(
    agentId: string,
  ): Promise<{ category: MemoryCategory; key: string; summary: string }[]> {
    const entries = await this.memoryModel
      .find({ agentId, isDeleted: false })
      .sort({ category: 1, updatedAt: -1 })
      .select('category key summary content')
      .lean()
      .exec();

    return entries.map((e) => ({
      category: e.category as MemoryCategory,
      key: e.key,
      summary: (e as any).summary || (e.content as string).substring(0, 100),
    }));
  }

  async getAllowedTools(agent: Agent): Promise<Tool[]> {
    if (!agent.allowedToolIds || agent.allowedToolIds.length === 0) {
      return [];
    }

    const toolIds = agent.allowedToolIds.map((id) => new Types.ObjectId(id));
    return this.toolModel
      .find({ _id: { $in: toolIds }, isDeleted: false, status: 'active' })
      .exec();
  }
}
