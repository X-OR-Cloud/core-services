import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId, Types } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Document } from './document.schema';
import { UpdateContentDto } from './document.dto';
import { ProjectService } from '../project/project.service';
import { FileService } from '../file/file.service';
import { DocumentRtcService } from '../document-rtc/document-rtc.service';
import { assertCanWriteDocument, canViewPrivateDocument, isSuperAdmin } from '../project/project-access.helper';
import {
  extractReferences,
  diffRemovedAttachments,
  AttachmentRef,
  MentionRef,
} from './markdown/extract-references';

/**
 * DocumentService
 * Manages document entities (user or AI agent generated documents)
 * Extends BaseService for automatic CRUD operations
 */
@Injectable()
export class DocumentService extends BaseService<Document> {
  protected readonly logger = new Logger(DocumentService.name);

  constructor(
    @InjectModel(Document.name) private documentModel: Model<Document>,
    private readonly projectService: ProjectService,
    private readonly fileService: FileService,
    private readonly rtcService: DocumentRtcService,
  ) {
    super(documentModel);
  }

  /**
   * Throw 409 DOCUMENT_IN_ACTIVE_SESSION if a realtime collab session is
   * currently open on a document. Used by MCP write paths (updateContent,
   * direct PATCH on content) to avoid clobbering live edits.
   */
  private async assertNoActiveSession(docId: string): Promise<void> {
    const active = await this.rtcService.isSessionActive(docId);
    if (!active) return;

    const editorCount = await this.rtcService.getActiveEditorCount(docId);
    throw new ConflictException({
      error: 'DOCUMENT_IN_ACTIVE_SESSION',
      statusCode: 409,
      message:
        `Document is currently being edited by ${editorCount || 'one or more'} user(s) in a live collaboration session. ` +
        `Your edit was not applied. Please ask the user to apply your suggestion manually via chat, or retry later when the session ends.`,
      documentId: docId,
      activeUserCount: editorCount,
    });
  }

  /**
   * Extract references and attach a matching `ownerRef` to any attachment files
   * that do not yet point at this document. Safe to call on every save.
   */
  private async syncReferences(
    docId: string,
    content: string | undefined,
  ): Promise<{ attachments: AttachmentRef[]; mentions: MentionRef[] }> {
    const { attachments, mentions } = extractReferences(content || '');

    // Adopt any attachment files that don't yet have ownerRef set to this doc.
    // We intentionally do not reassign if ownerRef already points at a different
    // document — that would indicate the user referenced a file shared from
    // elsewhere, and we don't want silent cross-document ownership drift.
    for (const att of attachments) {
      try {
        const file = await this.fileService.findByIdInternal(att.fileId);
        if (!file) continue;
        if (file.purpose !== 'attachment') continue;
        const current = (file as any).ownerRef;
        if (!current || !current.id) {
          await this.fileService.assignOwnerRef(att.fileId, {
            kind: 'document',
            id: docId,
          });
        }
      } catch (err: any) {
        this.logger.warn(
          `syncReferences: failed to adopt attachment ${att.fileId}: ${err.message}`,
        );
      }
    }

    return { attachments, mentions };
  }

  /**
   * Override create to force status as 'draft' and extract references from content.
   */
  async create(data: any, context: RequestContext): Promise<Partial<Document>> {
    data.status = 'draft';
    const { attachments, mentions } = extractReferences(data.content || '');
    data.attachments = attachments;
    data.mentions = mentions;

    const created = await super.create(data, context);

    // Adopt attachment files (set ownerRef) now that we know the document id.
    const createdId = (created as any)?._id?.toString();
    if (createdId && attachments.length > 0) {
      await this.syncReferences(createdId, data.content);
    }

    return created;
  }

  /**
   * Override findById to exclude content field and apply shareMode-based access control.
   *
   * shareMode = 'organization': all same-org users can view
   * shareMode = 'private':
   *   - no projectId: only creator, universe.owner, organization.owner
   *   - with projectId: project members + universe.owner, organization.owner
   */
  async findById(id: ObjectId, context: RequestContext): Promise<Document | null> {
    const ownerFilter: any = { _id: id, isDeleted: false };
    if (context.orgId) ownerFilter['owner.orgId'] = context.orgId;

    const doc = await this.documentModel.findOne(ownerFilter).select('-content').lean().exec() as Document | null;
    if (!doc) return null;

    return this.applyViewAccess(doc, context, false) ? doc : null;
  }

  /**
   * Find document by ID with full content (for /content endpoint)
   */
  async findByIdWithContent(id: ObjectId, context: RequestContext): Promise<Document | null> {
    const ownerFilter: any = { _id: id, isDeleted: false };
    if (context.orgId) ownerFilter['owner.orgId'] = context.orgId;

    const doc = await this.documentModel.findOne(ownerFilter).lean().exec() as Document | null;
    if (!doc) return null;

    return this.applyViewAccess(doc, context, true) ? doc : null;
  }

  /**
   * Apply view access control based on shareMode.
   * Returns true if the caller can view the document, false otherwise.
   * needsMembership=true performs async membership check (used by findByIdWithContent).
   */
  private async applyViewAccess(doc: any, context: RequestContext, needsMembership: boolean): Promise<boolean> {
    const shareMode = (doc as any).shareMode ?? 'private';

    // Creator always has full access regardless of shareMode or project
    if (canViewPrivateDocument(doc, context)) return true;

    if (shareMode === 'organization') {
      // All same-org members (filtered by owner.orgId in query) can view
      return true;
    }

    // shareMode === 'private'
    if ((doc as any).projectId) {
      // Project-linked: project members can view
      const memberIds = await this.projectService.getMemberProjectIds(context);
      if (memberIds !== undefined && !memberIds.has((doc as any).projectId.toString())) {
        return false;
      }
      return true;
    }

    // No project, private, not creator: deny
    return false;
  }

  /**
   * Find document by ID for public share access (no ownership or membership check)
   */
  async findByIdForShare(id: ObjectId): Promise<Document | null> {
    return this.documentModel.findOne({ _id: id, isDeleted: false }).lean().exec() as Promise<Document | null>;
  }

  /**
   * Build a MongoDB filter for findAll that enforces shareMode + membership rules:
   *
   * A document is visible if ANY of these conditions hold:
   *   1. shareMode = 'organization'  → visible to all same-org users
   *   2. super-admin                  → no restriction (returns null)
   *   3. private + no projectId       → only the creator
   *   4. private + projectId          → only project members
   */
  private async buildMembershipFilter(context: RequestContext): Promise<any | null> {
    if (isSuperAdmin(context)) return null; // super-admin: no restriction

    const memberIds = await this.projectService.getMemberProjectIds(context);

    // Build creator condition: docs where caller is the owner
    const creatorConditions: any[] = [];
    if (context.userId) creatorConditions.push({ 'owner.userId': context.userId });
    if (context.agentId) creatorConditions.push({ 'owner.agentId': context.agentId });

    const privateConditions: any[] = [];
    if (memberIds !== undefined && memberIds.size > 0) {
      // private project docs where caller is a member
      privateConditions.push({
        shareMode: { $in: ['private', null] },
        projectId: { $in: Array.from(memberIds) },
      });
    }

    return {
      $or: [
        // creator always sees their own docs regardless of shareMode/project
        ...creatorConditions,
        // organization-shared docs: all org members can view (orgId already filtered in findAll)
        { shareMode: 'organization' },
        ...privateConditions,
      ],
    };
  }

  /**
   * Override findAll with membership filter.
   * Documents belonging to projects the caller is not a member of are excluded globally.
   */
  async findAll(
    options: FindManyOptions,
    context: RequestContext
  ): Promise<FindManyResult<Document>> {
    const andConditions: any[] = [];

    // Handle search
    const searchQuery = options.search;
    if (searchQuery && typeof searchQuery === 'string') {
      const searchRegex = new RegExp(searchQuery, 'i');
      andConditions.push({
        $or: [
          { summary: searchRegex },
          { content: searchRegex },
          { labels: searchRegex },
        ],
      });
      delete options.search;
    }

    // Handle membership filter
    const membershipFilter = await this.buildMembershipFilter(context);
    if (membershipFilter) andConditions.push(membershipFilter);

    // Merge with existing filter
    if (andConditions.length > 0) {
      const existingFilter = options.filter ? { ...options.filter } : {};
      options.filter = andConditions.length === 1 && Object.keys(existingFilter).length === 0
        ? andConditions[0]
        : { $and: [existingFilter, ...andConditions] } as any;
    }

    const findResult = await super.findAll(options, context);

    // Exclude content field
    findResult.data = findResult.data.map((doc: any) => {
      const plainDoc = doc.toObject ? doc.toObject() : doc;
      const { content, ...rest } = plainDoc;
      return rest as Document;
    });

    // Aggregation
    const baseMatch: any = { isDeleted: false };
    if (context.orgId) baseMatch['owner.orgId'] = context.orgId;

    const matchFilter: any = options.filter && Object.keys(options.filter).length > 0
      ? { $and: [baseMatch, options.filter] }
      : baseMatch;

    const [statusStats, typeStats] = await Promise.all([
      super.aggregate([{ $match: matchFilter }, { $group: { _id: '$status', count: { $sum: 1 } } }], context),
      super.aggregate([{ $match: matchFilter }, { $group: { _id: '$type', count: { $sum: 1 } } }], context),
    ]);

    const statistics: any = { total: findResult.pagination.total, byStatus: {}, byType: {} };
    statusStats.forEach((stat: any) => { statistics.byStatus[stat._id] = stat.count; });
    typeStats.forEach((stat: any) => { statistics.byType[stat._id] = stat.count; });

    findResult.statistics = statistics;
    return findResult;
  }

  /**
   * Update document content with various operations
   * Supports: replace, find-replace-text, find-replace-regex, find-replace-markdown,
   *           append, append-after-text, append-to-section
   */
  async updateContent(id: ObjectId, updateDto: UpdateContentDto, context: RequestContext): Promise<Document> {
    // MCP / direct write path — reject if there is a live collab session so we
    // don't clobber a user's in-flight edits. Plan #3 error contract.
    await this.assertNoActiveSession(id.toString());

    const document = await this.findByIdWithContent(id, context);
    if (!document) throw new NotFoundException(`Document with ID ${id} not found`);

    const project = (document as any).projectId
      ? await this.projectService.getRawProjectById((document as any).projectId.toString())
      : null;
    assertCanWriteDocument(document, project, context);

    let updatedContent: string;
    switch (updateDto.operation) {
      case 'replace':
        updatedContent = this.replaceAllContent(updateDto);
        break;
      case 'find-replace-text':
        updatedContent = this.findReplaceText(document.content, updateDto);
        break;
      case 'find-replace-regex':
        updatedContent = this.findReplaceRegex(document.content, updateDto);
        break;
      case 'find-replace-markdown':
        updatedContent = this.findReplaceMarkdownSection(document.content, updateDto);
        break;
      case 'append':
        updatedContent = this.appendToEnd(document.content, updateDto);
        break;
      case 'append-after-text':
        updatedContent = this.appendAfterText(document.content, updateDto);
        break;
      case 'append-to-section':
        updatedContent = this.appendToSection(document.content, updateDto);
        break;
      default:
        throw new BadRequestException(`Invalid operation: ${updateDto.operation}`);
    }

    const ownerFilter: any = { _id: id, isDeleted: false };
    if (context.orgId) ownerFilter['owner.orgId'] = context.orgId;

    // Keep attachments/mentions indexes in sync with the new content
    const { attachments, mentions } = extractReferences(updatedContent);
    const removedAttachmentIds = diffRemovedAttachments(
      (document as any).attachments,
      attachments,
    );

    const updated = await this.documentModel
      .findOneAndUpdate(
        ownerFilter,
        {
          content: updatedContent,
          attachments,
          mentions,
          updatedBy: context.agentId || context.userId,
        },
        { new: true }
      )
      .exec();

    if (!updated) throw new NotFoundException(`Document with ID ${id} not found`);

    await this.syncReferences(id.toString(), updatedContent);
    if (removedAttachmentIds.length > 0) {
      await this.fileService
        .softDeleteManyByIds(removedAttachmentIds)
        .catch((err) =>
          this.logger.warn(`Failed to soft-delete orphaned attachments: ${err.message}`),
        );
    }

    return updated as Document;
  }

  private replaceAllContent(updateDto: UpdateContentDto): string {
    if (!updateDto.content) throw new BadRequestException('content field is required for replace operation');
    return updateDto.content;
  }

  private findReplaceText(content: string, updateDto: UpdateContentDto): string {
    if (!updateDto.find || updateDto.replace === undefined) {
      throw new BadRequestException('find and replace fields are required for find-replace-text operation');
    }
    const escapedFind = updateDto.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return content.replace(new RegExp(escapedFind, 'g'), updateDto.replace);
  }

  private findReplaceRegex(content: string, updateDto: UpdateContentDto): string {
    if (!updateDto.pattern || updateDto.replace === undefined) {
      throw new BadRequestException('pattern and replace fields are required for find-replace-regex operation');
    }
    try {
      return content.replace(new RegExp(updateDto.pattern, updateDto.flags || 'g'), updateDto.replace);
    } catch (error) {
      throw new BadRequestException(`Invalid regex pattern: ${error.message}`);
    }
  }

  private findReplaceMarkdownSection(content: string, updateDto: UpdateContentDto): string {
    if (!updateDto.section || !updateDto.sectionContent) {
      throw new BadRequestException('section and sectionContent fields are required for find-replace-markdown operation');
    }
    const match = updateDto.section.match(/^(#{1,6})\s/);
    if (!match) throw new BadRequestException('section must be a valid markdown heading (e.g., "## API Spec")');
    const headingLevel = match[1].length;
    const escaped = updateDto.section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${escaped}\\s*\\n([\\s\\S]*?)(?=\\n#{1,${headingLevel}}\\s|$)`, 'i');
    if (!content.match(regex)) throw new BadRequestException(`Markdown section "${updateDto.section}" not found in document`);
    return content.replace(regex, updateDto.sectionContent + '\n');
  }

  private appendToEnd(content: string, updateDto: UpdateContentDto): string {
    if (!updateDto.content) throw new BadRequestException('content field is required for append operation');
    return content + updateDto.content;
  }

  private appendAfterText(content: string, updateDto: UpdateContentDto): string {
    if (!updateDto.find || !updateDto.content) {
      throw new BadRequestException('find and content fields are required for append-after-text operation');
    }
    const index = content.indexOf(updateDto.find);
    if (index === -1) throw new BadRequestException(`Text "${updateDto.find}" not found in document`);
    const pos = index + updateDto.find.length;
    return content.slice(0, pos) + updateDto.content + content.slice(pos);
  }

  private appendToSection(content: string, updateDto: UpdateContentDto): string {
    if (!updateDto.section || !updateDto.content) {
      throw new BadRequestException('section and content fields are required for append-to-section operation');
    }
    const match = updateDto.section.match(/^(#{1,6})\s/);
    if (!match) throw new BadRequestException('section must be a valid markdown heading (e.g., "## API Spec")');
    const headingLevel = match[1].length;
    const escaped = updateDto.section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${escaped}\\s*\\n([\\s\\S]*?)(?=\\n#{1,${headingLevel}}\\s|$)`, 'i');
    const sectionMatch = content.match(regex);
    if (!sectionMatch) throw new BadRequestException(`Markdown section "${updateDto.section}" not found in document`);
    const insertPosition = content.search(regex) + sectionMatch[0].length;
    return content.slice(0, insertPosition) + updateDto.content + content.slice(insertPosition);
  }

  /**
   * Override update to enforce write access:
   * - super-admin: always allowed
   * - project.lead (if doc has projectId): allowed
   * - creator (createdBy): allowed
   * - others: ForbiddenException
   */
  async update(id: ObjectId, data: any, context: RequestContext): Promise<Partial<Document>> {
    // If the caller is updating the content body and there is an active
    // collab session, reject with DOCUMENT_IN_ACTIVE_SESSION. Metadata-only
    // updates (labels, status, shareMode, etc.) are allowed through.
    if (data.content !== undefined) {
      await this.assertNoActiveSession(id.toString());
    }

    const doc = await this.findByIdWithContent(id, context);
    if (!doc) throw new NotFoundException(`Document with ID ${id} not found`);

    const project = (doc as any).projectId
      ? await this.projectService.getRawProjectById((doc as any).projectId.toString())
      : null;

    assertCanWriteDocument(doc, project, context);

    // If content changed, re-extract references so attachments/mentions indexes stay in sync
    let removedAttachmentIds: string[] = [];
    if (data.content !== undefined && data.content !== doc.content) {
      const { attachments, mentions } = extractReferences(data.content || '');
      data.attachments = attachments;
      data.mentions = mentions;
      removedAttachmentIds = diffRemovedAttachments((doc as any).attachments, attachments);
    }

    const result = await super.update(id, data, context);

    if (data.content !== undefined) {
      await this.syncReferences(id.toString(), data.content);
    }
    if (removedAttachmentIds.length > 0) {
      await this.fileService
        .softDeleteManyByIds(removedAttachmentIds)
        .catch((err) =>
          this.logger.warn(`Failed to soft-delete orphaned attachments: ${err.message}`),
        );
    }

    return result;
  }

  /**
   * Override softDelete to enforce write access:
   * - super-admin: always allowed
   * - project.lead (if doc has projectId): allowed
   * - creator (createdBy): allowed
   * - others: ForbiddenException
   */
  async softDelete(id: ObjectId, context: RequestContext): Promise<Partial<Document>> {
    const doc = await this.findById(id, context);
    if (!doc) throw new NotFoundException(`Document with ID ${id} not found`);

    const project = (doc as any).projectId
      ? await this.projectService.getRawProjectById((doc as any).projectId.toString())
      : null;

    assertCanWriteDocument(doc, project, context);

    const result = await super.softDelete(id, context);

    // Cascade: soft-delete all attachments referenced by this document
    const attachmentIds = ((doc as any).attachments || []).map((a: any) => a.fileId);
    if (attachmentIds.length > 0) {
      await this.fileService
        .softDeleteManyByIds(attachmentIds)
        .catch((err) =>
          this.logger.warn(`Failed to cascade-delete document attachments: ${err.message}`),
        );
    }

    return result;
  }

  /**
   * Public guard used by DocumentController (e.g. attachment upload endpoint)
   * to verify the caller has write access on a document without re-fetching.
   */
  async assertCanWriteDocument(doc: Document, context: RequestContext): Promise<void> {
    const project = (doc as any).projectId
      ? await this.projectService.getRawProjectById((doc as any).projectId.toString())
      : null;
    assertCanWriteDocument(doc, project, context);
  }

  /**
   * Commit a collaborative draft into the canonical content body.
   *
   * Plan #3: the client serializes the current BlockNote state to markdown
   * via `editor.blocksToMarkdownLossy()` and posts it here. The server does
   * NOT run BlockNote; we trust the caller (who must be authenticated + have
   * write access) to provide the serialized form. In exchange we:
   *   1. Verify the caller has write access.
   *   2. Overwrite `content` markdown with the provided body.
   *   3. Re-extract attachments/mentions and cascade orphans (same flow as
   *      a normal update).
   *   4. Clear `draftState` so the next fresh connection re-seeds from
   *      markdown — this prevents stale Y.Doc blobs from overriding the
   *      committed content on reconnect.
   *   5. Publish a commit event on Redis so cbm:rtc can notify live clients.
   *
   * Important: unlike `update()`, this method intentionally does NOT reject
   * when a session is active — the whole point of commit is to flush the
   * active session's draft.
   */
  async commitDraft(
    id: ObjectId,
    body: { content?: string },
    context: RequestContext,
  ): Promise<{ hasActiveDraft: boolean; committed: boolean; message: string }> {
    const doc = await this.findByIdWithContent(id, context);
    if (!doc) throw new NotFoundException(`Document with ID ${id} not found`);

    const project = (doc as any).projectId
      ? await this.projectService.getRawProjectById((doc as any).projectId.toString())
      : null;
    assertCanWriteDocument(doc, project, context);

    if (body?.content === undefined) {
      return {
        hasActiveDraft: (doc as any).hasActiveDraft || false,
        committed: false,
        message:
          'No content provided. Send the current editor state as `content` (markdown) to commit.',
      };
    }

    const docIdStr = id.toString();

    // Extract references + diff orphans against the existing content
    const { attachments, mentions } = extractReferences(body.content);
    const removedAttachmentIds = diffRemovedAttachments(
      (doc as any).attachments,
      attachments,
    );

    // Write the committed content + clear draft state in a single update
    const ownerFilter: any = { _id: id, isDeleted: false };
    if (context.orgId) ownerFilter['owner.orgId'] = context.orgId;
    const updated = await this.documentModel
      .findOneAndUpdate(
        ownerFilter,
        {
          content: body.content,
          attachments,
          mentions,
          draftState: null,
          draftUpdatedAt: null,
          hasActiveDraft: false,
          updatedBy: context,
        },
        { new: true },
      )
      .exec();

    if (!updated) throw new NotFoundException(`Document with ID ${id} not found`);

    // Sync attachment ownerRefs + cascade orphans (best effort)
    await this.syncReferences(docIdStr, body.content);
    if (removedAttachmentIds.length > 0) {
      await this.fileService
        .softDeleteManyByIds(removedAttachmentIds)
        .catch((err) =>
          this.logger.warn(`Failed to soft-delete orphaned attachments: ${err.message}`),
        );
    }

    // Notify cbm:rtc so live clients can reload fresh content
    await this.rtcService
      .publishCommitted(docIdStr, context.userId || context.agentId || 'unknown')
      .catch((err) =>
        this.logger.warn(`Failed to publish commit event: ${err.message}`),
      );

    return {
      hasActiveDraft: false,
      committed: true,
      message: 'Draft committed successfully.',
    };
  }

  /**
   * Return the session status of a document for the FE editor UI (badge,
   * active editor count). Called from GET /documents/:id/session-status.
   */
  async getSessionStatus(
    id: ObjectId,
    context: RequestContext,
  ): Promise<{ hasActiveDraft: boolean; draftUpdatedAt: Date | null; activeEditorCount: number }> {
    const doc = await this.findById(id, context);
    if (!doc) throw new NotFoundException(`Document with ID ${id} not found`);
    const docIdStr = id.toString();

    return {
      hasActiveDraft: (doc as any).hasActiveDraft || false,
      draftUpdatedAt: (doc as any).draftUpdatedAt || null,
      activeEditorCount: await this.rtcService.getActiveEditorCount(docIdStr),
    };
  }
}
