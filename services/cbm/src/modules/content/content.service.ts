import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { BaseService, FindManyOptions, FindManyResult } from '@hydrabyte/base';
import { RequestContext } from '@hydrabyte/shared';
import { Content } from './content.schema';
import { UpdateBodyDto } from './content.dto';

/**
 * ContentService
 * Manages content entities (user or AI agent generated content)
 * Extends BaseService for automatic CRUD operations
 */
@Injectable()
export class ContentService extends BaseService<Content> {
  constructor(
    @InjectModel(Content.name) private contentModel: Model<Content>
  ) {
    super(contentModel);
  }

  /**
   * Override findById to exclude content field and respect ownership
   */
  async findById(
    id: ObjectId,
    context: RequestContext
  ): Promise<Content | null> {
    // Build owner filter based on context
    const ownerFilter: any = {
      _id: id,
      isDeleted: false,
    };

    // Add ownership check
    if (context.orgId) {
      ownerFilter['owner.orgId'] = context.orgId;
    }

    return this.contentModel
      .findOne(ownerFilter)
      .select('-body')
      .lean()
      .exec() as Promise<Content | null>;
  }

  /**
   * Find document by ID with full content (for /content endpoint)
   * Respects ownership - only returns documents owned by the requesting user/org
   */
  async findByIdWithContent(
    id: ObjectId,
    context: RequestContext
  ): Promise<Content | null> {
    // Build owner filter based on context
    const ownerFilter: any = {
      _id: id,
      isDeleted: false,
    };

    // Add ownership check
    if (context.orgId) {
      ownerFilter['owner.orgId'] = context.orgId;
    }

    return this.contentModel
      .findOne(ownerFilter)
      .lean()
      .exec() as Promise<Content | null>;
  }

  /**
   * Override findAll to handle statistics aggregation and optimize response
   * Aggregates by type and status
   * Excludes 'body' field to reduce response size (using projection for performance)
   * Supports search query for summary, body, and labels
   */
  async findAll(
    options: FindManyOptions & { search?: string },
    context: RequestContext
  ): Promise<FindManyResult<Content>> {

    // Handle search parameter - convert to MongoDB filter
    const searchQuery = options.search || (options.filter as any)?.search;
    if (searchQuery && typeof searchQuery === 'string') {
      const searchRegex = new RegExp(searchQuery, 'i');

      // Build search conditions
      const searchConditions = [
        { summary: searchRegex },
        { body: searchRegex },
        { labels: searchQuery }, // Exact match for labels array
      ];

      // Get existing filter fields (excluding search)
      const existingFilter: any = {};
      if (options) {
        Object.keys(options).forEach(key => {
          if (key !== 'search') {
            existingFilter[key] = (options as any)[key];
          }
        });
      }

      options = {
        ...existingFilter,
        $or: searchConditions,
      };

      // Clean up search parameter
      delete options.search;
    }

    const findResult = await super.findAll(options, context);

    // Exclude body field from results to reduce response size
    findResult.data = findResult.data.map((doc: any) => {
      // Convert Mongoose document to plain object
      const plainDoc = doc.toObject ? doc.toObject() : doc;
      const { body, ...rest } = plainDoc;
      return rest as Content;
    });

    // Build base match filter for aggregation (same as what BaseService uses)
    const baseMatch: any = {
      isDeleted: false,
    };

    if (context.orgId) {
      baseMatch['owner.orgId'] = context.orgId;
    }

    // Merge with search filters if any using $and to avoid conflicts
    let matchFilter: any;
    if (options.filter && Object.keys(options.filter).length > 0) {
      matchFilter = {
        $and: [baseMatch, options.filter]
      };
    } else {
      matchFilter = baseMatch;
    }

    // Aggregate statistics by status
    const statusStats = await super.aggregate(
      [
        { $match: matchFilter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ],
      context
    );

    // Aggregate statistics by type
    const typeStats = await super.aggregate(
      [
        { $match: matchFilter },
        {
          $group: {
            _id: '$type',
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

    // Map type statistics
    typeStats.forEach((stat: any) => {
      statistics.byType[stat._id] = stat.count;
    });

    findResult.statistics = statistics;
    return findResult;
  }

  /**
   * Update content body with various operations
   * Supports: replace, find-replace-text, find-replace-regex, find-replace-markdown,
   *           append, append-after-text, append-to-section
   */
  async updateBody(
    id: ObjectId,
    updateDto: UpdateBodyDto,
    context: RequestContext
  ): Promise<Content> {
    // Get the document with full content
    const document = await this.findByIdWithContent(id, context);
    if (!document) {
      throw new NotFoundException(`Document with ID ${id} not found`);
    }

    let updatedContent: string;

    switch (updateDto.operation) {
      case 'replace':
        updatedContent = this.replaceAllBody(updateDto);
        break;
      case 'find-replace-text':
        updatedContent = this.findReplaceText(document.body, updateDto);
        break;
      case 'find-replace-regex':
        updatedContent = this.findReplaceRegex(document.body, updateDto);
        break;
      case 'find-replace-markdown':
        updatedContent = this.findReplaceMarkdownSection(
          document.body,
          updateDto
        );
        break;
      case 'append':
        updatedContent = this.appendToEnd(document.body, updateDto);
        break;
      case 'append-after-text':
        updatedContent = this.appendAfterText(document.body, updateDto);
        break;
      case 'append-to-section':
        updatedContent = this.appendToSection(document.body, updateDto);
        break;
      default:
        throw new BadRequestException(
          `Invalid operation: ${updateDto.operation}`
        );
    }

    // Build owner filter for update
    const ownerFilter: any = {
      _id: id,
      isDeleted: false,
    };

    if (context.orgId) {
      ownerFilter['owner.orgId'] = context.orgId;
    }

    // Update the document with new body
    const updated = await this.contentModel
      .findOneAndUpdate(
        ownerFilter,
        {
          body: updatedContent,
          updatedBy: context.agentId || context.userId,
        },
        { new: true }
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(`Content with ID ${id} not found`);
    }

    return updated as Content;
  }

  /**
   * Replace all content
   */
  private replaceAllBody(updateDto: UpdateBodyDto): string {
    if (!updateDto.body) {
      throw new BadRequestException(
        'content field is required for replace operation'
      );
    }
    return updateDto.body;
  }

  /**
   * Find and replace text (case-insensitive by default)
   */
  private findReplaceText(
    content: string,
    updateDto: UpdateBodyDto
  ): string {
    if (!updateDto.find || updateDto.replace === undefined) {
      throw new BadRequestException(
        'find and replace fields are required for find-replace-text operation'
      );
    }

    // Escape special regex characters in the find text
    const escapedFind = updateDto.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedFind, 'g');

    return content.replace(regex, updateDto.replace);
  }

  /**
   * Find and replace using regex pattern
   */
  private findReplaceRegex(
    content: string,
    updateDto: UpdateBodyDto
  ): string {
    if (!updateDto.pattern || updateDto.replace === undefined) {
      throw new BadRequestException(
        'pattern and replace fields are required for find-replace-regex operation'
      );
    }

    try {
      const flags = updateDto.flags || 'g';
      const regex = new RegExp(updateDto.pattern, flags);
      return content.replace(regex, updateDto.replace);
    } catch (error) {
      throw new BadRequestException(`Invalid regex pattern: ${error.message}`);
    }
  }

  /**
   * Find and replace markdown section
   * Finds a markdown heading and replaces content until the next heading of same or higher level
   */
  private findReplaceMarkdownSection(
    content: string,
    updateDto: UpdateBodyDto
  ): string {
    if (!updateDto.section || !updateDto.sectionContent) {
      throw new BadRequestException(
        'section and sectionContent fields are required for find-replace-markdown operation'
      );
    }

    // Extract heading level from the section (count # characters)
    const sectionHeadingMatch = updateDto.section.match(/^(#{1,6})\s/);
    if (!sectionHeadingMatch) {
      throw new BadRequestException(
        'section must be a valid markdown heading (e.g., "## API Spec")'
      );
    }

    const headingLevel = sectionHeadingMatch[1].length;
    const escapedSection = updateDto.section.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );

    // Create regex to find the section and its content
    // Matches from the section heading until:
    // 1. Next heading of same or higher level (fewer or equal # characters)
    // 2. End of content
    const sectionRegex = new RegExp(
      `${escapedSection}\\s*\\n` + // The section heading
        `([\\s\\S]*?)` + // Content (captured)
        `(?=\\n#{1,${headingLevel}}\\s|$)`, // Look ahead for same/higher level heading or end
      'i'
    );

    const match = content.match(sectionRegex);
    if (!match) {
      throw new BadRequestException(
        `Markdown section "${updateDto.section}" not found in document`
      );
    }

    // Replace the matched section with new content
    return content.replace(sectionRegex, updateDto.sectionContent + '\n');
  }

  /**
   * Append content to end of document
   */
  private appendToEnd(content: string, updateDto: UpdateBodyDto): string {
    if (!updateDto.body) {
      throw new BadRequestException(
        'content field is required for append operation'
      );
    }
    return content + updateDto.body;
  }

  /**
   * Append content after a text match
   */
  private appendAfterText(
    content: string,
    updateDto: UpdateBodyDto
  ): string {
    if (!updateDto.find || !updateDto.body) {
      throw new BadRequestException(
        'find and content fields are required for append-after-text operation'
      );
    }

    const index = content.indexOf(updateDto.find);
    if (index === -1) {
      throw new BadRequestException(
        `Text "${updateDto.find}" not found in document`
      );
    }

    const insertPosition = index + updateDto.find.length;
    return (
      content.slice(0, insertPosition) +
      updateDto.body +
      content.slice(insertPosition)
    );
  }

  /**
   * Append content to a markdown section
   * Appends at the end of the section, before the next same/higher level heading
   */
  private appendToSection(
    content: string,
    updateDto: UpdateBodyDto
  ): string {
    if (!updateDto.section || !updateDto.body) {
      throw new BadRequestException(
        'section and content fields are required for append-to-section operation'
      );
    }

    // Extract heading level from the section
    const sectionHeadingMatch = updateDto.section.match(/^(#{1,6})\s/);
    if (!sectionHeadingMatch) {
      throw new BadRequestException(
        'section must be a valid markdown heading (e.g., "## API Spec")'
      );
    }

    const headingLevel = sectionHeadingMatch[1].length;
    const escapedSection = updateDto.section.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );

    // Create regex to find the section and its content
    const sectionRegex = new RegExp(
      `${escapedSection}\\s*\\n` + // The section heading
        `([\\s\\S]*?)` + // Content (captured)
        `(?=\\n#{1,${headingLevel}}\\s|$)`, // Look ahead for next heading or end
      'i'
    );

    const match = content.match(sectionRegex);
    if (!match) {
      throw new BadRequestException(
        `Markdown section "${updateDto.section}" not found in document`
      );
    }

    // Find the position to insert (end of matched section)
    const matchIndex = content.search(sectionRegex);
    const matchLength = match[0].length;
    const insertPosition = matchIndex + matchLength;

    return (
      content.slice(0, insertPosition) +
      updateDto.body +
      content.slice(insertPosition)
    );
  }
}
