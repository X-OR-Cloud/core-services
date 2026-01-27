/**
 * Node System Information Interfaces
 *
 * These interfaces define the structure for static system information
 * that is captured during node registration and updated infrequently.
 *
 * Dynamic metrics (CPU usage, memory usage, etc.) are stored in MetricData collection.
 */

// ============= OS & Architecture =============

export interface OSInfo {
  name: string;          // "Ubuntu", "CentOS", "Windows Server"
  version: string;       // "22.04 LTS", "8.5", "2022"
  kernel: string;        // "5.15.0-91-generic", "4.18.0-425.el8.x86_64"
  platform: string;      // "linux", "darwin", "win32"
}

export interface ArchitectureInfo {
  cpu: string;           // "x86_64", "aarch64", "arm64"
  bits: number;          // 32 or 64
  endianness: string;    // "LE" (Little Endian) or "BE" (Big Endian)
}

// ============= CPU Information =============

export interface CPUSocketInfo {
  socketId: number;      // Socket number: 0, 1, 2...
  model: string;         // "Intel Xeon Gold 6348", "AMD EPYC 7763"
  vendor: string;        // "Intel", "AMD"
  frequency: number;     // Base frequency in MHz
  cacheSize?: number;    // L3 cache in KB
  cores: number;         // Cores in this socket
}

export interface CPUInfo {
  model: string;         // Primary CPU model
  vendor: string;        // "Intel", "AMD"
  sockets: number;       // Number of physical CPUs
  coresPerSocket: number; // Cores per socket
  threadsPerCore: number; // Threads per core (1 = no HT, 2 = HT enabled)
  totalCores: number;    // Total: sockets * coresPerSocket
  frequency: number;     // Base frequency in MHz
  cacheSize?: number;    // L3 cache in KB

  // Multi-socket details (optional)
  details?: CPUSocketInfo[];
}

// ============= Memory Information =============

export interface MemoryInfo {
  total: number;         // Total RAM in bytes
}

// ============= Disk Information =============

export interface DiskDevice {
  name: string;          // "nvme0n1", "sda", "vda"
  mountPoint: string;    // "/", "/data", "/mnt/storage"
  total: number;         // Total capacity in bytes
  filesystem: string;    // "ext4", "xfs", "ntfs", "btrfs"
}

export interface DiskInfo {
  total: number;         // Total disk space across all devices (bytes)
  devices?: DiskDevice[];
}

// ============= Network Information =============

export interface NetworkInterface {
  // Identity
  name: string;          // "eth0", "ens3", "wlan0", "tun0", "docker0"
  type: string;          // "ethernet", "wifi", "bridge", "vpn", "tunnel"

  // Addressing
  macAddress?: string;   // "08:00:27:4e:66:a1"
  ipAddress?: string;    // Local IP: "192.168.1.100"
  ipv6Address?: string;  // IPv6: "fe80::a00:27ff:fe4e:66a1"
  netmask?: string;      // "255.255.255.0" or CIDR: "/24"
  gateway?: string;      // "192.168.1.1"
  dns?: string[];        // ["8.8.8.8", "1.1.1.1"]

  // Physical properties
  mtu?: number;          // Maximum Transmission Unit: 1500, 9000 (jumbo frames)
  speed?: number;        // Link speed in Mbps: 100, 1000, 10000
  duplex?: string;       // "full" | "half"
  state: string;         // "up" | "down" | "unknown"

  // Port forwarding / NAT info
  // Maps external ports to internal service ports
  // Example: { "ssh": 2222, "websocket": 18080, "custom_service": 3000 }
  inboundPorts?: Record<string, number>;

  // Routing priority
  isPrimary?: boolean;   // Primary interface for outbound traffic
  metric?: number;       // Routing metric (lower = higher priority)

  // Virtual interface metadata
  isVirtual?: boolean;   // Virtual interface (bridge, tun, tap, vlan)
  parentInterface?: string; // Parent interface if virtual (e.g., "eth0" for "eth0.100")
  vlanId?: number;       // VLAN ID if applicable
}

export interface NetworkConnectivity {
  hasInternet: boolean;      // Can reach internet?
  publicIpDetected?: string; // Auto-detected public IP (from external service like ipify.org)
  lastChecked?: Date;        // When was connectivity last verified
  reachableFrom?: string[];  // List of networks/IPs that can reach this node
                            // Examples: ["10.8.0.0/24", "0.0.0.0/0", "192.168.1.0/24"]
}

export interface NetworkInfo {
  // Public IP for external access
  publicIp?: string;     // "203.0.113.45" - Node's public IP

  // Cluster IP for inter-node communication
  clusterIp?: string;    // "10.8.0.5" - VPN/private network IP

  // Service ports (dynamic)
  // Defaults: { ssh: 22, websocket: 8080, api: 9090 }
  // Users can add custom: { ssh: 22, websocket: 8080, api: 9090, prometheus: 9100, grafana: 3000 }
  ports: Record<string, number>;

  // Network interfaces
  interfaces: NetworkInterface[];

  // Connectivity status
  connectivity?: NetworkConnectivity;
}

// ============= GPU Information =============

export interface GPUDevice {
  deviceId: string;      // "GPU-0", "GPU-1"
  model: string;         // "NVIDIA A100 80GB", "AMD MI250X"
  vendor: string;        // "NVIDIA", "AMD", "Intel"
  memoryTotal: number;   // Total VRAM in bytes
  capabilities?: string[]; // ["CUDA", "TensorCore", "MIG"], ["ROCm"]
}

// ============= Container Runtime Information =============

export interface ContainerRuntimeInfo {
  type: string;          // "docker", "containerd", "podman", "cri-o"
  version: string;       // "24.0.7", "1.7.2"
  apiVersion?: string;   // "1.43" (Docker API version)
  storage: {
    driver: string;      // "overlay2", "btrfs", "zfs", "vfs"
    filesystem: string;  // "ext4", "xfs", "btrfs"
  };
}

// ============= Virtualization Information =============

export interface VirtualizationInfo {
  type: string;          // "kvm", "vmware", "hyperv", "xen", "docker", "none"
  role: string;          // "host" (hypervisor) or "guest" (VM)
}

// ============= Hardware Information (Complete) =============

export interface HardwareInfo {
  cpu: CPUInfo;
  memory: MemoryInfo;
  disk: DiskInfo;
  network: NetworkInfo;
  gpu?: GPUDevice[];     // Optional: GPU devices
}

// ============= System Information (Complete) =============

export interface SystemInfo {
  os: OSInfo;
  architecture: ArchitectureInfo;
  hardware: HardwareInfo;
  containerRuntime?: ContainerRuntimeInfo;
  virtualization?: VirtualizationInfo;
}
