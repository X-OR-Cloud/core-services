/**
 * Hocuspocus hooks — auth, load, store, disconnect.
 *
 * All hooks access shared state (Mongo + Redis) through services resolved from
 * a Nest application context. The hook factory is called once at bootstrap
 * with a resolved context so we don't pay DI overhead per connection.
 */

import { INestApplicationContext, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import * as Y from 'yjs';
import { getModelToken } from '@nestjs/mongoose';
import { Document } from '../document/document.schema';
import { DocumentRtcService } from './document-rtc.service';

const logger = new Logger('HocuspocusHooks');

const DOCUMENT_NAME_PREFIX = 'document:';

interface HookContext {
  userId: string;
  orgId: string;
  roles: string[];
  docId: string;
  userKey: string;
  userName: string;
}

function parseDocumentName(name: string): string | null {
  if (!name.startsWith(DOCUMENT_NAME_PREFIX)) return null;
  const id = name.slice(DOCUMENT_NAME_PREFIX.length);
  return Types.ObjectId.isValid(id) ? id : null;
}

export function buildHocuspocusHooks(app: INestApplicationContext) {
  const jwtService = app.get(JwtService);
  const rtcService = app.get(DocumentRtcService);
  const documentModel = app.get<Model<Document>>(getModelToken(Document.name));

  return {
    /**
     * Verify the JWT sent by the client and check write access on the target
     * document. Rejection throws → Hocuspocus refuses the WebSocket handshake.
     */
    async onAuthenticate(data: any): Promise<HookContext> {
      const { documentName, token } = data;
      const docId = parseDocumentName(documentName);
      if (!docId) throw new Error(`Invalid document name: ${documentName}`);

      let payload: any;
      try {
        payload = jwtService.verify(token);
      } catch (err: any) {
        throw new Error(`Invalid or expired token: ${err.message}`);
      }

      const userId = payload.sub;
      const orgId = payload.orgId;
      const roles: string[] = payload.roles || [];
      if (!userId || !orgId) {
        throw new Error('Token missing sub/orgId');
      }

      // Load the document + scope-check org ownership. We intentionally do not
      // invoke the full DocumentService access helper here to avoid pulling in
      // ProjectModule; the hook runs inside cbm:rtc where we keep the
      // dependency graph minimal. The check below is conservative: same org
      // only. Project-level write access is delegated to the initial
      // `POST /documents/:id/commit` REST call via cbm:api, which is where
      // the full helper lives.
      const doc = await documentModel
        .findOne({ _id: new Types.ObjectId(docId), isDeleted: false })
        .lean()
        .exec();
      if (!doc) throw new Error(`Document ${docId} not found`);
      if ((doc as any).owner?.orgId !== orgId) {
        const isSuperAdmin =
          roles.includes('universe.owner') || roles.includes('organization.owner');
        if (!isSuperAdmin) {
          throw new Error(`Access denied: document is in a different org`);
        }
      }

      const userName = payload.username || payload.name || userId;
      const userKey = `${userId}:${data.socketId || ''}`;

      await rtcService.markSessionActive(docId);
      await rtcService.addActiveEditor(docId, userKey);

      logger.log(`connect docId=${docId} userId=${userId}`);
      return { userId, orgId, roles, docId, userKey, userName };
    },

    /**
     * Hydrate the Y.Doc from persistent draftState if present. If no draft
     * has been persisted yet, return the pre-created empty doc so the first
     * client can seed it from the current markdown content body.
     */
    async onLoadDocument(data: any): Promise<Y.Doc> {
      const { document, context } = data;
      const ctx = context as HookContext;
      const state = await rtcService.loadDraftState(ctx.docId);
      if (state) {
        Y.applyUpdate(document, state);
        logger.debug(`loadDocument docId=${ctx.docId} state=${state.byteLength}B`);
      } else {
        logger.debug(`loadDocument docId=${ctx.docId} (empty — client will seed)`);
      }
      return document;
    },

    /**
     * Persist the Y.Doc as a binary update blob into Mongo draftState. This
     * runs debounced (Hocuspocus default 2000ms) so it's safe to call on
     * every change.
     */
    async onStoreDocument(data: any): Promise<void> {
      const { document, context } = data;
      const ctx = context as HookContext;
      await rtcService.persistYDoc(ctx.docId, document);
      await rtcService.markSessionActive(ctx.docId); // refresh TTL
    },

    /**
     * Clean up presence + release session marker when the last client
     * disconnects. We don't delete draftState here — it stays until an
     * explicit commit happens, so a user who reloads the tab can pick up
     * where they left off.
     */
    async onDisconnect(data: any): Promise<void> {
      const { context, clientsCount } = data;
      const ctx = context as HookContext;
      await rtcService.removeActiveEditor(ctx.docId, ctx.userKey);
      if (clientsCount === 0) {
        // No active editors left — release the session marker so MCP writes
        // can go through without 409. The draftState buffer itself is kept.
        await rtcService.releaseSession(ctx.docId);
        logger.log(`last client left docId=${ctx.docId}`);
      }
    },
  };
}
