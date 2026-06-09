# Phase 1 — Setup `core-libs` Repo & Publish

> **Status: ✅ DONE** — `@x-or-cloud/shared@1.0.1`, `@x-or-cloud/base@1.0.1`, `@x-or-cloud/sys-client@1.0.1` đã published.

## Tokens cần thiết (2 loại)

GitHub Packages cần **2 token khác nhau**:

| Mục đích | Token type | Scopes |
|---|---|---|
| Tạo repo, push code | Fine-grained PAT (resource owner = `X-OR-Cloud`) | `Contents: R/W`, `Administration: R/W`, `Metadata: R` |
| Publish/install npm packages | **Classic PAT** | `repo`, `write:packages`, `read:packages` |

> Fine-grained PAT **không có** `write:packages` scope → phải dùng classic PAT để publish.

## Cấu trúc repo `core-libs`

```
core-libs/
├── packages/
│   ├── base/
│   ├── shared/
│   └── sys-client/
├── tsconfig.base.json    ← standalone (không extends monorepo)
├── package.json          ← npm workspaces root
├── .npmrc
└── .gitignore
```

## `.npmrc`

```ini
@x-or-cloud:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

## Root `package.json`

```json
{
  "name": "@x-or-cloud/core-libs",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "build:shared": "npm run build -w packages/shared",
    "build:base": "npm run build -w packages/base",
    "build:sys-client": "npm run build -w packages/sys-client"
  },
  "devDependencies": {
    "@nestjs/common": "...", "@nestjs/core": "...", "@nestjs/config": "...",
    "@nestjs/mongoose": "...", "@nestjs/passport": "...", "@nestjs/swagger": "...",
    "@nestjs/terminus": "...", "@types/node": "...", "@types/passport-jwt": "...",
    "@types/express": "...", "@types/uuid": "...", "@types/qs": "...",
    "bullmq": "...", "class-transformer": "...", "class-validator": "...",
    "express": "...", "mongoose": "...", "passport": "...", "passport-jwt": "...",
    "prom-client": "...", "qs": "...", "rxjs": "...", "typescript": "^5.3.3",
    "uuid": "..."
  }
}
```

> Tất cả peer deps cài ở **root devDependencies** — các package dùng chung khi build.

## `package.json` từng package

```json
{
  "name": "@x-or-cloud/<name>",
  "version": "1.0.1",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": { "build": "tsc -p tsconfig.lib.json" },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com",
    "access": "restricted"
  }
}
```

`@x-or-cloud/base` cần thêm:
```json
"dependencies": { "@x-or-cloud/shared": "^1.0.1" }
```

## `tsconfig.lib.json` từng package — ⚠️ Critical

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",        ← BẮT BUỘC — thiếu cái này dist/ sẽ thành dist/packages/<name>/src/
    "declaration": true,
    "declarationMap": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "src/**/*.spec.ts"]
}
```

`@x-or-cloud/base` cần thêm `"strictPropertyInitialization": false` (DTOs không có initializer).

`@x-or-cloud/base` **không** dùng `paths` để resolve `@x-or-cloud/shared` — để npm workspaces symlink tự resolve từ `dist/`.

## Build order (quan trọng)

```bash
# Phải build shared trước vì base phụ thuộc vào nó
npm run build:shared
npm run build:base
npm run build:sys-client
```

## Publish workflow

```bash
export GITHUB_TOKEN=<classic-pat>

# Lần đầu
cd packages/shared && npm publish
cd ../base && npm publish
cd ../sys-client && npm publish

# Bump version (tất cả cùng lúc)
npm version 1.0.2 --workspaces --no-git-tag-version
# Rồi publish từng package như trên
```

## Beta workflow

```bash
npm version prerelease --preid=beta -w packages/base   # → 1.0.2-beta.0
cd packages/base && npm publish --tag beta

# Consumer
npm install @x-or-cloud/base@beta

# Promote stable
npm version patch -w packages/base --no-git-tag-version
cd packages/base && npm publish
```

## Checklist

- [x] 2 PATs tạo xong (fine-grained + classic)
- [x] Repo `X-OR-Cloud/core-libs` tạo
- [x] Code 3 packages copy, scope đổi `@hydrabyte/*` → `@x-or-cloud/*`
- [x] `rootDir: ./src` trong mọi `tsconfig.lib.json`
- [x] Build pass theo thứ tự shared → base → sys-client
- [x] `@x-or-cloud/shared@1.0.1` published
- [x] `@x-or-cloud/base@1.0.1` published
- [x] `@x-or-cloud/sys-client@1.0.1` published
