import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

/**
 * Notification Event Types
 * Defines the 4 unified event types for the notification system
 */
export enum NotificationEventType {
  SYSTEM_NOTIFICATION = 'system.notification',
  SERVICE_EVENT = 'service.event',
  SERVICE_ALERT = 'service.alert',
  AGENT_EVENT = 'agent.event',
}

/**
 * Notification Severity Levels
 * Used by system.notification, service.alert, and agent.event
 */
export enum NotificationSeverity {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Notification Delivery Status
 */
export enum NotificationDeliveryStatus {
  PENDING = 'pending',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

/**
 * Notification Metadata
 * Common metadata for all notification types
 */
export class NotificationMetadata {
  @Prop()
  correlationId?: string;

  @Prop({ index: true })
  orgId?: string;

  @Prop({ index: true })
  userId?: string;

  @Prop({ index: true })
  agentId?: string;

  @Prop({ required: true })
  timestamp: string;
}

/**
 * Notification Recipients
 * Defines who should receive the notification
 */
export class NotificationRecipients {
  @Prop({ type: [String], default: [] })
  userIds: string[];

  @Prop({ type: [String], default: [] })
  orgIds: string[];

  @Prop({ type: [String], default: [] })
  agentIds: string[];

  @Prop({ default: false })
  broadcast: boolean;
}

/**
 * Notification Schema
 * Polymorphic schema supporting 4 event types:
 * - system.notification: title, message, severity (low/normal/high/critical)
 * - service.event: name, data
 * - service.alert: title, message, severity
 * - agent.event: name, title, message, severity, data
 */
@Schema({ timestamps: true, collection: 'notifications' })
export class Notification extends BaseSchema {
  // Event type (required) - one of the 4 unified types
  @Prop({
    required: true,
    enum: Object.values(NotificationEventType),
    index: true,
  })
  event: string;

  // For system.notification, service.alert, agent.event
  @Prop()
  title?: string;

  @Prop()
  message?: string;

  @Prop({ enum: Object.values(NotificationSeverity) })
  severity?: string;

  // For service.event, agent.event
  @Prop({ index: true })
  name?: string;

  // Common notification metadata (required)
  @Prop({ type: NotificationMetadata, required: true })
  notificationMetadata: NotificationMetadata;

  // Unified data payload (flexible for all event types)
  @Prop({ type: Object })
  data?: Record<string, any>;

  // Recipients (required)
  @Prop({ type: NotificationRecipients, required: true })
  recipients: NotificationRecipients;

  // Delivery and read status
  @Prop({
    default: NotificationDeliveryStatus.PENDING,
    enum: Object.values(NotificationDeliveryStatus),
  })
  deliveryStatus: string;

  @Prop({ type: [String], default: [], index: true })
  readByUserIds: string[];

  // Timestamps from BaseSchema
  // createdAt, updatedAt, deletedAt (soft delete)
}

export type NotificationDocument = Notification & Document;
export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Indexes for performance
NotificationSchema.index({ event: 1, createdAt: -1 });
NotificationSchema.index({ 'notificationMetadata.userId': 1, createdAt: -1 });
NotificationSchema.index({ 'notificationMetadata.orgId': 1, createdAt: -1 });
NotificationSchema.index({ 'notificationMetadata.agentId': 1, createdAt: -1 });
NotificationSchema.index({ 'recipients.userIds': 1, createdAt: -1 });
NotificationSchema.index({ 'recipients.orgIds': 1, createdAt: -1 });
NotificationSchema.index({ 'recipients.agentIds': 1, createdAt: -1 });
NotificationSchema.index({ deliveryStatus: 1, createdAt: -1 });
NotificationSchema.index({ readByUserIds: 1 });
