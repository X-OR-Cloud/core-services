# Metrics Module - Implementation Plan

**Version**: 2.0
**Date**: 2026-01-14
**Status**: Updated for v2.0 Schema

---

## 📋 Table of Contents

1. [Implementation Overview](#implementation-overview)
2. [Phase 1: Foundation](#phase-1-foundation)
3. [Phase 2: Core Features](#phase-2-core-features)
4. [Phase 3: Aggregation & Retention](#phase-3-aggregation--retention)
5. [Phase 4: Testing & Optimization](#phase-4-testing--optimization)
6. [Deliverables](#deliverables)

---

## 1. Implementation Overview

### 1.1 Development Approach

**Methodology**: Clone Template Service + Incremental customization

**Strategy**:
- ✅ **Clone Template**: Start với `services/template/` để có production-ready foundation
- ✅ **Single Module**: Tất cả metrics logic trong 1 module (`metrics/`)
- ✅ **Micro-tasks**: Break down complex tasks thành small, manageable steps
- ✅ **Test-Driven**: Write tests trước hoặc cùng lúc với implementation
- ✅ **Incremental**: Ship working features incrementally

**Why Clone Template?**
- ✅ Production-ready structure (health check, error handling, RBAC)
- ✅ Consistent patterns across services
- ✅ Faster scaffolding (save 1-2 days)
- ✅ Focus on domain logic instead of boilerplate

### 1.2 Timeline Summary

| Phase | Duration | Deliverables | Dependencies |
|-------|----------|--------------|--------------|
| **Phase 0** | 0.5 day | Clone & customize template | None |
| **Phase 1** | 2 days | Schema, DTOs, Constants | Phase 0 |
| **Phase 2** | 3 days | Push API, Query API, Service layer | Phase 1 |
| **Phase 3** | 2 days | Aggregation worker, Retention policy | Phase 2 |
| **Phase 4** | 2 days | Testing, optimization, docs | Phase 3 |
| **Total** | **9.5 days** | **Production-ready MONA Service** | |

### 1.3 Team Allocation

**Recommended**: 1 Backend Developer, Full-time

**Skills Required**:
- NestJS framework
- MongoDB/Mongoose
- BullMQ (job queues)
- TypeScript
- Time-series data concepts

---

## 2. Phase 0: Clone Template (Day 0.5)

### 2.1 Goals

- ✅ Clone template service → MONA service
- ✅ Replace namespaces and types
- ✅ Remove template-specific modules
- ✅ Update configuration (port, database)
- ✅ Verify build và health check

### 2.2 Tasks Breakdown

#### Task 0.1: Clone và Setup Initial Structure (2 hours)

**Objective**: Clone template service và customize cơ bản

**Steps**:
```bash
# 1. Clone template service
cp -r services/template services/mona

# 2. Update service configuration
cd services/mona

# 3. Update package.json, project.json
# - name: "template" → "mona"
# - Database: "hydrabyte-template" → "core_mona"
# - Port: 3002 → 3004

# 4. Remove template-specific modules
rm -rf src/modules/category
rm -rf src/modules/product
rm -rf src/modules/report

# 5. Create metrics module
mkdir -p src/modules/metrics
touch src/modules/metrics/metrics.module.ts
touch src/modules/metrics/metrics.controller.ts
touch src/modules/metrics/metrics.service.ts
touch src/modules/metrics/metrics.schema.ts
touch src/modules/metrics/metrics.dto.ts
touch src/modules/metrics/metrics.constants.ts
```

**Files to Modify**:
1. `services/mona/project.json`:
   - Update service name references
   - Update port to 3004

2. `services/mona/.env.example`:
   ```env
   PORT=3004
   MONGODB_URI=mongodb://localhost:27017/core_mona
   REDIS_HOST=localhost
   REDIS_PORT=6379
   JWT_SECRET=your-jwt-secret
   INTERNAL_API_KEY=your-internal-api-key
   ```

3. `services/mona/src/app.module.ts`:
   - Remove template modules imports
   - Import MetricsModule

4. `services/mona/README.md`:
   - Update service name, port, description

**Acceptance Criteria**:
- ✅ Service builds successfully: `nx build mona`
- ✅ Health check works: `GET http://localhost:3004/health`
- ✅ Swagger docs accessible: `http://localhost:3004/api-docs`
- ✅ No template-specific code remains

---

#### Task 0.2: Setup Metrics Module Skeleton (1 hour)

**Objective**: Create basic metrics module structure from template patterns

**Implementation**:

**File**: `services/mona/src/modules/metrics/metrics.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { MetricData, MetricDataSchema } from './metrics.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MetricData.name, schema: MetricDataSchema },
    ]),
  ],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
```

**File**: `services/mona/src/modules/metrics/metrics.controller.ts` (skeleton)
```typescript
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@Controller('metrics')
@ApiTags('Metrics')
export class MetricsController {
  @Get('health')
  healthCheck() {
    return { status: 'ok', service: 'mona-metrics' };
  }
}
```

**Acceptance Criteria**:
- ✅ Metrics module loads successfully
- ✅ Health check endpoint works: `GET /metrics/health`
- ✅ Ready for schema implementation

---

## 3. Phase 1: Foundation (Days 1-2)

### 3.1 Goals

- ✅ Define MetricData schema với indexes
- ✅ Create DTOs và validation
- ✅ Setup constants và enums
- ✅ Basic unit tests

### 3.2 Tasks Breakdown

#### Task 1.1: Schema Implementation (4 hours)

**Objective**: Implement MetricData schema với full validation

**Steps**:
1. Copy schema từ `02-schema-design.md`
2. Add validation decorators
3. Create indexes
4. Add schema hooks (pre-save validation)
5. Test schema với sample data

**Key Files**:
```typescript
// metrics.schema.ts
import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseSchema } from '@hydrabyte/base';

export enum MetricType {
  NODE = 'node',
  RESOURCE = 'resource',
  DEPLOYMENT = 'deployment',
  SYSTEM = 'system',
}

export enum AggregationInterval {
  ONE_MIN = '1min',
  FIVE_MIN = '5min',
  ONE_HOUR = '1hour',
  ONE_DAY = '1day',
}

@Schema({ timestamps: true })
export class MetricData extends BaseSchema {
  // ... full schema implementation from design doc
}

export const MetricDataSchema = SchemaFactory.createForClass(MetricData);

// Indexes
MetricDataSchema.index(
  { type: 1, entityId: 1, timestamp: -1 },
  { name: 'metrics_time_range_query' }
);
// ... other indexes
```

**Acceptance Criteria**:
- ✅ Schema compiles successfully
- ✅ All indexes are created
- ✅ Can insert sample document
- ✅ Validation works correctly

---

#### Task 1.2: DTOs Implementation (4 hours)

**Objective**: Create DTOs cho Push API và Query API

**Key Files**:
```typescript
// metrics.dto.ts

// ============= Push API DTOs =============

export class PushNodeMetricsDto {
  @IsString()
  @IsNotEmpty()
  nodeId: string;

  @IsISO8601()
  timestamp: string;

  @IsOptional()
  @IsEnum(AggregationInterval)
  interval?: string;

  @ValidateNested()
  @Type(() => NodeCpuMetricsDto)
  cpu: NodeCpuMetricsDto;

  @ValidateNested()
  @Type(() => NodeMemoryMetricsDto)
  memory: NodeMemoryMetricsDto;

  // ... other fields
}

export class PushResourceMetricsDto {
  // ... similar structure
}

// ============= Query API DTOs =============

export class QueryMetricsDto extends PaginationQueryDto {
  @IsISO8601()
  @IsNotEmpty()
  startTime: string;

  @IsISO8601()
  @IsNotEmpty()
  endTime: string;

  @IsOptional()
  @IsEnum(AggregationInterval)
  interval?: string;

  @IsOptional()
  @IsString()
  fields?: string; // Comma-separated
}

// ============= Response DTOs =============

export class MetricsResponseDto {
  success: boolean;
  data: any;
  pagination?: PaginationResponseDto;
}
```

**Acceptance Criteria**:
- ✅ All DTOs compile successfully
- ✅ Validation decorators applied correctly
- ✅ OpenAPI decorators added for Swagger
- ✅ DTOs match API design spec

---

#### Task 1.3: Constants & Enums (1 hour)

**Objective**: Define constants cho module

**File**: `metrics.constants.ts`

```typescript
export const METRIC_TYPES = {
  NODE: 'node',
  RESOURCE: 'resource',
  DEPLOYMENT: 'deployment',
  SYSTEM: 'system',
} as const;

export const AGGREGATION_INTERVALS = {
  ONE_MIN: '1min',
  FIVE_MIN: '5min',
  ONE_HOUR: '1hour',
  ONE_DAY: '1day',
} as const;

export const RETENTION_POLICY = {
  '1min': 7 * 24 * 60 * 60, // 7 days in seconds
  '5min': 30 * 24 * 60 * 60, // 30 days
  '1hour': 90 * 24 * 60 * 60, // 90 days
  '1day': 365 * 24 * 60 * 60, // 365 days
} as const;

export const RATE_LIMITS = {
  NODE_PUSH: { limit: 1, window: 60 }, // 1 req/min
  RESOURCE_PUSH: { limit: 1, window: 300 }, // 1 req/5min
  QUERY: { limit: 10, window: 60 }, // 10 req/min
} as const;
```

**Acceptance Criteria**:
- ✅ Constants defined
- ✅ Values match design spec
- ✅ TypeScript types are correct

---

#### Task 1.4: Basic Tests Setup (3 hours)

**Objective**: Setup testing infrastructure

**Files to Create**:
- `metrics.service.spec.ts`
- `metrics.controller.spec.ts`
- `metrics.schema.spec.ts`

**Example Test**:
```typescript
// metrics.schema.spec.ts
describe('MetricData Schema', () => {
  it('should create a valid node metric', () => {
    const metric = new MetricData({
      type: MetricType.NODE,
      entityType: 'node',
      entityId: 'test-node-id',
      timestamp: new Date(),
      interval: AggregationInterval.ONE_MIN,
      node: {
        cpu: { usage: 50, cores: 8, loadAverage: [1, 1, 1] },
        memory: { total: 1000, used: 500, free: 500, cached: 0, usagePercent: 50 },
        // ...
      },
      owner: { orgId: 'test-org' },
      createdBy: 'test-user',
    });

    expect(metric.type).toBe(MetricType.NODE);
    expect(metric.node.cpu.usage).toBe(50);
  });

  it('should reject invalid CPU usage', () => {
    expect(() => {
      new MetricData({
        // ... with cpu.usage = 150
      });
    }).toThrow();
  });
});
```

**Acceptance Criteria**:
- ✅ Test files created
- ✅ Basic schema validation tests pass
- ✅ Test coverage > 70% for schemas

---

### 3.3 Phase 1 Deliverables

**Checklist**:
- ✅ Metrics module structure created
- ✅ Schema implemented với indexes
- ✅ DTOs implemented với validation
- ✅ Constants defined
- ✅ Basic tests passing
- ✅ Module compiles without errors
- ✅ Documentation updated

**Review Points**:
1. Schema matches design doc?
2. DTOs cover all API endpoints?
3. Validation rules comprehensive?
4. Tests cover edge cases?

---

## 4. Phase 2: Core Features (Days 3-5)

### 4.1 Goals

- ✅ Implement Push API endpoints
- ✅ Implement Query API endpoints
- ✅ Implement Service layer với business logic
- ✅ Add authentication và authorization
- ✅ Add rate limiting

### 4.2 Tasks Breakdown

#### Task 2.1: Service Layer - Push Methods (6 hours)

**Objective**: Implement service methods để receive và store metrics

**Methods to Implement**:
```typescript
// metrics.service.ts
@Injectable()
export class MetricsService extends BaseService<MetricData> {
  constructor(
    @InjectModel(MetricData.name)
    private readonly metricModel: Model<MetricData>
  ) {
    super(metricModel);
  }

  /**
   * Store node metrics từ push API
   */
  async storeNodeMetrics(
    dto: PushNodeMetricsDto,
    context: RequestContext
  ): Promise<MetricData> {
    // 1. Validate nodeId ownership (via JWT)
    await this.validateNodeOwnership(dto.nodeId, context);

    // 2. Transform DTO to schema
    const metric = this.transformNodeMetricsDto(dto, context);

    // 3. Validate business rules
    this.validateNodeMetrics(metric);

    // 4. Save to database
    return this.metricModel.create(metric);
  }

  /**
   * Store resource metrics từ push API
   */
  async storeResourceMetrics(
    dto: PushResourceMetricsDto,
    context: RequestContext
  ): Promise<MetricData> {
    // Similar implementation
  }

  /**
   * Validate node ownership (prevent metric spoofing)
   */
  private async validateNodeOwnership(
    nodeId: string,
    context: RequestContext
  ): Promise<void> {
    // Check if nodeId trong JWT matches với nodeId trong request
    // Or check if user có quyền push metrics cho node này
  }

  /**
   * Business logic validation
   */
  private validateNodeMetrics(metric: MetricData): void {
    // Validate: used + free <= total
    if (metric.node.memory.used + metric.node.memory.free > metric.node.memory.total * 1.1) {
      throw new UnprocessableEntityException('Invalid memory stats');
    }

    // Validate: GPU memory
    metric.node.gpu?.forEach(gpu => {
      if (gpu.memoryUsed > gpu.memoryTotal) {
        throw new UnprocessableEntityException('Invalid GPU memory stats');
      }
    });
  }
}
```

**Acceptance Criteria**:
- ✅ `storeNodeMetrics()` works correctly
- ✅ `storeResourceMetrics()` works correctly
- ✅ Validation catches invalid data
- ✅ Ownership validation works
- ✅ Unit tests pass (>80% coverage)

---

#### Task 2.2: Push API Controller (4 hours)

**Objective**: Implement REST endpoints để receive metrics

**Implementation**:
```typescript
// metrics.controller.ts
@Controller('metrics')
@ApiTags('Metrics - Push API')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Post('push/node')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Push node metrics' })
  @ApiCreatedResponse({ description: 'Metrics stored successfully' })
  @ApiBadRequestResponse({ description: 'Invalid data format' })
  @ApiForbiddenResponse({ description: 'Node ownership mismatch' })
  async pushNodeMetrics(
    @Body() dto: PushNodeMetricsDto,
    @CurrentUser() context: RequestContext
  ): Promise<MetricsResponseDto> {
    const metric = await this.metricsService.storeNodeMetrics(dto, context);

    return {
      success: true,
      message: 'Node metrics received successfully',
      data: {
        metricId: metric._id,
        nodeId: metric.entityId,
        timestamp: metric.timestamp,
        interval: metric.interval,
      },
    };
  }

  @Post('push/resource')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Push resource metrics' })
  async pushResourceMetrics(
    @Body() dto: PushResourceMetricsDto,
    @CurrentUser() context: RequestContext
  ): Promise<MetricsResponseDto> {
    // Similar implementation
  }
}
```

**Acceptance Criteria**:
- ✅ Endpoints respond correctly
- ✅ JWT authentication works
- ✅ Request validation works
- ✅ Error responses formatted correctly
- ✅ Swagger docs generated

---

#### Task 2.3: Service Layer - Query Methods (6 hours)

**Objective**: Implement query methods để fetch metrics

**Methods to Implement**:
```typescript
// metrics.service.ts

/**
 * Query node metrics với time range
 */
async queryNodeMetrics(
  nodeId: string,
  query: QueryMetricsDto,
  context: RequestContext
): Promise<{ metrics: MetricData[]; pagination: PaginationResponseDto }> {
  // 1. Build query filters
  const filters: any = {
    type: MetricType.NODE,
    entityId: nodeId,
    timestamp: {
      $gte: new Date(query.startTime),
      $lt: new Date(query.endTime),
    },
    'owner.orgId': context.orgId, // RBAC filter
  };

  if (query.interval) {
    filters.interval = query.interval;
  }

  // 2. Build projection (field selection)
  const projection = this.buildProjection(query.fields);

  // 3. Execute query với pagination
  const page = query.page || 1;
  const limit = Math.min(query.limit || 100, 1000);
  const skip = (page - 1) * limit;

  const [metrics, total] = await Promise.all([
    this.metricModel
      .find(filters, projection)
      .sort({ timestamp: 1 }) // Ascending order
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),
    this.metricModel.countDocuments(filters),
  ]);

  // 4. Return với pagination info
  return {
    metrics,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
}

/**
 * Get latest metric data
 */
async getLatestMetric(
  type: MetricType,
  entityId: string,
  context: RequestContext
): Promise<MetricData | null> {
  return this.metricModel
    .findOne({
      type,
      entityId,
      'owner.orgId': context.orgId,
    })
    .sort({ timestamp: -1 })
    .lean()
    .exec();
}

/**
 * Build projection object từ fields string
 */
private buildProjection(fields?: string): any {
  if (!fields) return null;

  const fieldList = fields.split(',').map(f => f.trim());
  const projection: any = {
    _id: 1,
    type: 1,
    entityId: 1,
    entityName: 1,
    timestamp: 1,
    interval: 1,
  };

  fieldList.forEach(field => {
    switch (field) {
      case 'cpu':
        projection['node.cpu'] = 1;
        projection['resource.cpu'] = 1;
        break;
      case 'memory':
        projection['node.memory'] = 1;
        projection['resource.memory'] = 1;
        break;
      case 'gpu':
        projection['node.gpu'] = 1;
        break;
      // ... more cases
    }
  });

  return projection;
}
```

**Acceptance Criteria**:
- ✅ Query returns correct data
- ✅ Pagination works
- ✅ Field selection works
- ✅ RBAC filtering works
- ✅ Performance acceptable (< 500ms)
- ✅ Unit tests pass

---

#### Task 2.4: Query API Controller (4 hours)

**Objective**: Implement REST endpoints để query metrics

**Implementation**:
```typescript
// metrics.controller.ts

@Get('nodes/:nodeId')
@UseGuards(JwtAuthGuard)
@ApiOperation({ summary: 'Query node metrics' })
@ApiOkResponse({ description: 'Node metrics retrieved successfully' })
async queryNodeMetrics(
  @Param('nodeId') nodeId: string,
  @Query() query: QueryMetricsDto,
  @CurrentUser() context: RequestContext
): Promise<MetricsResponseDto> {
  const result = await this.metricsService.queryNodeMetrics(nodeId, query, context);

  return {
    success: true,
    data: {
      nodeId,
      nodeName: result.metrics[0]?.entityName,
      interval: query.interval || '1min',
      timeRange: {
        start: query.startTime,
        end: query.endTime,
      },
      metrics: result.metrics,
      pagination: result.pagination,
    },
  };
}

@Get('resources/:resourceId')
@UseGuards(JwtAuthGuard)
async queryResourceMetrics(
  @Param('resourceId') resourceId: string,
  @Query() query: QueryMetricsDto,
  @CurrentUser() context: RequestContext
): Promise<MetricsResponseDto> {
  // Similar implementation
}

@Get('deployments/:deploymentId')
@UseGuards(JwtAuthGuard)
async queryDeploymentMetrics(
  @Param('deploymentId') deploymentId: string,
  @Query() query: QueryMetricsDto,
  @CurrentUser() context: RequestContext
): Promise<MetricsResponseDto> {
  // Similar implementation
}

@Get('system')
@UseGuards(JwtAuthGuard)
async querySystemMetrics(
  @Query() query: QueryMetricsDto,
  @CurrentUser() context: RequestContext
): Promise<MetricsResponseDto> {
  // Similar implementation
}

@Get(':type/:entityId/latest')
@UseGuards(JwtAuthGuard)
@ApiOperation({ summary: 'Get latest metric data' })
async getLatestMetric(
  @Param('type') type: MetricType,
  @Param('entityId') entityId: string,
  @CurrentUser() context: RequestContext
): Promise<MetricsResponseDto> {
  const metric = await this.metricsService.getLatestMetric(type, entityId, context);

  if (!metric) {
    throw new NotFoundException('No metrics found for this entity');
  }

  return {
    success: true,
    data: {
      type,
      entityId,
      entityName: metric.entityName,
      timestamp: metric.timestamp,
      interval: metric.interval,
      metrics: this.extractMetricData(metric),
    },
  };
}
```

**Acceptance Criteria**:
- ✅ All query endpoints work
- ✅ Response format matches spec
- ✅ Error handling works
- ✅ Swagger docs complete

---

#### Task 2.5: Rate Limiting (2 hours)

**Objective**: Add rate limiting để prevent abuse

**Implementation**:
```typescript
// Use @nestjs/throttler

import { ThrottlerGuard } from '@nestjs/throttler';

@Controller('metrics')
@UseGuards(ThrottlerGuard)
export class MetricsController {
  // Push endpoints: 1 req/min per node
  @Post('push/node')
  @Throttle({ default: { limit: 1, ttl: 60000 } })
  async pushNodeMetrics() { ... }

  // Query endpoints: 10 req/min
  @Get('nodes/:nodeId')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async queryNodeMetrics() { ... }
}
```

**Acceptance Criteria**:
- ✅ Rate limiting works
- ✅ Headers returned correctly
- ✅ 429 error on exceed

---

### 4.3 Phase 2 Deliverables

**Checklist**:
- ✅ Push API endpoints working
- ✅ Query API endpoints working
- ✅ Service layer complete
- ✅ Authentication & authorization working
- ✅ Rate limiting implemented
- ✅ Tests passing (>80% coverage)
- ✅ Swagger docs complete

**Integration Tests**:
```bash
# Test push node metrics
curl -X POST http://localhost:3004/metrics/push/node \
  -H "Authorization: Bearer $JWT" \
  -d @test-node-metrics.json

# Test query metrics
curl -X GET "http://localhost:3004/metrics/nodes/test-node?startTime=2026-01-14T00:00:00Z&endTime=2026-01-14T23:59:59Z" \
  -H "Authorization: Bearer $JWT"
```

---

## 5. Phase 3: Aggregation & Retention (Days 6-7)

### 5.1 Goals

- ✅ Implement aggregation worker
- ✅ Setup cron jobs
- ✅ Implement retention cleanup
- ✅ Add monitoring

### 5.2 Tasks Breakdown

#### Task 3.1: Aggregation Service (8 hours)

**Objective**: Implement aggregation logic

**Files to Create**:
- `metrics.aggregation.service.ts`
- `metrics.aggregation.spec.ts`

**Implementation**: See `04-aggregation-strategy.md` for full code

**Key Methods**:
- `aggregate1minTo5min()`
- `aggregate5minTo1hour()`
- `aggregate1hourTo1day()`
- `aggregateNodeMetrics()`
- `aggregateResourceMetrics()`
- `aggregateDeploymentMetrics()`

**Acceptance Criteria**:
- ✅ Aggregation produces correct results
- ✅ Cron jobs run on schedule
- ✅ Error handling works
- ✅ Tests pass

---

#### Task 3.2: Retention Cleanup (4 hours)

**Objective**: Implement automatic cleanup

**Implementation**:
```typescript
@Injectable()
export class MetricsRetentionService {
  @Cron('0 2 * * *') // Daily at 2 AM
  async cleanupExpiredMetrics() {
    const now = Date.now();

    // Cleanup by interval
    for (const [interval, retentionSeconds] of Object.entries(RETENTION_POLICY)) {
      const cutoffTime = new Date(now - retentionSeconds * 1000);

      const result = await this.metricModel.deleteMany({
        interval,
        timestamp: { $lt: cutoffTime },
      });

      this.logger.log(`Deleted ${result.deletedCount} expired ${interval} metrics`);
    }
  }
}
```

**Acceptance Criteria**:
- ✅ Cleanup runs successfully
- ✅ Correct documents deleted
- ✅ Logging works

---

#### Task 3.3: Monitoring & Health Checks (4 hours)

**Objective**: Add monitoring cho aggregation jobs

**Endpoints to Add**:
```typescript
@Get('aggregation/health')
async getAggregationHealth() {
  return {
    status: 'ok',
    aggregations: {
      '1min-to-5min': {
        lastRun: '2026-01-14T10:00:00Z',
        status: 'success',
        nextRun: '2026-01-14T10:05:00Z',
      },
      // ...
    },
  };
}

@Get('aggregation/stats')
async getAggregationStats() {
  return {
    last24Hours: {
      jobsRun: 288,
      jobsSucceeded: 286,
      jobsFailed: 2,
      avgDuration: 1250, // ms
      entitiesProcessed: 10000,
    },
  };
}
```

**Acceptance Criteria**:
- ✅ Health endpoint works
- ✅ Stats accurate
- ✅ Logging comprehensive

---

### 5.3 Phase 3 Deliverables

**Checklist**:
- ✅ Aggregation worker implemented
- ✅ Cron jobs running
- ✅ Retention cleanup working
- ✅ Monitoring endpoints working
- ✅ Tests passing

---

## 6. Phase 4: Testing & Optimization (Days 8-9)

### 6.1 Goals

- ✅ Comprehensive testing
- ✅ Performance optimization
- ✅ Documentation updates
- ✅ Production readiness check

### 6.2 Tasks Breakdown

#### Task 4.1: End-to-End Testing (6 hours)

**Test Scenarios**:
1. Node push metrics → Query metrics → Verify data
2. Multiple nodes push simultaneously
3. Aggregation runs → Verify aggregated data
4. Retention cleanup → Verify old data deleted
5. Error scenarios (invalid data, auth failures)
6. Load testing (1000 pushes/min)

**Tools**:
- Jest for unit/integration tests
- Supertest for API testing
- Artillery for load testing

**Acceptance Criteria**:
- ✅ All E2E tests pass
- ✅ Load tests meet requirements
- ✅ Test coverage > 85%

---

#### Task 4.2: Performance Optimization (6 hours)

**Optimization Areas**:
1. Query optimization (add indexes if needed)
2. Aggregation optimization (batch processing)
3. Memory optimization (lean queries)
4. Connection pooling tuning

**Performance Targets**:
- Push API: < 100ms response time
- Query API: < 500ms for 30-day range
- Aggregation: < 5 minutes per job
- Storage: < 10GB/month for 100 nodes

**Acceptance Criteria**:
- ✅ Performance targets met
- ✅ No memory leaks
- ✅ Database indexes optimal

---

#### Task 4.3: Documentation (4 hours)

**Documents to Update**:
1. AIWM Service README
2. API documentation (Swagger)
3. Deployment guide
4. Troubleshooting guide

**Acceptance Criteria**:
- ✅ All docs up-to-date
- ✅ API examples work
- ✅ Deployment steps verified

---

#### Task 4.4: Production Readiness (2 hours)

**Checklist**:
- ✅ Environment variables documented
- ✅ Database migrations ready (indexes)
- ✅ Monitoring alerts configured
- ✅ Error tracking setup (Sentry/etc)
- ✅ Backup strategy defined
- ✅ Rollback plan documented

---

### 6.3 Phase 4 Deliverables

**Checklist**:
- ✅ All tests passing
- ✅ Performance optimized
- ✅ Documentation complete
- ✅ Production-ready

---

## 7. Deliverables

### 7.1 Code Deliverables

**Module Structure**:
```
services/mona/src/modules/metrics/
├── metrics.module.ts
├── metrics.controller.ts
├── metrics.service.ts
├── metrics.aggregation.service.ts
├── metrics.retention.service.ts
├── metrics.schema.ts
├── metrics.dto.ts
├── metrics.constants.ts
├── metrics.controller.spec.ts
├── metrics.service.spec.ts
├── metrics.aggregation.spec.ts
└── README.md
```

### 7.2 Documentation Deliverables

- ✅ API documentation (Swagger UI)
- ✅ Module README
- ✅ Design documents (this folder)
- ✅ Integration guide
- ✅ Troubleshooting guide

### 7.3 Testing Deliverables

- ✅ Unit tests (>85% coverage)
- ✅ Integration tests
- ✅ E2E tests
- ✅ Load test reports

### 7.4 Deployment Deliverables

- ✅ Migration scripts (indexes)
- ✅ Environment configuration
- ✅ Monitoring setup
- ✅ Deployment guide

---

## 8. Risk Management

### 8.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Storage explosion | Medium | High | Aggressive TTL, efficient aggregation |
| Query performance degradation | Medium | High | Proper indexing, pagination, caching |
| Aggregation job failures | Low | Medium | Retry logic, monitoring, alerts |
| Data inconsistency | Low | Medium | Transaction support, validation |

### 8.2 Schedule Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Underestimated complexity | Medium | Medium | Buffer time, incremental delivery |
| Integration issues | Low | Medium | Early integration testing |
| Scope creep | Medium | High | Strict adherence to MVP scope |

---

## 9. Success Criteria

### 9.1 Functional

- ✅ Nodes có thể push metrics successfully
- ✅ Frontend có thể query metrics với filters
- ✅ Aggregation runs automatically
- ✅ Old data cleaned up automatically
- ✅ All tests passing

### 9.2 Non-Functional

- ✅ Push API < 100ms response time
- ✅ Query API < 500ms for 30-day range
- ✅ Storage < 10GB/month for 100 nodes
- ✅ Test coverage > 85%
- ✅ Zero data loss

### 9.3 Quality

- ✅ Code reviewed và approved
- ✅ Documentation complete
- ✅ Production-ready
- ✅ Monitoring configured

---

## 10. Post-Implementation

### 10.1 Monitoring

**Metrics to Track**:
- Push API latency và error rate
- Query API latency và error rate
- Aggregation job duration và success rate
- Storage growth rate
- Database query performance

**Alerts**:
- Aggregation job failures
- High error rates (> 5%)
- Storage approaching limits
- Query performance degradation

### 10.2 Optimization Opportunities (Phase 2+)

1. **Caching**: Redis cache cho frequently accessed metrics
2. **Batch API**: Support batch metric push
3. **WebSocket**: Real-time metric streaming
4. **Export**: Prometheus/OpenTelemetry export
5. **ML**: Anomaly detection

---

**End of Implementation Plan**

**Ready for Review**: Please review all design documents và approve before starting implementation.

**Questions**: See [01-overview.md](./01-overview.md) Section 9 for open questions.
