import { IamEvent } from './queue.config';

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

interface IamBaseEvent {
  event: IamEvent;
  timestamp: string; // ISO 8601
  correlationId?: string;
}

// ---------------------------------------------------------------------------
// User Events
// ---------------------------------------------------------------------------

export interface IamUserCreatedEvent extends IamBaseEvent {
  event: 'user.created';
  data: {
    userId: string;
    username: string; // email
    role: string;
    orgId: string;
    provider: 'local' | 'google';
    status: string;
    fullname?: string;
  };
}

export interface IamUserUpdatedEvent extends IamBaseEvent {
  event: 'user.updated';
  data: {
    userId: string;
    username: string;
    orgId: string;
    updatedFields: string[]; // e.g. ['role', 'status', 'fullname']
    role?: string;
    status?: string;
    fullname?: string;
  };
}

export interface IamUserDeletedEvent extends IamBaseEvent {
  event: 'user.deleted';
  data: {
    userId: string;
    username: string;
    orgId: string;
    deletedBy: string; // userId of actor
  };
}

// ---------------------------------------------------------------------------
// Organization Events
// ---------------------------------------------------------------------------

export interface IamOrganizationCreatedEvent extends IamBaseEvent {
  event: 'organization.created';
  data: {
    orgId: string;
    name: string;
    createdBy: string; // userId
  };
}

export interface IamOrganizationUpdatedEvent extends IamBaseEvent {
  event: 'organization.updated';
  data: {
    orgId: string;
    name: string;
    updatedBy: string;
    updatedFields: string[];
  };
}

export interface IamOrganizationDeletedEvent extends IamBaseEvent {
  event: 'organization.deleted';
  data: {
    orgId: string;
    deletedBy: string;
  };
}

// ---------------------------------------------------------------------------
// Union
// ---------------------------------------------------------------------------

export type IamQueueEvent =
  | IamUserCreatedEvent
  | IamUserUpdatedEvent
  | IamUserDeletedEvent
  | IamOrganizationCreatedEvent
  | IamOrganizationUpdatedEvent
  | IamOrganizationDeletedEvent;
