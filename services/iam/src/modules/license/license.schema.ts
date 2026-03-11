import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseSchema } from '@hydrabyte/base';
import { HydratedDocument } from 'mongoose';
import { ServiceName, LicenseType } from '@hydrabyte/shared';

export type LicenseDocument = HydratedDocument<License>;

/**
 * Organization License Record
 *
 * Each document represents one organization's license for one service.
 * This flat structure allows for:
 * - Easier querying by service
 * - Independent license management per service
 * - Better scalability for adding new services
 *
 * @example
 * [
 *   { orgId: '507f...', serviceName: 'iam', type: 'full' },
 *   { orgId: '507f...', serviceName: 'aiwm', type: 'limited', quotaLimit: 100 }
 * ]
 */
@Schema({ timestamps: true })
export class License extends BaseSchema {
  /**
   * Organization ID this license applies to
   * Must be a valid MongoDB ObjectId matching an organization document
   */
  @Prop({ required: true, index: true })
  orgId: string;

  /**
   * Service name this license applies to
   * Must be one of the registered services (iam, cbm, aiwm, noti)
   */
  @Prop({
    type: String,
    required: true,
    enum: Object.values(ServiceName),
  })
  serviceName: ServiceName;

  /**
   * License type for this service
   * - DISABLED: Organization cannot access the service
   * - LIMITED: Restricted access (controlled by @RequireLicense decorator)
   * - FULL: Complete access to all features
   */
  @Prop({
    type: String,
    required: true,
    enum: Object.values(LicenseType),
  })
  type: LicenseType;

  /**
   * Maximum quota limit for this service
   * null = unlimited, positive number = limited
   * @note Not enforced in Phase 1 - reserved for future implementation
   */
  @Prop({ type: Number, default: null })
  quotaLimit?: number | null;

  /**
   * Current quota usage
   * Tracks how much of the quotaLimit has been consumed
   * @note Not enforced in Phase 1 - reserved for future implementation
   */
  @Prop({ type: Number, default: 0 })
  quotaUsed?: number;

  /**
   * License expiration date
   * null = never expires
   * @note Not enforced in Phase 1 - reserved for future implementation
   */
  @Prop({ type: Date, default: null })
  expiresAt?: Date | null;

  /**
   * Internal notes for license management
   * Only visible to universe.owner
   * Used for tracking plan types, reasons for changes, etc.
   */
  @Prop({ type: String, default: '' })
  notes: string;
}

export const LicenseSchema = SchemaFactory.createForClass(License);

// Compound unique index: one license per org+service combination
LicenseSchema.index({ orgId: 1, serviceName: 1 }, { unique: true });

// Additional indexes for query performance
LicenseSchema.index({ serviceName: 1 }); // List all licenses for a service
LicenseSchema.index({ status: 1 }); // Filter by status
LicenseSchema.index({ 'owner.orgId': 1 }); // RBAC filtering (from BaseSchema)
