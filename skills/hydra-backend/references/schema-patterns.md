# Schema Patterns & Gotchas

## BaseSchema Fields (inherited automatically)
All schemas extend `BaseSchema` which provides:
- `metadata` — arbitrary key-value (Object)
- `createdAt`, `updatedAt`, `deletedAt` — timestamps
- `owner` — { orgId, groupId, userId, agentId, appId }
- `isDeleted` — soft delete flag
- `createdBy`, `updatedBy` — audit trail (Object)

**DO NOT** redeclare these fields in your schema.

## Basic @Prop Usage
```typescript
@Prop({ required: true })
name: string;

@Prop({ type: String, enum: ['active', 'inactive'], default: 'active' })
status: string;

@Prop({ type: Number, default: 0 })
count: number;

@Prop({ type: Boolean, default: true })
isEnabled: boolean;

@Prop({ type: [String], default: [] })
tags: string[];

@Prop({ type: Date })
expiresAt: Date;
```

## ⚠️ CRITICAL: Nested Objects
**NEVER** define nested fields with `required` inside `type: {}`:
```typescript
// ❌ WRONG — Mongoose interprets "required" as a schema type
@Prop({
  type: {
    provider: { type: String, required: true },
    model: { type: String, required: true },
    temperature: { type: Number, required: false },
  }
})
config: { provider: string; model: string; temperature?: number };

// ✅ CORRECT — Use { type: Object } for nested objects
@Prop({ type: Object, default: {} })
config: Record<string, any>;

// ✅ ALSO CORRECT — Simple nested without "required"
@Prop({ type: Object })
config: {
  provider: string;
  model: string;
  temperature?: number;
};
```

**Error you'll see if you get this wrong:**
```
TypeError: Invalid schema configuration: 'true' is not a valid type at path 'required'
```

**Rule:** Validate nested object fields in the DTO layer (class-validator), not in Mongoose schema.

## Nested Object DTO Pattern
```typescript
export class ConfigDto {
  @ApiProperty() @IsString() provider: string;
  @ApiProperty() @IsString() model: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() temperature?: number;
}

export class CreateEntityDto {
  @ApiProperty() @IsObject() @ValidateNested() @Type(() => ConfigDto)
  config: ConfigDto;
}
```

## Arrays of Objects
```typescript
// Schema
@Prop({ type: [Object], default: [] })
items: Record<string, any>[];

// DTO
@IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ItemDto)
items?: ItemDto[];
```

## Indexes
```typescript
// After schema class definition
export const EntitySchema = SchemaFactory.createForClass(Entity);
EntitySchema.index({ slug: 1 }, { unique: true });
EntitySchema.index({ status: 1 });
EntitySchema.index({ 'owner.orgId': 1, createdAt: -1 });
```

**Avoid** duplicate indexes — don't use both `@Prop({ index: true })` AND `schema.index()` on same field.

## ObjectId References
```typescript
@Prop({ type: String })  // Store as string for simplicity
channelId: string;

// Or use Mongoose ObjectId (requires population)
@Prop({ type: Types.ObjectId, ref: 'Channel' })
channelId: Types.ObjectId;
```
For MVP, storing as string is simpler (no populate needed).
