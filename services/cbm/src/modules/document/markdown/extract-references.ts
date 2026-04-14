/**
 * Parse markdown content and extract:
 *   - attachments: inline images/videos referenced via the `file:<id>` scheme
 *   - mentions: resource mentions via `[label](@kind:id)` markdown links
 *
 * The results are stored as indexes on the Document so they can be queried
 * (backlinks, cascade delete) without parsing the content body on every read.
 *
 * Syntax examples:
 *   ![alt text](file:507f1f77bcf86cd799439011)
 *   [Design Spec](@document:507f191e810c19729de860ea)
 *   [Work #123](@work:507f191e810c19729de860eb)
 *
 * Non-goals:
 *   - Not a full markdown AST parser; uses focused regex patterns.
 *   - Does not validate that referenced IDs exist; callers decide.
 */

export type AttachmentKind = 'image' | 'video' | 'file';

export type MentionKind =
  | 'document'
  | 'work'
  | 'project'
  | 'user'
  | 'knowledge-collection';

export interface AttachmentRef {
  fileId: string;
  kind: AttachmentKind;
  placeholder: string; // e.g. "file:507f..."
}

export interface MentionRef {
  kind: MentionKind;
  id: string;
}

export interface ExtractedReferences {
  attachments: AttachmentRef[];
  mentions: MentionRef[];
}

const MENTION_KINDS: readonly MentionKind[] = [
  'document',
  'work',
  'project',
  'user',
  'knowledge-collection',
];

// 24-hex char ObjectId — keep strict to avoid false positives.
const OBJECT_ID_PATTERN = '[a-f0-9]{24}';

// Image syntax `![alt](file:<id>)` — we treat this as the baseline attachment
// syntax. Video blocks in BlockNote serialize with the same shape but an alt
// text of "video" by convention; we disambiguate via alt text heuristics here
// and callers can refine via the attachment record's `kind` field later when
// they look up the file MIME type.
const IMAGE_ATTACHMENT_RE = new RegExp(
  `!\\[([^\\]]*)\\]\\(file:(${OBJECT_ID_PATTERN})\\)`,
  'gi',
);

// Mention link `[label](@kind:id)` — kinds must match the whitelist.
const MENTION_RE = new RegExp(
  `\\[([^\\]]+)\\]\\(@(${MENTION_KINDS.join('|')}):(${OBJECT_ID_PATTERN})\\)`,
  'gi',
);

function classifyAttachmentKind(alt: string): AttachmentKind {
  const a = alt.trim().toLowerCase();
  if (a === 'video' || a.startsWith('video:')) return 'video';
  if (a === 'file' || a.startsWith('file:')) return 'file';
  return 'image';
}

export function extractReferences(content: string): ExtractedReferences {
  const attachments = new Map<string, AttachmentRef>();
  const mentions = new Map<string, MentionRef>();

  if (!content) {
    return { attachments: [], mentions: [] };
  }

  // Attachments
  for (const match of content.matchAll(IMAGE_ATTACHMENT_RE)) {
    const [, alt, fileId] = match;
    if (!fileId) continue;
    const key = fileId;
    if (!attachments.has(key)) {
      attachments.set(key, {
        fileId,
        kind: classifyAttachmentKind(alt),
        placeholder: `file:${fileId}`,
      });
    }
  }

  // Mentions
  for (const match of content.matchAll(MENTION_RE)) {
    const [, , kind, id] = match;
    if (!kind || !id) continue;
    const key = `${kind}:${id}`;
    if (!mentions.has(key)) {
      mentions.set(key, { kind: kind as MentionKind, id });
    }
  }

  return {
    attachments: Array.from(attachments.values()),
    mentions: Array.from(mentions.values()),
  };
}

/**
 * Diff two attachment lists and return fileIds that were present in `before`
 * but not in `after`. Used by callers that want to detach/soft-delete orphaned
 * files after a content update.
 */
export function diffRemovedAttachments(
  before: AttachmentRef[] | undefined,
  after: AttachmentRef[],
): string[] {
  if (!before || before.length === 0) return [];
  const afterIds = new Set(after.map((a) => a.fileId));
  const removed: string[] = [];
  for (const b of before) {
    if (!afterIds.has(b.fileId)) removed.push(b.fileId);
  }
  return removed;
}
