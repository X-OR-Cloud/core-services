# Metrics Module - Example Data & Test Payloads

**Version**: 1.0
**Date**: 2026-01-14

---

## 📋 Table of Contents

1. [Node Metrics Examples](#node-metrics-examples)
2. [Resource Metrics Examples](#resource-metrics-examples)
3. [Deployment Metrics Examples](#deployment-metrics-examples)
4. [Test Scripts](#test-scripts)

---

## 1. Node Metrics Examples

### 1.1 Basic Node Metrics (Minimal)

**Scenario**: Simple server node without GPU

```json
{
  "nodeId": "65a0000000000000000000001",
  "timestamp": "2026-01-14T10:00:00.000Z",
  "cpu": {
    "usage": 25.5,
    "cores": 8,
    "loadAverage": [1.2, 1.5, 1.8]
  },
  "memory": {
    "total": 17179869184,
    "used": 8589934592,
    "free": 8589934592,
    "cached": 2147483648
  },
  "disk": {
    "total": 1099511627776,
    "used": 549755813888,
    "free": 549755813888,
    "readBytesPerSec": 5242880,
    "writeBytesPerSec": 2621440
  },
  "network": {
    "rxBytesPerSec": 524288,
    "txBytesPerSec": 262144
  },
  "status": "online",
  "websocketConnected": true,
  "uptime": 86400
}
```

### 1.2 GPU Worker Node (Full)

**Scenario**: High-end GPU worker với 2 GPUs

```json
{
  "nodeId": "65a0000000000000000000002",
  "timestamp": "2026-01-14T10:00:00.000Z",
  "interval": "1min",
  "cpu": {
    "usage": 75.8,
    "cores": 32,
    "loadAverage": [8.5, 9.2, 10.1]
  },
  "memory": {
    "total": 137438953472,
    "used": 103079215104,
    "free": 27917287424,
    "cached": 6442450944
  },
  "disk": {
    "total": 2199023255552,
    "used": 1099511627776,
    "free": 1099511627776,
    "readBytesPerSec": 104857600,
    "writeBytesPerSec": 52428800,
    "readOpsPerSec": 500,
    "writeOpsPerSec": 250
  },
  "network": {
    "rxBytesPerSec": 10485760,
    "txBytesPerSec": 5242880,
    "rxPacketsPerSec": 5000,
    "txPacketsPerSec": 4000,
    "rxDropped": 0,
    "txDropped": 0
  },
  "gpu": [
    {
      "deviceId": "GPU-0",
      "model": "NVIDIA A100 80GB",
      "utilization": 95.5,
      "memoryUsed": 68719476736,
      "memoryTotal": 85899345920,
      "temperature": 78,
      "powerDraw": 350,
      "fanSpeed": 75
    },
    {
      "deviceId": "GPU-1",
      "model": "NVIDIA A100 80GB",
      "utilization": 88.2,
      "memoryUsed": 60129542144,
      "memoryTotal": 85899345920,
      "temperature": 75,
      "powerDraw": 320,
      "fanSpeed": 70
    }
  ],
  "status": "online",
  "websocketConnected": true,
  "uptime": 259200
}
```

### 1.3 Node with High Load

**Scenario**: Node under stress (high CPU, high temp)

```json
{
  "nodeId": "65a0000000000000000000003",
  "timestamp": "2026-01-14T10:00:00.000Z",
  "cpu": {
    "usage": 98.5,
    "cores": 16,
    "loadAverage": [15.2, 14.8, 13.5]
  },
  "memory": {
    "total": 68719476736,
    "used": 65498251264,
    "free": 2147483648,
    "cached": 1073741824
  },
  "disk": {
    "total": 1099511627776,
    "used": 989560053760,
    "free": 109951573888,
    "readBytesPerSec": 209715200,
    "writeBytesPerSec": 104857600
  },
  "network": {
    "rxBytesPerSec": 20971520,
    "txBytesPerSec": 10485760
  },
  "gpu": [
    {
      "deviceId": "GPU-0",
      "model": "NVIDIA RTX 4090",
      "utilization": 100.0,
      "memoryUsed": 24159191040,
      "memoryTotal": 25769803776,
      "temperature": 87,
      "powerDraw": 450,
      "fanSpeed": 100
    }
  ],
  "status": "online",
  "websocketConnected": true,
  "uptime": 43200
}
```

---

## 2. Resource Metrics Examples

### 2.1 Inference Container (Normal Load)

**Scenario**: LLaMA inference container running smoothly

```json
{
  "resourceId": "65a0000000000000000000101",
  "timestamp": "2026-01-14T10:05:00.000Z",
  "interval": "5min",
  "containerId": "abc123def456789",
  "resourceType": "inference-container",
  "cpu": {
    "usagePercent": 65.5,
    "limitCores": 8,
    "throttledTime": 500000
  },
  "memory": {
    "usageBytes": 17179869184,
    "limitBytes": 21474836480,
    "cacheBytes": 1073741824
  },
  "network": {
    "rxBytes": 524288000,
    "txBytes": 262144000,
    "rxPackets": 5000,
    "txPackets": 4000
  },
  "disk": {
    "readBytes": 52428800,
    "writeBytes": 26214400
  },
  "restartCount": 0,
  "uptime": 7200,
  "status": "running"
}
```

### 2.2 Application Container (Low Load)

**Scenario**: Web application container idle

```json
{
  "resourceId": "65a0000000000000000000102",
  "timestamp": "2026-01-14T10:05:00.000Z",
  "interval": "5min",
  "containerId": "xyz789abc123456",
  "resourceType": "application-container",
  "cpu": {
    "usagePercent": 5.2,
    "limitCores": 2,
    "throttledTime": 0
  },
  "memory": {
    "usageBytes": 536870912,
    "limitBytes": 2147483648,
    "cacheBytes": 104857600
  },
  "network": {
    "rxBytes": 10485760,
    "txBytes": 5242880,
    "rxPackets": 100,
    "txPackets": 80
  },
  "disk": {
    "readBytes": 1048576,
    "writeBytes": 524288
  },
  "restartCount": 0,
  "uptime": 86400,
  "status": "running"
}
```

### 2.3 Virtual Machine

**Scenario**: VM running database workload

```json
{
  "resourceId": "65a0000000000000000000103",
  "timestamp": "2026-01-14T10:05:00.000Z",
  "interval": "5min",
  "vmId": "vm-database-01",
  "resourceType": "virtual-machine",
  "cpu": {
    "usagePercent": 45.8,
    "limitCores": 16,
    "throttledTime": 0
  },
  "memory": {
    "usageBytes": 42949672960,
    "limitBytes": 68719476736,
    "cacheBytes": 8589934592
  },
  "network": {
    "rxBytes": 2097152000,
    "txBytes": 1048576000,
    "rxPackets": 20000,
    "txPackets": 15000
  },
  "disk": {
    "readBytes": 524288000,
    "writeBytes": 262144000
  },
  "restartCount": 0,
  "uptime": 604800,
  "status": "running"
}
```

### 2.4 Container with Restart

**Scenario**: Container that restarted due to OOM

```json
{
  "resourceId": "65a0000000000000000000104",
  "timestamp": "2026-01-14T10:05:00.000Z",
  "interval": "5min",
  "containerId": "error123restart456",
  "resourceType": "inference-container",
  "cpu": {
    "usagePercent": 85.5,
    "limitCores": 8,
    "throttledTime": 5000000
  },
  "memory": {
    "usageBytes": 21474836480,
    "limitBytes": 21474836480,
    "cacheBytes": 0
  },
  "network": {
    "rxBytes": 1048576000,
    "txBytes": 524288000
  },
  "disk": {
    "readBytes": 104857600,
    "writeBytes": 52428800
  },
  "restartCount": 3,
  "uptime": 600,
  "status": "running"
}
```

---

## 3. Deployment Metrics Examples

### 3.1 Healthy Deployment

**Scenario**: Production LLM deployment với good performance

```json
{
  "deploymentId": "65a0000000000000000000201",
  "modelId": "65a0000000000000000000301",
  "timestamp": "2026-01-14T10:05:00.000Z",
  "interval": "5min",
  "requestCount": 150,
  "errorCount": 2,
  "latency": {
    "p50": 250,
    "p95": 800,
    "p99": 1200,
    "avg": 350,
    "max": 1500,
    "min": 100
  },
  "tokens": {
    "input": 75000,
    "output": 50000,
    "total": 125000
  },
  "cost": 0.25,
  "healthStatus": "healthy"
}
```

### 3.2 High-Traffic Deployment

**Scenario**: Popular model với high request rate

```json
{
  "deploymentId": "65a0000000000000000000202",
  "modelId": "65a0000000000000000000302",
  "timestamp": "2026-01-14T10:05:00.000Z",
  "interval": "5min",
  "requestCount": 5000,
  "errorCount": 50,
  "latency": {
    "p50": 400,
    "p95": 1500,
    "p99": 3000,
    "avg": 600,
    "max": 5000,
    "min": 150
  },
  "tokens": {
    "input": 2500000,
    "output": 1500000,
    "total": 4000000
  },
  "cost": 8.00,
  "healthStatus": "degraded"
}
```

### 3.3 Degraded Deployment

**Scenario**: Deployment with high error rate

```json
{
  "deploymentId": "65a0000000000000000000203",
  "modelId": "65a0000000000000000000303",
  "timestamp": "2026-01-14T10:05:00.000Z",
  "interval": "5min",
  "requestCount": 500,
  "errorCount": 75,
  "latency": {
    "p50": 1500,
    "p95": 5000,
    "p99": 10000,
    "avg": 2500,
    "max": 15000,
    "min": 200
  },
  "tokens": {
    "input": 250000,
    "output": 150000,
    "total": 400000
  },
  "cost": 0.80,
  "healthStatus": "unhealthy"
}
```

---

## 4. Test Scripts

### 4.1 Node Daemon Push Script (Bash)

```bash
#!/bin/bash
# push-node-metrics.sh - Simulate node pushing metrics

NODE_ID="65a0000000000000000000001"
JWT_TOKEN="your-jwt-token-here"
API_URL="http://localhost:3003/metrics/push/node"

# Function to get CPU usage
get_cpu_usage() {
  top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}'
}

# Function to get memory stats
get_memory_stats() {
  free -b | awk 'NR==2{printf "\"total\": %d, \"used\": %d, \"free\": %d, \"cached\": %d", $2, $3, $4, $7}'
}

# Push metrics every minute
while true; do
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  CPU_USAGE=$(get_cpu_usage)

  PAYLOAD=$(cat <<EOF
{
  "nodeId": "$NODE_ID",
  "timestamp": "$TIMESTAMP",
  "cpu": {
    "usage": $CPU_USAGE,
    "cores": $(nproc),
    "loadAverage": [$(cat /proc/loadavg | cut -d' ' -f1-3 | tr ' ' ',')]
  },
  "memory": {
    $(get_memory_stats)
  },
  "disk": {
    "total": $(df -B1 / | awk 'NR==2{print $2}'),
    "used": $(df -B1 / | awk 'NR==2{print $3}'),
    "free": $(df -B1 / | awk 'NR==2{print $4}'),
    "readBytesPerSec": 5242880,
    "writeBytesPerSec": 2621440
  },
  "network": {
    "rxBytesPerSec": 524288,
    "txBytesPerSec": 262144
  },
  "status": "online",
  "websocketConnected": true,
  "uptime": $(cat /proc/uptime | cut -d' ' -f1 | cut -d'.' -f1)
}
EOF
)

  echo "Pushing metrics at $TIMESTAMP"
  curl -X POST "$API_URL" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    -s | jq .

  sleep 60
done
```

### 4.2 Python Test Script

```python
#!/usr/bin/env python3
# test-metrics-api.py - Test Metrics API

import requests
import time
from datetime import datetime, timezone
import random

API_BASE = "http://localhost:3003/metrics"
JWT_TOKEN = "your-jwt-token-here"

headers = {
    "Authorization": f"Bearer {JWT_TOKEN}",
    "Content-Type": "application/json"
}

def generate_node_metrics(node_id):
    """Generate random node metrics for testing"""
    return {
        "nodeId": node_id,
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "cpu": {
            "usage": random.uniform(20, 90),
            "cores": 16,
            "loadAverage": [
                random.uniform(1, 10),
                random.uniform(1, 10),
                random.uniform(1, 10)
            ]
        },
        "memory": {
            "total": 68719476736,
            "used": random.randint(20000000000, 60000000000),
            "free": random.randint(5000000000, 40000000000),
            "cached": random.randint(1000000000, 5000000000)
        },
        "disk": {
            "total": 1099511627776,
            "used": random.randint(400000000000, 800000000000),
            "free": random.randint(300000000000, 700000000000),
            "readBytesPerSec": random.randint(1000000, 100000000),
            "writeBytesPerSec": random.randint(500000, 50000000)
        },
        "network": {
            "rxBytesPerSec": random.randint(100000, 10000000),
            "txBytesPerSec": random.randint(50000, 5000000)
        },
        "gpu": [{
            "deviceId": "GPU-0",
            "model": "NVIDIA A100",
            "utilization": random.uniform(50, 100),
            "memoryUsed": random.randint(30000000000, 80000000000),
            "memoryTotal": 85899345920,
            "temperature": random.randint(60, 85),
            "powerDraw": random.randint(200, 400),
            "fanSpeed": random.randint(50, 100)
        }],
        "status": "online",
        "websocketConnected": True,
        "uptime": random.randint(10000, 1000000)
    }

def push_node_metrics(node_id):
    """Push node metrics to API"""
    url = f"{API_BASE}/push/node"
    payload = generate_node_metrics(node_id)

    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        print(f"✅ Pushed metrics for {node_id}: {response.json()}")
        return True
    except requests.exceptions.RequestException as e:
        print(f"❌ Failed to push metrics for {node_id}: {e}")
        return False

def query_node_metrics(node_id, hours=1):
    """Query node metrics from API"""
    url = f"{API_BASE}/nodes/{node_id}"

    end_time = datetime.now(timezone.utc)
    start_time = datetime.fromtimestamp(
        end_time.timestamp() - (hours * 3600),
        tz=timezone.utc
    )

    params = {
        "startTime": start_time.isoformat().replace("+00:00", "Z"),
        "endTime": end_time.isoformat().replace("+00:00", "Z"),
        "interval": "1min",
        "fields": "cpu,memory,gpu"
    }

    try:
        response = requests.get(url, params=params, headers=headers)
        response.raise_for_status()
        data = response.json()
        print(f"✅ Queried metrics for {node_id}: {len(data['data']['metrics'])} data points")
        return data
    except requests.exceptions.RequestException as e:
        print(f"❌ Failed to query metrics for {node_id}: {e}")
        return None

def main():
    """Main test runner"""
    node_ids = [
        "65a0000000000000000000001",
        "65a0000000000000000000002",
        "65a0000000000000000000003"
    ]

    print("🚀 Starting Metrics API Test")
    print("=" * 60)

    # Push metrics for all nodes
    print("\n📤 Pushing metrics...")
    for node_id in node_ids:
        push_node_metrics(node_id)
        time.sleep(1)  # Rate limiting

    # Wait a bit
    print("\n⏳ Waiting 5 seconds...")
    time.sleep(5)

    # Query metrics
    print("\n📥 Querying metrics...")
    for node_id in node_ids:
        query_node_metrics(node_id, hours=1)
        time.sleep(1)

    print("\n✅ Test completed!")

if __name__ == "__main__":
    main()
```

### 4.3 Load Test Script (Artillery)

```yaml
# load-test.yml - Artillery load test configuration

config:
  target: "http://localhost:3003"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Ramp up"
    - duration: 300
      arrivalRate: 100
      name: "Sustained load"
  variables:
    jwtToken: "your-jwt-token-here"

scenarios:
  - name: "Push Node Metrics"
    weight: 70
    flow:
      - post:
          url: "/metrics/push/node"
          headers:
            Authorization: "Bearer {{ jwtToken }}"
            Content-Type: "application/json"
          json:
            nodeId: "65a0000000000000000000001"
            timestamp: "{{ $isoTimestamp }}"
            cpu:
              usage: "{{ $randomNumber(20, 90) }}"
              cores: 16
              loadAverage: [2.5, 2.8, 3.1]
            memory:
              total: 68719476736
              used: 34359738368
              free: 30359738368
              cached: 4000000000
            disk:
              total: 1099511627776
              used: 549755813888
              free: 549755813888
              readBytesPerSec: 10485760
              writeBytesPerSec: 5242880
            network:
              rxBytesPerSec: 1048576
              txBytesPerSec: 524288
            status: "online"
            websocketConnected: true
            uptime: 86400

  - name: "Query Node Metrics"
    weight: 30
    flow:
      - get:
          url: "/metrics/nodes/65a0000000000000000000001"
          headers:
            Authorization: "Bearer {{ jwtToken }}"
          qs:
            startTime: "2026-01-14T00:00:00Z"
            endTime: "2026-01-14T23:59:59Z"
            interval: "1min"
```

**Run load test**:
```bash
artillery run load-test.yml
```

---

## 5. Integration Test Scenarios

### 5.1 Happy Path Test

```bash
# 1. Push metrics
curl -X POST http://localhost:3003/metrics/push/node \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d @test-data/node-metrics-1.json

# 2. Wait a bit
sleep 2

# 3. Query metrics
curl -X GET "http://localhost:3003/metrics/nodes/65a0000000000000000000001?startTime=2026-01-14T00:00:00Z&endTime=2026-01-14T23:59:59Z" \
  -H "Authorization: Bearer $JWT"

# 4. Verify response has data
```

### 5.2 Error Scenarios

```bash
# Invalid data - CPU > 100
curl -X POST http://localhost:3003/metrics/push/node \
  -H "Authorization: Bearer $JWT" \
  -d '{"nodeId": "test", "cpu": {"usage": 150}}'
# Expected: 400 Bad Request

# Unauthorized
curl -X POST http://localhost:3003/metrics/push/node \
  -d @test-data/node-metrics-1.json
# Expected: 401 Unauthorized

# Node ownership mismatch
curl -X POST http://localhost:3003/metrics/push/node \
  -H "Authorization: Bearer $WRONG_NODE_JWT" \
  -d '{"nodeId": "different-node-id", ...}'
# Expected: 403 Forbidden
```

---

**End of Example Data Document**

**Usage**: Copy these examples vào test suite hoặc use in development testing.
