# Content Module Implementation Plan

**Date**: 2025-12-18
**Status**: Planning Phase
**Owner**: backend-dev

---

## Executive Summary

Create new **Content** module alongside existing **Document** module to support multimedia content (images, videos) with future extensibility. Document module will be deprecated gradually as frontend apps migrate to Content APIs.

---

## 1. Current State Analysis

### 1.1 Document Module Overview

**Location**: `services/cbm/src/modules/document/`

**Files**:
- `document.schema.ts` - MongoDB schema
- `document.dto.ts` - DTOs for validation
- `document.service.ts` - Business logic with search & content operations
- `document.controller.ts` - REST API endpoints
- `document.module.ts` - NestJS module configuration

**Features**:
- ✅ CRUD operations with RBAC
- ✅ Full-text search (summary, content, labels)
- ✅ Content operations: replace, find-replace (text/regex/markdown), append (end/after-text/to-section)
- ✅ Soft delete with ownership
- ✅ Statistics aggregation (by status, by type)
- ✅ Pagination support

**Schema**:
```typescript
{
  summary: string;              // max 500 chars
  content: string;              // text content
  type: 'html' | 'text' | 'markdown' | 'json';
  labels: string[];
  status: 'draft' | 'published' | 'archived';
  scope: 'public' | 'org' | 'private';
  owner: { orgId, groupId, userId, agentId, appId };
  createdBy, updatedBy, createdAt, updatedAt;
  isDeleted, deletedAt;
}
```

**API Endpoints**:
- `POST /documents` - Create
- `GET /documents` - List with search & filters
- `GET /documents/:id` - Get metadata (no content)
- `GET /documents/:id/content` - Get with full content
- `PATCH /documents/:id` - Update metadata
- `PATCH /documents/:id/content` - Advanced content operations
- `DELETE /documents/:id` - Soft delete

**Dependencies (External usages)**:
1. **CBM AppModule**: Imports DocumentModule
2. **AIWM MCP Tools**: `services/aiwm/src/mcp/builtin/cbm/document-management/executors.ts`
   - Uses Document APIs via HTTP calls
   - Tools: create_document, search_documents, get_document, update_document_content, delete_document

### 1.2 Limitations

❌ **Current limitations**:
1. No support for media files (images, videos, audio)
2. Cannot store binary data or references
3. No thumbnail/preview support
4. Content field limited to text-based formats
5. No media metadata (dimensions, duration, MIME types)

---

## 2. Content Module Design

### 2.1 Goals

1. ✅ **Multimedia Support**: Handle text, images, videos, audio
2. ✅ **Backward Compatible**: Coexist with Document module
3. ✅ **Extensible**: Easy to add new content types
4. ✅ **Performance**: Efficient storage and retrieval
5. ✅ **Future-proof**: Support for AI workflows and agent collaboration

### 2.2 Content Schema Design

**Location**: `services/cbm/src/modules/content/content.schema.ts`

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export type ContentDocument = Content & MongooseDocument;

/**
 * MediaAttachment - Reference to media files stored externally
 */
export interface MediaAttachment {
  id: string;                    // Unique attachment ID
  type: 'image' | 'video' | 'audio' | 'file';

  // Storage reference
  storageProvider: 'minio' | 's3' | 'url';  // Where it's stored
  storageKey?: string;           // Object key (for minio/s3)
  url: string;                   // Access URL (public or signed)

  // File metadata
  originalName: string;          // Original filename
  size: number;                  // File size in bytes
  mime: string;                  // MIME type (image/jpeg, video/mp4)

  // Media-specific metadata
  dimensions?: {
    width: number;
    height: number;
  };
  duration?: number;             // For video/audio (seconds)
  thumbnail?: string;            // Small base64 preview (< 100KB)

  // Processing status (for future async processing)
  processingStatus?: 'pending' | 'processing' | 'complete' | 'failed';
  processingError?: string;

  // Timestamps
  uploadedAt: Date;
}

/**
 * Content - Universal content type supporting text and multimedia
 */
@Schema({ timestamps: true })
export class Content extends BaseSchema {
  @Prop({ required: true, maxlength: 500 })
  summary!: string;              // Content summary/title

  @Prop({ required: true })
  body!: string;                 // Main text content (renamed from 'content' for clarity)

  @Prop({
    required: true,
    enum: ['text', 'html', 'markdown', 'json', 'multipart']  // Added 'multipart'
  })
  contentType!: string;          // Type of body content

  @Prop({ type: [Object], default: [] })
  attachments!: MediaAttachment[];  // Media attachments

  @Prop({ type: [String], default: [] })
  labels!: string[];             // Labels for categorization

  @Prop({ enum: ['draft', 'published', 'archived'], default: 'draft' })
  status?: string;

  @Prop({ enum: ['public', 'org', 'private'], default: 'private' })
  scope?: string;

  // Optional: For future AI analysis
  @Prop({ type: Object })
  aiMetadata?: {
    generatedBy?: string;        // AI model/agent ID
    confidence?: number;         // Generation confidence
    tags?: string[];             // AI-generated tags
    summary?: string;            // AI-generated summary
  };

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, isDeleted, metadata, timestamps
}

export const ContentSchema = SchemaFactory.createForClass(Content);

// Indexes for performance
ContentSchema.index({ contentType: 1, status: 1 });
ContentSchema.index({ labels: 1 });
ContentSchema.index({ summary: 'text', body: 'text' });  // Full-text search
ContentSchema.index({ createdAt: -1 });
ContentSchema.index({ 'owner.orgId': 1, status: 1 });
ContentSchema.index({ 'attachments.type': 1 });  // Search by attachment type
```

### 2.3 Key Schema Differences from Document

| Field | Document | Content | Reason |
|-------|----------|---------|--------|
| Main text | `content` | `body` | Avoid confusion with "content" as entity name |
| Type field | `type` | `contentType` | Clearer naming |
| Media | ❌ None | ✅ `attachments[]` | New capability |
| Types | 4 types | 5 types (added `multipart`) | Support mixed content |
| AI metadata | ❌ None | ✅ `aiMetadata` | Future AI features |

### 2.4 Content DTOs

**Location**: `services/cbm/src/modules/content/content.dto.ts`

```typescript
import {
  IsString, IsEnum, IsArray, IsOptional,
  MaxLength, IsNumber, IsObject, ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '@hydrabyte/base';

// ========== Create Content DTO ==========
export class CreateContentDto {
  @ApiProperty({
    description: 'Content summary or title',
    maxLength: 500,
    example: 'Product Launch Report Q4 2025'
  })
  @IsString()
  @MaxLength(500)
  summary!: string;

  @ApiProperty({
    description: 'Main text content',
    example: '# Executive Summary\n\nOur Q4 launch exceeded expectations...'
  })
  @IsString()
  body!: string;

  @ApiProperty({
    description: 'Content type',
    enum: ['text', 'html', 'markdown', 'json', 'multipart'],
    example: 'markdown'
  })
  @IsEnum(['text', 'html', 'markdown', 'json', 'multipart'])
  contentType!: string;

  @ApiPropertyOptional({
    description: 'Labels for categorization',
    type: [String],
    example: ['product', 'launch', 'report']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];

  @ApiPropertyOptional({
    description: 'Content status',
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  })
  @IsOptional()
  @IsEnum(['draft', 'published', 'archived'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Access scope',
    enum: ['public', 'org', 'private'],
    default: 'private'
  })
  @IsOptional()
  @IsEnum(['public', 'org', 'private'])
  scope?: string;
}

// ========== Update Content DTO ==========
export class UpdateContentDto {
  @ApiPropertyOptional({ description: 'Content summary' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @ApiPropertyOptional({ description: 'Content status' })
  @IsOptional()
  @IsEnum(['draft', 'published', 'archived'])
  status?: string;

  @ApiPropertyOptional({ description: 'Access scope' })
  @IsOptional()
  @IsEnum(['public', 'org', 'private'])
  scope?: string;

  @ApiPropertyOptional({ description: 'Labels' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];
}

// ========== Query/Search DTO ==========
export class ContentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search keyword (searches in summary, body, labels)',
    example: 'product launch'
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by content type',
    enum: ['text', 'html', 'markdown', 'json', 'multipart']
  })
  @IsOptional()
  @IsEnum(['text', 'html', 'markdown', 'json', 'multipart'])
  contentType?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['draft', 'published', 'archived']
  })
  @IsOptional()
  @IsEnum(['draft', 'published', 'archived'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter by attachment type',
    enum: ['image', 'video', 'audio', 'file']
  })
  @IsOptional()
  @IsEnum(['image', 'video', 'audio', 'file'])
  hasAttachmentType?: string;
}

// ========== Body Operations DTO (same as Document) ==========
export class UpdateBodyDto {
  @ApiProperty({
    description: 'Operation type',
    enum: [
      'replace',
      'find-replace-text',
      'find-replace-regex',
      'find-replace-markdown',
      'append',
      'append-after-text',
      'append-to-section',
    ],
    example: 'replace',
  })
  @IsEnum([
    'replace',
    'find-replace-text',
    'find-replace-regex',
    'find-replace-markdown',
    'append',
    'append-after-text',
    'append-to-section',
  ])
  operation!: string;

  @ApiPropertyOptional({ description: 'New content for replace operation' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ description: 'Text to find (for find-replace-text)' })
  @IsOptional()
  @IsString()
  find?: string;

  @ApiPropertyOptional({ description: 'Replacement text' })
  @IsOptional()
  @IsString()
  replace?: string;

  @ApiPropertyOptional({ description: 'Regex pattern (for find-replace-regex)' })
  @IsOptional()
  @IsString()
  pattern?: string;

  @ApiPropertyOptional({ description: 'Regex flags (for find-replace-regex)' })
  @IsOptional()
  @IsString()
  flags?: string;

  @ApiPropertyOptional({ description: 'Markdown section heading' })
  @IsOptional()
  @IsString()
  section?: string;

  @ApiPropertyOptional({ description: 'New section content' })
  @IsOptional()
  @IsString()
  sectionContent?: string;
}

// ========== Media Attachment DTO ==========
export class MediaAttachmentDto {
  @ApiProperty({ description: 'Attachment ID', example: 'att_abc123' })
  @IsString()
  id!: string;

  @ApiProperty({
    description: 'Media type',
    enum: ['image', 'video', 'audio', 'file']
  })
  @IsEnum(['image', 'video', 'audio', 'file'])
  type!: string;

  @ApiProperty({ description: 'Storage provider', enum: ['minio', 's3', 'url'] })
  @IsEnum(['minio', 's3', 'url'])
  storageProvider!: string;

  @ApiPropertyOptional({ description: 'Storage key (for minio/s3)' })
  @IsOptional()
  @IsString()
  storageKey?: string;

  @ApiProperty({ description: 'Access URL', example: 'https://cdn.example.com/file.jpg' })
  @IsString()
  url!: string;

  @ApiProperty({ description: 'Original filename', example: 'report-chart.png' })
  @IsString()
  originalName!: string;

  @ApiProperty({ description: 'File size in bytes', example: 2048576 })
  @IsNumber()
  size!: number;

  @ApiProperty({ description: 'MIME type', example: 'image/png' })
  @IsString()
  mime!: string;

  @ApiPropertyOptional({ description: 'Image/video dimensions' })
  @IsOptional()
  @IsObject()
  dimensions?: { width: number; height: number };

  @ApiPropertyOptional({ description: 'Duration in seconds (for video/audio)' })
  @IsOptional()
  @IsNumber()
  duration?: number;

  @ApiPropertyOptional({ description: 'Base64 thumbnail (< 100KB)' })
  @IsOptional()
  @IsString()
  thumbnail?: string;
}

export class AddAttachmentDto {
  @ApiProperty({ description: 'Attachment data' })
  @ValidateNested()
  @Type(() => MediaAttachmentDto)
  attachment!: MediaAttachmentDto;
}
```

### 2.5 API Endpoints Design

**Base Path**: `/contents`

| Method | Endpoint | Description | Body/Query |
|--------|----------|-------------|------------|
| POST | `/contents` | Create new content | CreateContentDto |
| GET | `/contents` | List contents (no body field) | ContentQueryDto |
| GET | `/contents/:id` | Get metadata (no body) | - |
| GET | `/contents/:id/full` | Get full content with body | - |
| PATCH | `/contents/:id` | Update metadata | UpdateContentDto |
| PATCH | `/contents/:id/body` | Update body content | UpdateBodyDto |
| DELETE | `/contents/:id` | Soft delete | - |
| POST | `/contents/:id/attachments` | Add attachment | AddAttachmentDto |
| GET | `/contents/:id/attachments` | List attachments | - |
| DELETE | `/contents/:id/attachments/:attachmentId` | Remove attachment | - |

**Note**: Actual media upload will be Phase 2 (requires storage service)

---

## 3. Implementation Phases

### Phase 1: Core Content Module (Week 1) ✅ PRIORITY

**Goal**: Create Content module with all Document features + attachment schema (no upload yet)

**Tasks**:
1. ✅ Create content.schema.ts with MediaAttachment interface
2. ✅ Create content.dto.ts with all DTOs
3. ✅ Create content.service.ts - copy from document.service.ts
   - Adapt search logic for `body` field instead of `content`
   - Add attachment filtering (hasAttachmentType query)
   - Keep all 7 body operations (replace, find-replace, append)
4. ✅ Create content.controller.ts with all endpoints
5. ✅ Create content.module.ts
6. ✅ Add ContentModule to CBM app.module.ts
7. ✅ Build and verify compilation
8. ✅ Create test script similar to test-document-module.sh

**Deliverables**:
- Working Content API with text-based content
- Attachment schema ready (but no upload functionality yet)
- Full test coverage

**Estimated**: 1 day

### Phase 2: AIWM MCP Integration (Week 1)

**Goal**: Update AIWM MCP tools to support Content APIs

**Tasks**:
1. ✅ Create new MCP tool directory: `services/aiwm/src/mcp/builtin/cbm/content-management/`
2. ✅ Copy from document-management and adapt:
   - `tools.ts` - Tool definitions
   - `executors.ts` - Execution logic
   - Update API paths: `/documents` → `/contents`
   - Update field names: `content` → `body`, `type` → `contentType`
3. ✅ Register new tools in `services/aiwm/src/mcp/builtin/cbm/index.ts`
4. ✅ Keep document-management tools (for backward compatibility)
5. ✅ Test with AIWM agent execution

**Deliverables**:
- MCP tools for content management
- Both document and content tools available

**Estimated**: 4 hours

### Phase 3: Documentation & Migration Guide (Week 1)

**Goal**: Document new APIs and provide migration guide

**Tasks**:
1. ✅ Create `docs/cbm/CONTENT-API.md` - Full API documentation
2. ✅ Create `docs/cbm/CONTENT-VS-DOCUMENT.md` - Comparison guide
3. ✅ Create `docs/cbm/MIGRATION-GUIDE.md` - Step-by-step migration
4. ✅ Update `docs/cbm/DOCUMENT-API-SIMPLE.md` - Add deprecation notice
5. ✅ Create migration script examples

**Deliverables**:
- Complete documentation
- Clear migration path for frontend teams

**Estimated**: 3 hours

### Phase 4: Media Upload (Week 2-3) - FUTURE

**Goal**: Implement actual media file upload

**Prerequisites**:
- MinIO or S3 setup
- Storage service implementation

**Tasks**:
1. Setup MinIO in docker-compose
2. Create StorageService in CBM or shared library
3. Implement multipart file upload
4. Thumbnail generation (using sharp library)
5. Signed URL generation
6. Update Content APIs to support file upload
7. Test with images and videos

**Estimated**: 3-5 days

### Phase 5: Advanced Media Features (Week 4+) - FUTURE

**Goal**: Enhanced media processing

**Tasks**:
- Video transcoding
- Image optimization
- OCR for images
- AI content analysis
- CDN integration

**Estimated**: TBD

---

## 4. Migration Strategy

### 4.1 Coexistence Period

**Duration**: 2-3 months

**Strategy**:
- ✅ Both Document and Content modules run in parallel
- ✅ Document APIs remain unchanged (no breaking changes)
- ✅ Frontend teams migrate at their own pace
- ✅ AIWM supports both document and content tools
- ✅ No data migration required (separate collections)

### 4.2 Migration Path for Frontend Apps

**Step 1: Read-only migration**
- Frontend starts reading from `/contents` instead of `/documents`
- Still writes to `/documents` (for safety)
- Test thoroughly

**Step 2: Full migration**
- Frontend writes to `/contents`
- Stop using `/documents` APIs
- Mark as "migrated"

**Step 3: Deprecation (after all apps migrated)**
- Add deprecation warnings to Document APIs
- Set sunset date (e.g., 6 months)
- Monitor usage

**Step 4: Removal**
- Remove DocumentModule from codebase
- Remove MCP document-management tools
- Archive documentation

### 4.3 Data Migration (Optional)

If needed, create migration script:

```bash
# scripts/migrate-documents-to-contents.ts
# One-time script to copy Document → Content
# Field mapping:
#   content → body
#   type → contentType
#   (other fields remain same)
```

**Decision**: Anh quyết định sau, có thể không cần migrate data

---

## 5. Testing Strategy

### 5.1 Unit Tests

```typescript
// content.service.spec.ts
describe('ContentService', () => {
  it('should create content');
  it('should search by keyword in body');
  it('should filter by attachment type');
  it('should perform body operations');
  it('should handle attachments array');
});
```

### 5.2 Integration Tests

```bash
# scripts/test-content-module.sh
# Test all endpoints
# Similar to test-document-module.sh
```

### 5.3 E2E Tests

```typescript
// Test AIWM MCP tools
// Test complete workflows
```

---

## 6. Database Considerations

### 6.1 Collections

- **Existing**: `documents` collection (unchanged)
- **New**: `contents` collection

### 6.2 Storage Estimates

**Assumptions**:
- 10,000 contents/month
- Avg body size: 10KB
- Avg 2 attachments per content
- Avg attachment size: 2MB

**MongoDB Storage** (metadata only):
- Content docs: 10,000 × 15KB = 150MB/month
- With indexes: ~200MB/month

**Object Storage** (media files):
- 10,000 × 2 × 2MB = 40GB/month

### 6.3 Indexes Performance

Same as Document module - proven to work well.

---

## 7. Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Frontend teams slow to migrate | Medium | High | Provide excellent docs + examples |
| Confusion between Document vs Content | Medium | Medium | Clear naming + deprecation notices |
| Media storage costs | High | Low | Start with MinIO (self-hosted) |
| Breaking changes in AIWM | High | Low | Keep both tool sets for 6 months |
| Schema changes needed later | Medium | Medium | Use flexible `metadata` field |

---

## 8. Success Criteria

### Phase 1 Success:
- ✅ Content module compiles and builds
- ✅ All 8 API endpoints work
- ✅ Test script passes 100%
- ✅ Search and body operations work identical to Document

### Overall Success:
- ✅ At least 1 frontend app fully migrated
- ✅ AIWM agents using Content APIs
- ✅ No production issues
- ✅ Positive feedback from teams
- ✅ Ready for media upload Phase 2

---

## 9. Timeline Summary

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Core Module | 1 day | None |
| Phase 2: MCP Integration | 4 hours | Phase 1 complete |
| Phase 3: Documentation | 3 hours | Phase 1 complete |
| **Total (MVP)** | **2 days** | - |
| Phase 4: Media Upload | 3-5 days | MinIO setup |
| Phase 5: Advanced | TBD | Phase 4 complete |

---

## 10. Next Steps

### Immediate (Today):
1. ✅ Get approval on this plan from anh
2. ✅ Start Phase 1 implementation

### This Week:
1. ✅ Complete Phase 1-3 (Content module + MCP + docs)
2. ✅ Notify frontend teams about new APIs
3. ✅ Create example migration PR

### Next Week:
1. Monitor adoption
2. Gather feedback
3. Plan Phase 4 (media upload) if needed

---

## 11. Questions for Decision

**Q1**: Data migration needed?
- ❓ Copy existing documents to contents collection?
- ❓ Or keep separate (recommended)?

**Q2**: Timeline for Document deprecation?
- ❓ 3 months? 6 months? 12 months?

**Q3**: Media upload priority?
- ❓ Start Phase 4 immediately after Phase 3?
- ❓ Or wait for feedback first? (recommended)

**Q4**: Storage provider?
- ❓ Self-hosted MinIO (cheaper, more control)?
- ❓ AWS S3 (more reliable, easier)?
- ❓ Or support both?

---

**Plan Status**: ✅ Ready for Review
**Next Action**: Awaiting anh's approval to start Phase 1 implementation

