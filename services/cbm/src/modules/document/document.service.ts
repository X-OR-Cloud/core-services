import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Document } from './document.schema';
import { UpdateContentDto } from './document.dto';
import { ProjectService } from '../project/project.service';
import { assertCanDeleteDocument } from '../project/project-access.helper';

/**
 * DocumentService
 * Manages document entities (user or AI agent generated documents)
 * Extends BaseService for automatic CRUD operations
 */
@Injectable()
export class DocumentService extends BaseService<Document> {
  constructor(
    @InjectModel(Document.name) private documentModel: Model<Document>,
    private readonly projectService: ProjectService,
  ) {
    super(documentModel);
  }

  /**
   * Override create to force status as 'draft'
   */
  async create(data: any, context: RequestContext): Promise<Partial<Document>> {
    data.status = 'draft';
    return super.create(data, context);
  }

  /**
   * Override findById to exclude content field and respect ownership.
   * If the document belongs to a project, caller must be a project member.
   */
  async findById(id: ObjectId, context: RequestContext): Promise<Document | null> {
    const ownerFilter: any = { _id: id, isDeleted: false };
    if (context.orgId) ownerFilter['owner.orgId'] = context.orgId;

    const doc = await this.documentModel.findOne(ownerFilter).select('-content').lean().exec() as Document | null;
    if (!doc) return null;

    if ((doc as any).projectId) {
      const memberIds = await this.projectService.getMemberProjectIds(context);
      if (memberIds !== undefined && !memberIds.has((doc as any).projectId.toString())) {
        return null;
      }
    }

    return doc;
  }

  /**
   * Find document by ID with full content (for /content endpoint)
   */
  async findByIdWithContent(id: ObjectId, context: RequestContext): Promise<Document | null> {
    const ownerFilter: any = { _id: id, isDeleted: false };
    if (context.orgId) ownerFilter['owner.orgId'] = context.orgId;

    const doc = await this.documentModel.findOne(ownerFilter).lean().exec() as Document | null;
    if (!doc) return null;

    if ((doc as any).projectId) {
      const memberIds = await this.projectService.getMemberProjectIds(context);
      if (memberIds !== undefined && !memberIds.has((doc as any).projectId.toString())) {
        return null;
      }
    }

    return doc;
  }

  /**
   * Find document by ID for public share access (no ownership or membership check)
   */
  async findByIdForShare(id: ObjectId): Promise<Document | null> {
    return this.documentModel.findOne({ _id: id, isDeleted: false }).lean().exec() as Promise<Document | null>;
  }

  /**
   * Build a MongoDB filter that excludes documents belonging to projects
   * where the caller is not a member. Returns null if no filter is needed (super-admin).
   */
  private async buildMembershipFilter(context: RequestContext): Promise<any | null> {
    const memberIds = await this.projectService.getMemberProjectIds(context);
    if (memberIds === undefined) return null; // super-admin: no restriction

    return {
      $or: [
        { projectId: { $exists: false } },
        { projectId: null },
        { projectId: { $in: Array.from(memberIds) } },
      ],
    };
  }

  /**
   * Override findAll with membership filter.
   * Documents belonging to projects the caller is not a member of are excluded globally.
   */
  async findAll(
    options: FindManyOptions & { search?: string },
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
          { labels: searchQuery },
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
    const document = await this.findByIdWithContent(id, context);
    if (!document) throw new NotFoundException(`Document with ID ${id} not found`);

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

    const updated = await this.documentModel
      .findOneAndUpdate(
        ownerFilter,
        { content: updatedContent, updatedBy: context.agentId || context.userId },
        { new: true }
      )
      .exec();

    if (!updated) throw new NotFoundException(`Document with ID ${id} not found`);
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
   * Override softDelete to restrict deletion to project.lead and super-admin.
   * Project members cannot delete documents.
   */
  async softDelete(id: ObjectId, context: RequestContext): Promise<Document | null> {
    const doc = await this.findById(id, context);
    if (!doc) throw new NotFoundException(`Document with ID ${id} not found`);

    if ((doc as any).projectId) {
      const project = await this.projectService.getRawProjectById((doc as any).projectId.toString());
      if (project) {
        assertCanDeleteDocument(project, context);
      }
    }

    return super.softDelete(id, context);
  }
}
