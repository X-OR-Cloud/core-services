import { tool } from 'ai';
import { zodSchema } from 'ai';
import { z } from 'zod';

export const KNOWLEDGE_SEARCH_TOOL_NAME = 'mcp__Builtin__KnowledgeSearch';

export interface KnowledgeSearchToolsContext {
  searchKnowledgeInternal: (
    collectionId: string,
    query: string,
    topK: number,
    minScore: number,
  ) => Promise<Array<{ score: number; content: string; sourceId: string; sourceType: 'file' | 'document' | '' }>>;
}

export function createKnowledgeSearchTools(ctx: KnowledgeSearchToolsContext) {
  return {
    [KNOWLEDGE_SEARCH_TOOL_NAME]: tool({
      description:
        'Search a knowledge collection using natural language query (RAG). ' +
        'Returns top-K most relevant chunks with content and metadata. ' +
        'Use this to answer questions based on internal documents.',
      inputSchema: zodSchema(
        z.object({
          collectionId: z.string().describe('Knowledge collection ID to search within'),
          query: z.string().describe('Natural language query to search for'),
          topK: z.number().int().min(1).max(20).optional().default(5).describe('Number of top results to return (default: 5, max: 20)'),
        }),
      ),
      execute: async ({ collectionId, query, topK }) => {
        const results = await ctx.searchKnowledgeInternal(collectionId, query, topK ?? 5, 0);
        return results;
      },
    }),
  };
}
