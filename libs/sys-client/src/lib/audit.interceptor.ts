import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { SysAuditClient } from './sys-audit-client.service';
import { AUDIT_METADATA_KEY, AuditConfig } from './audit.decorator';

const SYSTEM_ORG = 'system';

/**
 * AuditInterceptor — wraps controller handlers marked with `@Audit()` to
 * automatically emit an audit event on success or failure.
 *
 * Captured fields:
 *   - actor: extracted from req.user (RequestContext) or 'system' for unauth/internal
 *   - requestPayload: req.body (sanitized by lib before enqueue)
 *   - responseSummary: { id, status, size } from response
 *   - durationMs: handler latency
 *   - correlationId: req.correlationId
 *   - errorMessage/errorCode on failure
 *
 * Ref: docs/sys/PROPOSAL.md §6.6
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: SysAuditClient,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const config = this.reflector.get<AuditConfig>(AUDIT_METADATA_KEY, ctx.getHandler());
    if (!config) return next.handle();

    const req = ctx.switchToHttp().getRequest();
    const start = Date.now();
    const actor = this._extractActor(req);
    const correlationId = req?.correlationId;
    const capturePayload = config.capturePayload !== false;
    const captureResourceId = config.captureResourceId !== false;
    const requestPayload = capturePayload ? req?.body : undefined;

    return next.handle().pipe(
      tap((response) => {
        const responseSummary = this._summarizeResponse(response);
        this.audit.log({
          resource: config.resource,
          resourceId: captureResourceId ? responseSummary?.id : undefined,
          action: config.action,
          keyType: config.keyType,
          actor,
          requestPayload,
          responseSummary,
          result: 'success',
          correlationId,
          occurredAt: new Date(),
          durationMs: Date.now() - start,
        });
      }),
      catchError((err) => {
        this.audit.log({
          resource: config.resource,
          action: config.action,
          keyType: config.keyType,
          actor,
          requestPayload,
          result: 'failure',
          errorMessage: err?.message,
          errorCode: err?.code ?? err?.status?.toString(),
          correlationId,
          occurredAt: new Date(),
          durationMs: Date.now() - start,
        });
        return throwError(() => err);
      }),
    );
  }

  private _extractActor(req: any): {
    userId?: string;
    orgId: string;
    agentId?: string;
    appId?: string;
    ipAddress?: string;
    userAgent?: string;
  } {
    const u = req?.user || {};
    return {
      userId: u.userId,
      orgId: u.orgId || SYSTEM_ORG,
      agentId: u.agentId,
      appId: u.appId,
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent'],
    };
  }

  private _summarizeResponse(response: unknown): {
    id?: string;
    status?: number;
    size?: number;
  } {
    if (!response || typeof response !== 'object') return { size: 0 };
    const r = response as Record<string, unknown>;
    const id =
      (r['id'] as string | undefined) ??
      (r['_id'] !== undefined ? String(r['_id']) : undefined);
    let size = 0;
    try {
      size = JSON.stringify(response).length;
    } catch {
      // leave size = 0
    }
    return { id, size };
  }
}
