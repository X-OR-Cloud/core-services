# Conventions

## Stack
- **Framework:** NestJS + Nx monorepo
- **DB:** MongoDB + Mongoose ODM
- **Queue:** BullMQ + Redis
- **Auth:** JWT (PassportModule + JwtStrategy from `@hydrabyte/base`)
- **Docs:** Swagger/OpenAPI auto-generated

## Libraries
- `@hydrabyte/base` — BaseSchema, BaseService, JwtAuthGuard, CurrentUser, PaginationQueryDto, error decorators
- `@hydrabyte/shared` — RequestContext, createRoleBasedPermissions, PredefinedRole, service config, logging

## Naming
- Service folder: `services/<name>/`
- Schema: `<entity>.schema.ts` — class name PascalCase, collection auto-pluralized
- DTO: `<entity>.dto.ts` — `Create<Entity>Dto`, `Update<Entity>Dto` (PartialType)
- Service: `<entity>.service.ts` — extends `BaseService<Entity>`
- Controller: `<entity>.controller.ts` — standalone (NO BaseController)
- Module: `<entity>.module.ts`

## Port Allocation
| Range | Use |
|-------|-----|
| 3000-3009 | Dev ports (template=3000, iam=3001, ..., pag=3006) |
| 3300-3399 | Production (10 ports per service) |

Next available dev port: check existing services.

## Git
- Branch: `feature/<service-name>` or `fix/<service-name>-<description>`
- Commit prefix: `feat(<service>):`, `fix(<service>):`, `refactor(<service>):`

## Controller Pattern (Modern)
```typescript
@ApiTags('entities')
@ApiBearerAuth('JWT-auth')
@Controller('entities')
export class EntitiesController {
  constructor(private readonly service: EntitiesService) {}

  @Post()
  @ApiOperation({ summary: 'Create entity' })
  @ApiCreateErrors()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body(ValidationPipe) dto: CreateEntityDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.service.create(dto, context);
  }

  @Get()
  @ApiReadErrors({ notFound: false })
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: PaginationQueryDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.service.findAll(query, context);
  }

  @Get(':id')
  @ApiReadErrors()
  @UseGuards(JwtAuthGuard)
  async findById(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.service.findById(new Types.ObjectId(id) as any, context);
  }

  @Put(':id')
  @ApiUpdateErrors()
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body(ValidationPipe) dto: UpdateEntityDto,
    @CurrentUser() context: RequestContext,
  ) {
    return this.service.update(new Types.ObjectId(id) as any, dto, context);
  }

  @Delete(':id')
  @ApiDeleteErrors()
  @UseGuards(JwtAuthGuard)
  async delete(
    @Param('id') id: string,
    @CurrentUser() context: RequestContext,
  ) {
    return this.service.softDelete(new Types.ObjectId(id) as any, context);
  }
}
```

## Imports Cheat Sheet
```typescript
// Base lib
import { BaseService, JwtAuthGuard, CurrentUser, PaginationQueryDto,
         ApiCreateErrors, ApiReadErrors, ApiUpdateErrors, ApiDeleteErrors } from '@hydrabyte/base';
// Shared lib
import { RequestContext } from '@hydrabyte/shared';
// Mongoose
import { Types } from 'mongoose';
```

## main.ts Essentials
- `app.enableCors()` with specific headers
- `app.useGlobalFilters(new GlobalExceptionFilter())`
- `app.useGlobalInterceptors(new CorrelationIdInterceptor())`
- Swagger setup with JWT bearer auth
- NO global prefix (nginx handles routing)

## Environment Variables
- `MONGODB_URI` — MongoDB connection string
- `JWT_SECRET` — JWT signing secret
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` — for BullMQ
- Service-specific keys: `GOOGLE_API_KEY`, `ZALO_OA_*`, etc.
- All in `.env` at repo root
