/**
 * Resource Deployment Information Interfaces
 *
 * These interfaces define the structure for deployment metadata
 * that is captured when resource is deployed and updated during lifecycle.
 *
 * Dynamic metrics (CPU usage, memory usage, etc.) are stored in MetricData collection.
 */

// ============= Common Deployment Info =============

export interface BaseDeploymentInfo {
  // Identity
  id: string;               // Container ID or VM ID
  endpoint?: string;        // Primary access endpoint

  // Resource Allocation (set once when deployed)
  allocatedGPU?: string[];  // GPU device IDs: ["GPU-0", "GPU-1"]
  allocatedCPU: number;     // CPU cores allocated
  allocatedRAM: number;     // RAM in bytes
  allocatedDisk?: number;   // Disk space in bytes (mainly for VMs)

  // Lifecycle Timestamps
  deployedAt: Date;         // When successfully deployed
  startedAt?: Date;         // Last start time
  stoppedAt?: Date;         // Last stop time
}

// ============= Container-Specific Deployment Info =============

export interface PortMapping {
  containerPort: number;    // Port inside container
  hostPort: number;         // Port on host
  protocol?: string;        // 'tcp' | 'udp'
}

export interface VolumeMount {
  hostPath: string;         // Path on host
  containerPath: string;    // Path in container
  readOnly?: boolean;
}

export interface ContainerDeploymentInfo extends BaseDeploymentInfo {
  // Container identity
  containerId: string;      // Docker container ID
  containerName: string;    // Container name

  // Network
  internalIp?: string;      // Container IP in bridge network
  externalIp?: string;      // Host IP (for external access)
  ports?: PortMapping[];    // Exposed ports

  // Storage
  volumes?: VolumeMount[];  // Mounted volumes

  // Runtime
  environment?: Record<string, string>; // Environment variables (actual values)
  command?: string[];       // Actual command executed
  workingDir?: string;      // Working directory

  // Logs
  logPath?: string;         // Path to log file on host
  logDriver?: string;       // Log driver: 'json-file', 'syslog', etc.

  // Health
  healthCheckEndpoint?: string; // Health check URL
}

// ============= VM-Specific Deployment Info =============

export interface NetworkInterface {
  name: string;             // e.g., "eth0", "ens3"
  ipAddress?: string;       // e.g., "192.168.100.10"
  macAddress?: string;      // e.g., "52:54:00:12:34:56"
  bridge?: string;          // Bridge name: "br0", "virbr0"
  vlanId?: number;          // VLAN ID if applicable
}

export interface VMDeploymentInfo extends BaseDeploymentInfo {
  // VM identity
  vmId: string;             // Libvirt domain UUID or name
  vmName: string;           // VM name

  // Network
  networks?: NetworkInterface[]; // Network interfaces
  primaryIp?: string;       // Primary IP address
  externalIp?: string;      // Public IP (if applicable)

  // SSH Access
  sshEndpoint?: string;     // SSH endpoint: "192.168.100.10:22"
  sshUsername?: string;     // SSH username: "ubuntu"
  sshPublicKey?: string;    // SSH public key used

  // Console Access
  vncEndpoint?: string;     // VNC endpoint: "192.168.100.10:5900"
  vncPassword?: string;     // VNC password (if set)

  // Storage
  diskPath?: string;        // Path to disk image on host
  diskFormat?: string;      // Disk format: "qcow2", "raw"

  // Virtualization
  hypervisor?: string;      // "kvm", "qemu"
  architecture?: string;    // "x86_64", "aarch64"
}

// ============= Deployment Info (Discriminated Union) =============

export type DeploymentInfo = ContainerDeploymentInfo | VMDeploymentInfo;
