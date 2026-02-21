# Service Scaffold — Step by Step

## Prerequisites
- Repo cloned, `npm install` done
- `.env` at repo root with MONGODB_URI, JWT_SECRET, REDIS_*

## Step 1: Generate Nx Project
```bash
npx nx g @nx/nest:application <service-name> --directory=services/<service-name>
```
Or manually create `services/<name>/` with `project.json`, `tsconfig.*.json`, `webpack.config.js`.

Quickest: copy from `services/template/` and find-replace "template" → "<name>".

## Step 2: project.json
Key targets:
```json
{
  "name": "<service>",
  "sourceRoot": "services/<service>/src",
  "projectType": "application",
  "targets": {
    "build": {
      "executor": "nx:run-commands",
      "options": {
        "command": "npx webpack-cli build",
        "args": ["--node-env=production"],
        "cwd": "services/<service>"
      }
    },
    "api": {
      "dependsOn": ["build"],
      "executor": "nx:run-commands",
      "options": {
        "command": "node ../../dist/services/<service>/main.js",
        "cwd": "services/<service>"
      }
    }
  }
}
```

## Step 3: main.ts
Reference: `assets/service-template/main.ts`

Key setup:
- Port from env or default
- CORS enabled
- GlobalExceptionFilter + CorrelationIdInterceptor
- Swagger with JWT bearer
- Health check log on startup

## Step 4: app.module.ts
```typescript
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    MongooseModule.forRoot(
      process.env['MONGODB_URI'] || 'mongodb://localhost:27017',
      { dbName: 'core_<service>' },
    ),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Entity modules
    HealthModule,
    EntityOneModule,
    EntityTwoModule,
    // Queue modules (if needed)
    QueueModule,
    ProcessorsModule,
  ],
  providers: [JwtStrategy],
})
export class AppModule {}
```

## Step 5: Health Module
Create `modules/health/`:
- `health.controller.ts` — `GET /health` returns status, version, uptime, DB check
- `health.module.ts`
- No auth guard on health endpoint

## Step 6: Entity Modules
For each entity, create 5 files in `modules/<entity>/`:

### 6a. Schema (`<entity>.schema.ts`)
```typescript
@Schema({ timestamps: true, collection: '<entities>' })
export class Entity extends BaseSchema {
  @Prop({ required: true })
  name: string;

  @Prop({ type: Object, default: {} })
  config: Record<string, any>;  // For nested objects

  @Prop({ type: String, enum: ['active', 'inactive'], default: 'active' })
  status: string;
}
export const EntitySchema = SchemaFactory.createForClass(Entity);
EntitySchema.index({ name: 1 });
```

### 6b. DTO (`<entity>.dto.ts`)
```typescript
export class CreateEntityDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: ['active', 'inactive'] })
  @IsEnum(['active', 'inactive']) status: string;
  // ... other fields with class-validator decorators
}
export class UpdateEntityDto extends PartialType(CreateEntityDto) {}
```

### 6c. Service (`<entity>.service.ts`)
```typescript
@Injectable()
export class EntityService extends BaseService<Entity> {
  constructor(@InjectModel(Entity.name) model: Model<Entity>) {
    super(model);
  }
  // Add custom methods as needed. BaseService provides:
  // create(), findAll(), findById(), update(), softDelete()
}
```

### 6d. Controller — see `conventions.md` for full pattern

### 6e. Module (`<entity>.module.ts`)
```typescript
@Module({
  imports: [MongooseModule.forFeature([{ name: Entity.name, schema: EntitySchema }])],
  controllers: [EntityController],
  providers: [EntityService],
  exports: [EntityService],
})
export class EntityModule {}
```

## Step 7: Build & Verify
```bash
npx nx run <service>:build
# Should see "webpack compiled successfully"

# Start and test
npx nx run <service>:api
curl http://localhost:<port>/health
```

## Step 8: Systemd (Production)
```ini
[Unit]
Description=<Service> Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/path/to/hydra-services
EnvironmentFile=/path/to/hydra-services/.env
ExecStart=/usr/bin/node dist/services/<service>/main.js
Restart=on-failure
RestartSec=5
SyslogIdentifier=<service>

[Install]
WantedBy=multi-user.target
```

## Checklist
- [ ] `npx nx run <service>:build` — no errors
- [ ] Health endpoint returns 200 with DB status
- [ ] All CRUD endpoints respond correctly
- [ ] Swagger docs at `/<service>/api-docs` (or `/api-docs`)
- [ ] JWT auth working (401 without token, 200 with valid token)
- [ ] Soft delete working (isDeleted flag, not hard delete)
