import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { Agent, AgentDocument } from '../agent/agent.schema';
import { AgentHeartbeatDto } from '../agent/agent.dto';
import { ConfigurationService } from '../configuration/configuration.service';
import { ConfigKey } from '../configuration/enums/config-key.enum';
import { RequestContext } from '@hydrabyte/shared';
import { InstructionBuilderService } from '../instruction-builder/instruction-builder.service';

@Injectable()
export class HeartbeatService {
  private readonly logger = new Logger(HeartbeatService.name);

  constructor(
    @InjectModel(Agent.name) private readonly agentModel: Model<AgentDocument>,
    private readonly httpService: HttpService,
    private readonly configurationService: ConfigurationService,
    private readonly instructionBuilderService: InstructionBuilderService,
  ) {}

  async heartbeat(
    agentId: string,
    heartbeatDto: AgentHeartbeatDto,
    accessToken?: string,
  ): Promise<{
    success: boolean;
    work?: {
      id: string;
      title: string;
      type: string;
      status: string;
      priorityLevel: number;
    };
    systemMessage?: string;
    systemTask?: {
      type: 'work' | 'reminders' | 'inbox' | 'alert';
      id?: string;
      title?: string;
      reminders?: { id: string; content: string }[];
    };
    instruction?: { id: string; systemPrompt: string };
  }> {
    const agent = await this.agentModel
      .findOne({ _id: new Types.ObjectId(agentId), isDeleted: false })
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    if (agent.status === 'suspended') {
      throw new BadRequestException('Agent is suspended. Heartbeat rejected.');
    }

    // Auto-sleep gate
    if (
      agent.status === 'sleep' &&
      heartbeatDto.status !== 'sleep' &&
      agent.sleepUntil &&
      agent.sleepUntil.getTime() > Date.now()
    ) {
      await this.agentModel.updateOne(
        { _id: agent._id },
        { $set: { lastHeartbeatAt: new Date() } },
      );
      return { success: true };
    }

    if (heartbeatDto.status === 'sleep') {
      if (!heartbeatDto.sleep) {
        throw new BadRequestException('sleep field is required when status=sleep');
      }
      await this.agentModel.updateOne(
        { _id: agent._id },
        {
          $set: {
            lastHeartbeatAt: new Date(),
            status: 'sleep',
            sleepReason: heartbeatDto.sleep.reason,
            sleepSince: new Date(heartbeatDto.sleep.since),
            sleepUntil: heartbeatDto.sleep.until ? new Date(heartbeatDto.sleep.until) : null,
          },
        },
      );
      this.logger.debug('Agent entered sleep', {
        agentId,
        reason: heartbeatDto.sleep.reason,
        until: heartbeatDto.sleep.until ?? 'indefinite',
      });
      return { success: true };
    }

    const statusUpdate: Record<string, any> = { lastHeartbeatAt: new Date(), status: heartbeatDto.status };
    if (agent.status === 'sleep') {
      statusUpdate.sleepReason = null;
      statusUpdate.sleepSince = null;
      statusUpdate.sleepUntil = null;
    }

    await this.agentModel.updateOne({ _id: agent._id }, { $set: statusUpdate });

    this.logger.debug('Agent heartbeat received', {
      agentId,
      status: heartbeatDto.status,
      previousStatus: agent.status,
      metrics: heartbeatDto.metrics,
    });

    if (heartbeatDto.status === 'idle' && accessToken) {
      let resolved: {
        work?: { id: string; title: string; type: string; status: string; priorityLevel: number };
        systemMessage: string;
        systemTask: {
          type: 'work' | 'reminders' | 'inbox' | 'alert';
          id?: string;
          title?: string;
          reminders?: { id: string; content: string }[];
        };
      } | null = null;

      const [workResult, instruction] = await Promise.allSettled([
        this.getNextWorkForAgent(agentId, accessToken, agent.owner?.orgId, {
          mcpConnected: heartbeatDto.mcpConnected,
          availableFunctions: heartbeatDto.availableFunctions,
        }),
        this.instructionBuilderService.buildInstructionForAgent(agent, accessToken),
      ]);

      if (workResult.status === 'rejected') {
        this.logger.warn(`Failed to query next work for agent ${agentId}: ${workResult.reason?.message}`);
      } else if (workResult.value) {
        resolved = {
          work: workResult.value.work,
          systemMessage: workResult.value.systemMessage,
          systemTask: workResult.value.systemTask,
        };
      }

      const instructionPayload =
        instruction.status === 'fulfilled' ? instruction.value : undefined;

      if (instruction.status === 'rejected') {
        this.logger.warn(`Failed to build instruction for agent ${agentId}: ${instruction.reason?.message}`);
      }

      if (resolved) {
        const circuitBreak = await this.applyTaskCircuitBreaker(agent, resolved.systemTask);
        if (circuitBreak.sleep) {
          return { success: true };
        }
        return {
          success: true,
          ...(resolved.work ? { work: resolved.work } : {}),
          systemMessage: resolved.systemMessage,
          systemTask: resolved.systemTask,
          ...(instructionPayload ? { instruction: instructionPayload } : {}),
        };
      }

      if (agent.currentTask) {
        await this.agentModel.updateOne(
          { _id: agent._id },
          { $set: { currentTask: null } },
        );
      }

      return {
        success: true,
        ...(instructionPayload ? { instruction: instructionPayload } : {}),
      };
    }

    return { success: true };
  }

  private async getNextWorkForAgent(
    agentId: string,
    accessToken: string,
    orgId?: string,
    capabilities?: { mcpConnected?: boolean; availableFunctions?: string[] },
  ): Promise<{
    work: { id: string; title: string; type: string; status: string; priorityLevel: number };
    systemMessage: string;
    systemTask: { type: 'work' | 'inbox' | 'alert'; id?: string; title?: string };
  } | null> {
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

    const response = await firstValueFrom(
      this.httpService.get(`${cbmBaseUrl}/works/next-work`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { assigneeType: 'agent', assigneeId: agentId },
      }),
    );

    const data = (response as any).data;
    if (!data?.work || data.metadata?.priorityLevel === 0) {
      return null;
    }

    const work = data.work;
    const priorityLevel = data.metadata.priorityLevel;
    const workId = work._id || work.id;
    const title = work.title || 'Untitled';

    if (capabilities?.mcpConnected === false) {
      this.logger.debug('Skipping work assignment — agent MCP not connected', { agentId });
      return null;
    }

    if (capabilities?.availableFunctions) {
      const fns = capabilities.availableFunctions;
      const REQUIRED_BY_PRIORITY: Record<string, string[]> = {
        low: ['mcp__Builtin__StartWork', 'mcp__Builtin__BlockWork'],
        blocked: ['mcp__Builtin__UnblockWork', 'mcp__Builtin__BlockWork'],
        review: ['mcp__Builtin__CompleteWork', 'mcp__Builtin__RejectReviewForWork'],
      };
      const bucket = priorityLevel <= 3 ? 'low' : priorityLevel === 4 ? 'blocked' : 'review';
      const required = REQUIRED_BY_PRIORITY[bucket];
      const missing = required.filter((fn) => !fns.includes(fn));
      if (missing.length > 0) {
        this.logger.debug('Skipping work assignment — agent missing required functions', { agentId, missing });
        return null;
      }
    }

    const isSelfAssigned =
      work.reporter?.type === 'agent' &&
      work.assignee?.type === 'agent' &&
      work.reporter?.id === work.assignee?.id;

    let systemMessage: string;

    if (priorityLevel <= 3) {
      let completionStep: string;
      if (work.isRecurring) {
        completionStep = `- Gọi mcp__Builtin__CompleteWork để hoàn tất công việc (recurring task - không cần review)`;
      } else if (isSelfAssigned) {
        completionStep = `- Gọi mcp__Builtin__RequestReviewForWork rồi ngay sau đó gọi mcp__Builtin__CompleteWork để hoàn tất (bạn vừa là người thực hiện vừa là người review)`;
      } else {
        completionStep = `- Gọi mcp__Builtin__RequestReviewForWork khi hoàn tất để chờ người review duyệt`;
      }

      const hasDependencies = Array.isArray(work.dependencies) && work.dependencies.length > 0;
      const dependencyStep = hasDependencies
        ? `- Công việc này có dependencies: ${work.dependencies.map((d: string) => `@work:${d}`).join(', ')}. Trước khi bắt đầu, hãy:\n` +
          `  1. Gọi mcp__Builtin__GetWork cho từng dependency để đọc thông tin và trường "result"\n` +
          `  2. Nếu dependency có "documentIds", gọi mcp__Builtin__GetDocumentContent cho từng document để đọc nội dung chi tiết\n` +
          `  3. Tổng hợp kết quả từ các dependencies làm đầu vào cho công việc này\n`
        : '';

      systemMessage =
        `Bạn đang có công việc (Work) @work:${workId} "${title}" cần thực hiện ngay không cần hỏi lại.\n` +
        `${dependencyStep}` +
        `- Gọi mcp__Builtin__StartWork để bắt đầu công việc\n` +
        `${completionStep}\n` +
        `- Gọi mcp__Builtin__BlockWork nếu gặp vướng mắc sau 3 lần cố gắng xử lý (kèm reason)`;
    } else if (priorityLevel === 4) {
      const reason = work.reason || 'Không rõ lý do';
      if (reason.includes('[ESCALATED]')) {
        return null;
      }
      systemMessage =
        `Công việc @work:${workId} "${title}" đang bị block.\n` +
        `Lý do: "${reason}"\n\n` +
        `Hãy xử lý theo thứ tự sau:\n` +
        `1. Đọc kỹ reason, phân tích nguyên nhân\n` +
        `2. Nếu giải quyết được:\n` +
        `   → Gọi UnblockWork (kèm feedback giải pháp cụ thể)\n` +
        `3. Nếu KHÔNG giải quyết được:\n` +
        `   a. Gọi ListUsers tìm human phụ trách\n` +
        `      → Nếu tìm được: Gọi UpdateWork đổi assignee sang human đó\n` +
        `      → Nếu không có human: bỏ qua bước này\n` +
        `   b. Gọi BlockWork với reason: "[ESCALATED] <mô tả rõ vấn đề>"\n` +
        `   c. Nếu có kênh chat: Notify human với đầy đủ context\n` +
        `      → Nếu không có kênh: bỏ qua bước này\n` +
        `⛔ KHÔNG dùng CancelWork — chỉ human mới được authorize cancel`;
    } else {
      systemMessage =
        `Công việc (Work) @work:${workId} "${title}" đang chờ review.\n` +
        `- Hãy kiểm tra kết quả thực hiện và Document đính kèm (nếu có)\n` +
        `- Gọi mcp__Builtin__CompleteWork nếu kết quả đạt yêu cầu\n` +
        `- Gọi mcp__Builtin__RejectReviewForWork kèm feedback rõ ràng nếu:\n` +
        `  • Kết quả hoặc Document chưa đạt yêu cầu\n` +
        `  • Có câu hỏi mở cần xác nhận phương án trước khi tiếp tục\n` +
        `  → Feedback phải đủ để assignee hiểu cần điều chỉnh gì và submit review lại`;
    }

    this.logger.debug('Next work found for agent', { agentId, workId, priorityLevel });

    return {
      work: { id: workId, title, type: work.type, status: work.status, priorityLevel },
      systemMessage,
      systemTask: { type: 'work', id: workId, title },
    };
  }

  private async applyTaskCircuitBreaker(
    agent: AgentDocument,
    systemTask: {
      type: 'work' | 'reminders' | 'inbox' | 'alert';
      id?: string;
      title?: string;
      reminders?: { id: string; content: string }[];
    },
  ): Promise<{ sleep: boolean }> {
    const settings = (agent.settings ?? {}) as Record<string, unknown>;
    const retryLimit = Math.max(1, Number(settings.agent_taskRetryLimit ?? 3));
    const sleepMinutes = Math.max(1, Number(settings.agent_taskSleepMinutes ?? 240));

    const taskKey = this.buildTaskKey(systemTask);
    const now = new Date();

    if (agent.currentTask?.taskKey === taskKey) {
      const attemptCount = agent.currentTask.attemptCount + 1;

      if (attemptCount > retryLimit) {
        const sleepUntil = new Date(now.getTime() + sleepMinutes * 60_000);
        const sleepReason = `[AUTO] Task ${taskKey} failed ${attemptCount - 1} attempts`;

        await this.agentModel.updateOne(
          { _id: agent._id },
          {
            $set: {
              status: 'sleep',
              sleepReason,
              sleepSince: now,
              sleepUntil,
              currentTask: null,
              lastHeartbeatAt: now,
            },
            $push: {
              logs: {
                $each: [
                  {
                    level: 'error',
                    message: `Auto-sleep: ${sleepReason}`,
                    time: now,
                    data: { taskKey, attemptCount: attemptCount - 1, retryLimit, sleepMinutes, sleepUntil: sleepUntil.toISOString() },
                  },
                ],
                $slice: -100,
              },
            },
          },
        );

        this.logger.warn('Agent auto-slept by task circuit breaker', {
          agentId: String(agent._id),
          taskKey,
          attempts: attemptCount - 1,
          retryLimit,
          sleepUntil: sleepUntil.toISOString(),
        });

        return { sleep: true };
      }

      await this.agentModel.updateOne(
        { _id: agent._id },
        {
          $set: {
            'currentTask.attemptCount': attemptCount,
            'currentTask.lastAttemptAt': now,
          },
        },
      );
      return { sleep: false };
    }

    await this.agentModel.updateOne(
      { _id: agent._id },
      {
        $set: {
          currentTask: {
            taskKey,
            firstSeenAt: now,
            lastAttemptAt: now,
            attemptCount: 1,
          },
        },
      },
    );
    return { sleep: false };
  }

  private buildTaskKey(systemTask: {
    type: string;
    id?: string;
    reminders?: { id: string; content: string }[];
  }): string {
    if (systemTask.type === 'reminders' && systemTask.reminders?.length) {
      const ids = systemTask.reminders.map((r) => r.id).sort().join(',');
      const hash = crypto.createHash('sha1').update(ids).digest('hex').slice(0, 12);
      return `reminders:${hash}`;
    }
    return `${systemTask.type}:${systemTask.id ?? 'unknown'}`;
  }
}
