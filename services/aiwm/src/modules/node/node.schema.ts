import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';
import { SystemInfo } from './node.interface';
import * as bcrypt from 'bcrypt';

export type NodeDocument = Node & Document;

/**
 * @deprecated Use SystemInfo.hardware.gpu instead
 */
export interface GPUDevice {
  deviceId: string;
  model: string;
  memoryTotal: number;
  memoryFree: number;
  utilization: number;
  temperature: number;
}

export interface TokenMetadata {
  tokenGeneratedAt?: Date;
  tokenExpiresAt?: Date;
  tokenLastUsed?: Date;
}

@Schema({ timestamps: true })
export class Node extends BaseSchema {
  @Prop({ required: true })
  name: string;

  @Prop([{ type: String, enum: ['controller', 'worker', 'proxy', 'storage'] }])
  role: string[];

  @Prop({
    required: true,
    enum: ['awaiting-approval', 'pending', 'installing', 'online', 'offline', 'maintenance'],
    default: 'pending'
  })
  status: string;

  // ============= Connection State =============

  @Prop({ default: () => new Date() })
  lastHeartbeat: Date;

  @Prop()
  lastMetricsAt?: Date;

  // ============= System Information (NEW) =============

  @Prop(
    raw({
      os: {
        name: { type: String },
        version: { type: String },
        kernel: { type: String },
        platform: { type: String },
      },
      architecture: {
        cpu: { type: String },
        bits: { type: Number },
        endianness: { type: String },
      },
      hardware: {
        cpu: {
          model: { type: String },
          vendor: { type: String },
          sockets: { type: Number },
          coresPerSocket: { type: Number },
          threadsPerCore: { type: Number },
          totalCores: { type: Number },
          frequency: { type: Number },
          cacheSize: { type: Number },
          details: [
            {
              socketId: { type: Number },
              model: { type: String },
              vendor: { type: String },
              frequency: { type: Number },
              cacheSize: { type: Number },
              cores: { type: Number },
            },
          ],
        },
        memory: {
          total: { type: Number },
        },
        disk: {
          total: { type: Number },
          devices: [
            {
              name: { type: String },
              mountPoint: { type: String },
              total: { type: Number },
              filesystem: { type: String },
            },
          ],
        },
        network: {
          publicIp: { type: String },
          clusterIp: { type: String },
          ports: { type: Object }, // Dynamic Record<string, number>
          interfaces: [
            {
              name: { type: String },
              type: { type: String },
              macAddress: { type: String },
              ipAddress: { type: String },
              ipv6Address: { type: String },
              netmask: { type: String },
              gateway: { type: String },
              dns: [{ type: String }],
              mtu: { type: Number },
              speed: { type: Number },
              duplex: { type: String },
              state: { type: String },
              inboundPorts: { type: Object }, // Dynamic Record<string, number>
              isPrimary: { type: Boolean },
              metric: { type: Number },
              isVirtual: { type: Boolean },
              parentInterface: { type: String },
              vlanId: { type: Number },
            },
          ],
          connectivity: {
            hasInternet: { type: Boolean },
            publicIpDetected: { type: String },
            lastChecked: { type: Date },
            reachableFrom: [{ type: String }],
          },
        },
        gpu: [
          {
            deviceId: { type: String },
            model: { type: String },
            vendor: { type: String },
            memoryTotal: { type: Number },
            capabilities: [{ type: String }],
          },
        ],
      },
      containerRuntime: {
        type: { type: String },
        version: { type: String },
        apiVersion: { type: String },
        storage: {
          driver: { type: String },
          filesystem: { type: String },
        },
      },
      virtualization: {
        type: { type: String },
        role: { type: String },
      },
    })
  )
  systemInfo?: SystemInfo;

  // ============= Token Management =============

  @Prop({ type: Object })
  tokenMetadata?: TokenMetadata;

  // ============= Authentication (Node Daemon) =============

  /**
   * @deprecated Use _id instead. Kept for backward compatibility with legacy nodes using UUID apiKey.
   */
  @Prop({ unique: true, sparse: true, index: true })
  apiKey?: string;

  @Prop({ select: false })
  secretHash?: string; // Bcrypt hashed secret

  @Prop()
  lastAuthAt?: Date; // Track last authentication time

  // ============= Setup Token =============

  @Prop({ select: false })
  setupTokenHash?: string; // sha256 hash of setup JWT token

  @Prop()
  setupTokenExpiresAt?: Date; // Expiry of setup token

  // Helper method to verify secret
  async verifySecret(plainSecret: string): Promise<boolean> {
    return bcrypt.compare(plainSecret, this.secretHash);
  }

  // ============= Deprecated Fields (Backward Compatibility) =============

  /**
   * @deprecated Use systemInfo.hardware.gpu instead
   * Kept for backward compatibility with existing data
   */
  @Prop([{
    deviceId: String,
    model: String,
    memoryTotal: Number,
    memoryFree: Number,
    utilization: Number,
    temperature: Number,
  }])
  gpuDevices?: GPUDevice[];

  /**
   * @deprecated Use systemInfo.hardware.cpu.totalCores instead
   */
  @Prop()
  cpuCores?: number;

  /**
   * @deprecated Use systemInfo.hardware.cpu.model instead
   */
  @Prop()
  cpuModel?: string;

  /**
   * @deprecated Use systemInfo.hardware.memory.total instead
   */
  @Prop()
  ramTotal?: number;

  /**
   * @deprecated This is dynamic data, will be stored in MetricData collection
   */
  @Prop()
  ramFree?: number;

  /**
   * @deprecated Use systemInfo.hardware.disk.total instead
   */
  @Prop()
  diskTotal?: number;

  /**
   * @deprecated Use systemInfo.os.name instead
   */
  @Prop()
  hostname?: string;

  /**
   * @deprecated Use systemInfo.hardware.network.interfaces[].ipAddress instead
   */
  @Prop()
  ipAddress?: string;

  /**
   * @deprecated Use systemInfo.hardware.network.publicIp instead
   */
  @Prop()
  publicIpAddress?: string;

  /**
   * @deprecated Use systemInfo.os instead
   */
  @Prop()
  os?: string;

  /**
   * @deprecated Keep for version tracking
   */
  @Prop()
  daemonVersion?: string;

  /**
   * @deprecated Use systemInfo.containerRuntime instead
   */
  @Prop()
  containerRuntime?: string;

  /**
   * @deprecated This is dynamic data, will be stored in MetricData collection
   */
  @Prop()
  uptimeSeconds?: number;

  /**
   * @deprecated This is dynamic data, will be stored in MetricData collection
   */
  @Prop()
  cpuUsage?: number;

  /**
   * @deprecated This is dynamic data, will be stored in MetricData collection
   */
  @Prop()
  ramUsage?: number;
}

export const NodeSchema = SchemaFactory.createForClass(Node);

// Add verifySecret method to schema
NodeSchema.methods.verifySecret = async function(plainSecret: string): Promise<boolean> {
  return bcrypt.compare(plainSecret, this.secretHash);
};