import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { OpenApiStore } from './openapi.store';
import { SkillFile, SkillManifest } from './skill.types';

@Injectable()
export class SkillGeneratorService {
  private readonly logger = new Logger(SkillGeneratorService.name);

  constructor(private readonly openApiStore: OpenApiStore) {}

  async generate(): Promise<SkillManifest> {
    const files: SkillFile[] = [];

    // 1. Generate SKILL.md (entry point) from cbm.skill.md asset
    const entryContent = this.readAsset('cbm.skill.md');
    if (entryContent) {
      files.push(this.buildFile('SKILL.md', entryContent));
    }

    // 2. Generate references/api-reference.md from OpenAPI spec
    const apiRef = this.buildApiReference();
    files.push(this.buildFile('references/api-reference.md', apiRef));

    // 3. Generate per-module reference files from assets/skill/modules/*.skill.md
    const modulesDir = this.resolveAssetPath('modules');
    if (fs.existsSync(modulesDir)) {
      const moduleFiles = fs.readdirSync(modulesDir).filter(f => f.endsWith('.skill.md'));
      for (const filename of moduleFiles.sort()) {
        const content = fs.readFileSync(path.join(modulesDir, filename), 'utf-8');
        const refName = filename.replace('.skill.md', '.md');
        files.push(this.buildFile(`references/${refName}`, content));
      }
    }

    // 4. Generate references/error-guide.md
    const errorGuide = this.buildErrorGuide();
    files.push(this.buildFile('references/error-guide.md', errorGuide));

    const version = this.computeVersion(files);
    this.logger.log(`Skill manifest generated — version: ${version}, files: ${files.length}`);

    return {
      name: 'cbm',
      version,
      description: 'Core Business Management — Projects, Work, CRM, Finance',
      generated_at: new Date().toISOString(),
      base_url: process.env['CBM_BASE_URL'] ?? '',
      auth: {
        type: 'bearer',
        header: 'Authorization',
        note: 'Token auto-scopes all data to orgId. No need to pass orgId explicitly.',
      },
      files,
    };
  }

  // ─── OpenAPI compression ───────────────────────────────────────────────────

  private buildApiReference(): string {
    const doc = this.openApiStore.getDocument();
    if (!doc) {
      this.logger.warn('OpenAPI document not available — api-reference will be minimal');
      return '# CBM API Reference\n\n*API reference not available. See module reference files.*\n';
    }

    const lines: string[] = ['# CBM API Reference\n'];
    const paths = doc['paths'] as Record<string, any> ?? {};

    // Group endpoints by tag
    const byTag: Record<string, string[]> = {};
    for (const [routePath, methods] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(methods as Record<string, any>)) {
        const httpMethod = method.toUpperCase();
        const tags: string[] = operation['tags'] ?? ['Other'];
        const summary: string = operation['summary'] ?? '';
        const tag = tags[0];

        if (!byTag[tag]) byTag[tag] = [];

        // Compact line: METHOD /path — summary
        byTag[tag].push(`${httpMethod.padEnd(7)} ${routePath.padEnd(45)} — ${summary}`);

        // Add request body shape for POST/PATCH
        if (['POST', 'PATCH', 'PUT'].includes(httpMethod)) {
          const bodySchema = this.extractRequestBodySchema(operation, doc);
          if (bodySchema) {
            byTag[tag].push(`        Body: ${bodySchema}`);
          }
        }
      }
    }

    for (const [tag, endpointLines] of Object.entries(byTag).sort()) {
      lines.push(`## ${tag}`);
      lines.push('```');
      lines.push(...endpointLines);
      lines.push('```\n');
    }

    return lines.join('\n');
  }

  private extractRequestBodySchema(operation: any, doc: any): string | null {
    try {
      const content = operation?.requestBody?.content?.['application/json'];
      const schemaRef = content?.schema?.['$ref'];
      if (!schemaRef) return null;

      const schemaName = schemaRef.split('/').pop();
      const schema = doc?.components?.schemas?.[schemaName];
      if (!schema?.properties) return null;

      const props = Object.entries(schema.properties as Record<string, any>)
        .slice(0, 6) // limit to 6 fields for brevity
        .map(([k, v]: [string, any]) => {
          const required = (schema.required ?? []).includes(k);
          const type = v.type ?? (v['$ref'] ? v['$ref'].split('/').pop() : 'object');
          return `${k}${required ? '*' : ''}:${type}`;
        });

      return `{ ${props.join(', ')}${Object.keys(schema.properties).length > 6 ? ', ...' : ''} }`;
    } catch {
      return null;
    }
  }

  // ─── Error guide ───────────────────────────────────────────────────────────

  private buildErrorGuide(): string {
    return `# CBM Error Guide

## Error Response Structure

\`\`\`json
{
  "statusCode": 400,
  "message": "human-readable message",
  "agentHint": "what to do next (English)",
  "currentStatus": "entity's current status (if state machine error)",
  "allowedActions": ["list", "of", "valid", "actions"]
}
\`\`\`

## Common HTTP Status Codes

### 400 Bad Request
- \`validation error\`: Check request body fields against api-reference.md
- \`invalid status transition\`: Read \`currentStatus\` and \`allowedActions\` in error response
- \`items must not be empty\`: Add at least one item to the array before proceeding

### 403 Forbidden
- Not a member or lead of this project/resource
- Check \`leadIds\` in error body — contact them for access grant

### 404 Not Found
- Resource does not exist or has been soft-deleted
- Verify the ID is correct before retrying

### 409 Conflict
- Duplicate resource: same identifier already exists
- For payments: invoice is already fully paid — no further payment needed

## State Machine Errors

When you get 400 with \`invalid status transition\`:
1. Read \`currentStatus\` — the entity's current state
2. Read \`allowedActions\` — the valid transitions from current state
3. Call the correct action endpoint: \`POST /:id/{allowedAction}\`

## Soft Delete Restrictions
Most entities can only be deleted in specific statuses:
- Invoice: draft or cancelled only
- Expense: pending or rejected only
- Payment: no update (immutable after creation, use delete to void)
- Company/Contact: any status
`;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private readAsset(filename: string): string | null {
    const filePath = this.resolveAssetPath(filename);
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`Skill asset not found: ${filePath}`);
      return null;
    }
    return fs.readFileSync(filePath, 'utf-8');
  }

  private resolveAssetPath(...segments: string[]): string {
    // In production (webpack dist): __dirname = dist/services/cbm
    // Assets are copied to:          dist/services/cbm/assets/skill/
    // In development (ts-node):      __dirname = src/skill → go up to src/
    const isDistBuild = __dirname.includes('dist');
    const base = isDistBuild
      ? path.join(__dirname, 'assets', 'skill')
      : path.join(__dirname, '..', 'assets', 'skill');
    return path.join(base, ...segments);
  }

  private buildFile(filePath: string, content: string): SkillFile {
    return {
      path: filePath,
      content,
      checksum: 'sha256:' + createHash('sha256').update(content).digest('hex'),
      executable: false,
    };
  }

  private computeVersion(files: SkillFile[]): string {
    const combined = files.map(f => f.checksum).join('|');
    return 'sha256:' + createHash('sha256').update(combined).digest('hex').slice(0, 16);
  }
}
