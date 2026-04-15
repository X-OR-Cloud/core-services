import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Redis from 'ioredis';
import * as Y from 'yjs';
import { Document } from '../document/document.schema';
import { redisConfig } from '../../config/redis.config';

const SESSION_PREFIX = 'doc-session:';
const SESSION_TTL_S = 600; // 10 min, refreshed on keepalive

/**
 * DocumentRtcService — persistence + session registry for the realtime collab
 * layer. Shared by both cbm:rtc (Hocuspocus hooks) and cbm:api (MCP conflict
 * check + commit endpoint), so it lives in a standalone module that can be
 * imported by either bootstrap.
 */
@Injectable()
export class DocumentRtcService implements OnModuleDestroy {
  private readonly logger = new Logger(DocumentRtcService.name);
  private readonly redis: Redis;

  constructor(
    @InjectModel(Document.name) private readonly documentModel: Model<Document>,
  ) {
    this.redis = new Redis({ ...redisConfig, lazyConnect: true });
  }

  async connect(): Promise<void> {
    if (this.redis.status === 'ready' || this.redis.status === 'connecting') {
      return;
    }
    await this.redis.connect();
    this.logger.log('DocumentRtcService ready');
  }

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
  }

  /**
   * Load the persisted Yjs binary state for a document. Returns null if no
   * draft state exists yet — caller should seed from the markdown content body
   * on the client side (guarded by Redis lock to avoid double-seed races).
   */
  async loadDraftState(docId: string): Promise<Uint8Array | null> {
    const doc = await this.documentModel
      .findOne({ _id: new Types.ObjectId(docId), isDeleted: false })
      .select('draftState')
      .lean()
      .exec();

    if (!doc) return null;
    const raw = (doc as any).draftState;
    if (!raw) return null;

    // Mongoose binary vs Node Buffer — normalize to Uint8Array
    if (raw.buffer) return new Uint8Array(raw.buffer);
    if (Buffer.isBuffer(raw)) return new Uint8Array(raw);
    return new Uint8Array(raw);
  }

  /**
   * Persist the Yjs binary state. Called from Hocuspocus `onStoreDocument`
   * (debounced by Hocuspocus default 2s) — so we don't need additional
   * throttling here.
   */
  async saveDraftState(docId: string, state: Uint8Array): Promise<void> {
    await this.documentModel.updateOne(
      { _id: new Types.ObjectId(docId) },
      {
        $set: {
          draftState: Buffer.from(state),
          draftUpdatedAt: new Date(),
          hasActiveDraft: true,
        },
      },
    );
  }

  /**
   * Clear the draft after a successful commit. Called from cbm:api after the
   * collaborative draft has been flushed into `content`.
   */
  async clearDraftState(docId: string): Promise<void> {
    await this.documentModel.updateOne(
      { _id: new Types.ObjectId(docId) },
      {
        $set: {
          draftState: null,
          draftUpdatedAt: null,
          hasActiveDraft: false,
        },
      },
    );
  }

  /**
   * Check whether a collaborative session is currently active on a document.
   * Used by cbm:api on the MCP update path: if active, external writes are
   * rejected with DOCUMENT_IN_ACTIVE_SESSION so the agent can re-plan.
   *
   * Fails open: if Redis is unreachable, we log a warning and treat the
   * document as not-in-session. This keeps the MCP edit path usable when the
   * realtime layer is degraded — the worst case is that a live editor gets
   * clobbered, which is strictly better than MCP writes erroring out.
   */
  async isSessionActive(docId: string): Promise<boolean> {
    try {
      await this.connect();
      const exists = await this.redis.exists(SESSION_PREFIX + docId);
      return exists === 1;
    } catch (err: any) {
      this.logger.warn(
        `isSessionActive(${docId}) failed, assuming not active: ${err.message}`,
      );
      return false;
    }
  }

  /**
   * Mark a document as having an active session. Called from Hocuspocus
   * onAuthenticate/onConnect hooks, refreshed on every store/disconnect.
   */
  async markSessionActive(docId: string): Promise<void> {
    await this.connect();
    await this.redis.set(SESSION_PREFIX + docId, '1', 'EX', SESSION_TTL_S);
  }

  /**
   * Release session marker immediately. Called when the last client
   * disconnects from a document.
   */
  async releaseSession(docId: string): Promise<void> {
    await this.connect();
    await this.redis.del(SESSION_PREFIX + docId);
  }

  /**
   * Return the count of active editors, best-effort (used for /documents/:id
   * response to drive the "N editors" UI badge). Derived from Redis
   * presence set that Hocuspocus awareness writes into — see hooks.
   */
  async getActiveEditorCount(docId: string): Promise<number> {
    try {
      await this.connect();
      const n = await this.redis.scard(`${SESSION_PREFIX}${docId}:users`);
      return n || 0;
    } catch (err: any) {
      this.logger.warn(
        `getActiveEditorCount(${docId}) failed, returning 0: ${err.message}`,
      );
      return 0;
    }
  }

  async addActiveEditor(docId: string, userKey: string): Promise<void> {
    await this.connect();
    await this.redis
      .multi()
      .sadd(`${SESSION_PREFIX}${docId}:users`, userKey)
      .expire(`${SESSION_PREFIX}${docId}:users`, SESSION_TTL_S)
      .exec();
  }

  async removeActiveEditor(docId: string, userKey: string): Promise<void> {
    await this.connect();
    await this.redis.srem(`${SESSION_PREFIX}${docId}:users`, userKey);
  }

  /**
   * Publish a "document committed" event on Redis pub/sub so that cbm:rtc can
   * react to out-of-band content updates (e.g. a commit that happened via the
   * REST API while clients were editing).
   */
  async publishCommitted(docId: string, committedBy: string): Promise<void> {
    await this.connect();
    await this.redis.publish(
      'cbm:document-committed',
      JSON.stringify({ documentId: docId, committedBy, at: new Date().toISOString() }),
    );
  }

  /**
   * Convenience helper used by Hocuspocus hooks: decode a Y.Doc into a Yjs
   * update blob, then delegate to saveDraftState.
   */
  async persistYDoc(docId: string, yDoc: Y.Doc): Promise<void> {
    const state = Y.encodeStateAsUpdate(yDoc);
    await this.saveDraftState(docId, state);
  }
}
