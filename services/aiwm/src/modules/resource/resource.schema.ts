import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';
import { ResourceType, ResourceStatus } from './enums';
import { DeploymentInfo } from './resource.interface';

export type ResourceDocument = Resource & Document;

/**
 * Resource - Unified management for all resource types
 * V1: Metadata-only (CRUD API với mock responses cho actions)
 * V2: Actual deployment via worker
 */
@Schema({ timestamps: true })
export class Resource extends BaseSchema {
  @Prop({ required: true, maxlength: 100 })
  name!: string;

  @Prop({ maxlength: 500 })
  description?: string;

  @Prop({
    required: true,
    enum: Object.values(ResourceType),
    type: String,
  })
  type!: string; // 'inference-container' | 'application-container' | 'virtual-machine'

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Node',
    required: true,
  })
  nodeId!: MongooseSchema.Types.ObjectId;

  @Prop({
    required: true,
    enum: Object.values(ResourceStatus),
    type: String,
    default: ResourceStatus.QUEUED,
  })
  status!: string;

  // ============= Resource Configuration (Static) =============

  // Type-specific configuration (discriminated union)
  // Can be InferenceContainerConfig | ApplicationContainerConfig | VirtualMachineConfig
  @Prop({ type: Object, required: true })
  config!: Record<string, any>;

  // ============= Deployment Information (Static + Semi-static) =============

  @Prop(
    raw({
      // Common fields
      id: { type: String },               // Container ID or VM ID
      endpoint: { type: String },         // Primary access endpoint
      allocatedGPU: [{ type: String }],   // GPU device IDs
      allocatedCPU: { type: Number },     // CPU cores
      allocatedRAM: { type: Number },     // RAM in bytes
      allocatedDisk: { type: Number },    // Disk space in bytes
      deployedAt: { type: Date },         // Deployment timestamp
      startedAt: { type: Date },          // Last start timestamp
      stoppedAt: { type: Date },          // Last stop timestamp

      // Container-specific fields
      containerId: { type: String },      // Docker container ID
      containerName: { type: String },    // Container name
      internalIp: { type: String },       // Container internal IP
      externalIp: { type: String },       // Host/external IP
      ports: [
        {
          containerPort: { type: Number },
          hostPort: { type: Number },
          protocol: { type: String },
        },
      ],
      volumes: [
        {
          hostPath: { type: String },
          containerPath: { type: String },
          readOnly: { type: Boolean },
        },
      ],
      environment: { type: Object },      // Env vars (Record<string, string>)
      command: [{ type: String }],        // Command array
      workingDir: { type: String },       // Working directory
      logPath: { type: String },          // Log file path
      logDriver: { type: String },        // Log driver
      healthCheckEndpoint: { type: String }, // Health check URL

      // VM-specific fields
      vmId: { type: String },             // VM UUID/name
      vmName: { type: String },           // VM name
      networks: [
        {
          name: { type: String },
          ipAddress: { type: String },
          macAddress: { type: String },
          bridge: { type: String },
          vlanId: { type: Number },
        },
      ],
      primaryIp: { type: String },        // VM primary IP
      sshEndpoint: { type: String },      // SSH endpoint
      sshUsername: { type: String },      // SSH username
      sshPublicKey: { type: String },     // SSH public key
      vncEndpoint: { type: String },      // VNC endpoint
      vncPassword: { type: String },      // VNC password
      diskPath: { type: String },         // Disk image path
      diskFormat: { type: String },       // Disk format (qcow2, raw)
      hypervisor: { type: String },       // Hypervisor type
      architecture: { type: String },     // CPU architecture
    }),
  )
  deployment?: DeploymentInfo;

  // ============= Connection State & Monitoring =============

  @Prop()
  lastHealthCheck?: Date;

  @Prop()
  lastMetricsAt?: Date; // Last metrics push timestamp (from MetricData)

  @Prop({ default: 0 })
  restartCount: number; // Cumulative restart count

  @Prop()
  errorMessage?: string;

  // BaseSchema provides: owner, createdBy, updatedBy, deletedAt, metadata, timestamps
}

export const ResourceSchema = SchemaFactory.createForClass(Resource);

// Indexes for performance
ResourceSchema.index({ type: 1, status: 1 }); // Changed from resourceType
ResourceSchema.index({ nodeId: 1 });
ResourceSchema.index({ status: 1 });
ResourceSchema.index({ 'deployment.id': 1 }); // Changed from runtime.id
ResourceSchema.index({ 'deployment.containerId': 1 }); // For container lookups
ResourceSchema.index({ 'deployment.vmId': 1 }); // For VM lookups
ResourceSchema.index({ name: 'text', description: 'text' }); // Text search
ResourceSchema.index({ lastMetricsAt: -1 }); // For monitoring queries
