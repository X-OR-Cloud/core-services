export interface IamUserCreatedEvent {
  event: 'user.created';
  timestamp: string;
  correlationId?: string;
  data: {
    userId: string;
    username: string;
    role: string;
    orgId: string;
    provider: 'local' | 'google';
    status: string;
    fullname?: string;
  };
}

export interface IamUserUpdatedEvent {
  event: 'user.updated';
  timestamp: string;
  correlationId?: string;
  data: {
    userId: string;
    username: string;
    orgId: string;
    updatedFields: string[];
    role?: string;
    status?: string;
    fullname?: string;
  };
}

export interface IamUserDeletedEvent {
  event: 'user.deleted';
  timestamp: string;
  correlationId?: string;
  data: {
    userId: string;
    username: string;
    orgId: string;
    deletedBy: string;
  };
}

export interface IamOrganizationCreatedEvent {
  event: 'organization.created';
  timestamp: string;
  correlationId?: string;
  data: {
    orgId: string;
    name: string;
    createdBy: string;
  };
}

export interface IamOrganizationUpdatedEvent {
  event: 'organization.updated';
  timestamp: string;
  correlationId?: string;
  data: {
    orgId: string;
    name: string;
    updatedBy: string;
    updatedFields: string[];
  };
}

export interface IamOrganizationDeletedEvent {
  event: 'organization.deleted';
  timestamp: string;
  correlationId?: string;
  data: {
    orgId: string;
    deletedBy: string;
  };
}

export type IamQueueEvent =
  | IamUserCreatedEvent
  | IamUserUpdatedEvent
  | IamUserDeletedEvent
  | IamOrganizationCreatedEvent
  | IamOrganizationUpdatedEvent
  | IamOrganizationDeletedEvent;
