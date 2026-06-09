# Phase 2 & 3 — Service Migration

Mỗi service migrate theo checklist này. Pilot đã hoàn thành với **`core-sys`**.

## Thứ tự migrate

| Thứ tự | Service | Status |
|---|---|---|
| 1 | `core-sys` | ✅ Done |
| 2 | `core-noti` | ⬜ Pending |
| 3 | `core-schd` | ⬜ Pending |
| 4 | `core-mona` | ⬜ Pending |
| 5 | `core-iam` | ⬜ Pending |
| 6 | `core-cbm` | ⬜ Pending |
| 7 | `core-aiwm` | ⬜ Pending |

---

## Cấu trúc repo (flat — học từ pilot)

```
core-<service>/
├── src/               ← trực tiếp ở root (không có services/<service>/src/)
│   ├── app/
│   ├── modules/
│   ├── main.ts
│   └── bootstrap-api.ts
├── Dockerfile
├── docker-entrypoint.sh
├── project.json
├── webpack.config.js
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.base.json
├── nx.json
├── package.json
├── .npmrc
└── .gitignore
```

---

## Checklist từng service

### Bước 1 — Tạo repo

```bash
export GITHUB_TOKEN=<fine-grained-pat>
gh repo create X-OR-Cloud/core-<service> --private
git clone https://x-access-token:${GITHUB_TOKEN}@github.com/X-OR-Cloud/core-<service>.git
```

### Bước 2 — Copy và flatten

```bash
MONO=/path/to/hydra-services
DEST=/path/to/core-<service>

# Copy toàn bộ service
cp -r $MONO/services/<service>/src          $DEST/src
cp    $MONO/services/<service>/Dockerfile   $DEST/
cp    $MONO/services/<service>/docker-entrypoint.sh $DEST/
cp    $MONO/services/<service>/webpack.config.js    $DEST/
cp    $MONO/services/<service>/tsconfig.json        $DEST/
cp    $MONO/services/<service>/tsconfig.app.json    $DEST/
cp    $MONO/tsconfig.base.json              $DEST/
cp    $MONO/nx.json                         $DEST/
```

### Bước 3 — `.npmrc`

```ini
@x-or-cloud:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

### Bước 4 — `.gitignore`

```
node_modules/
dist/
.env
*.js.map
```

### Bước 5 — `tsconfig.base.json` — xóa path aliases

```json
{
  "compilerOptions": {
    "baseUrl": "."
    // KHÔNG có paths — @x-or-cloud/* resolve từ node_modules
  }
}
```

### Bước 6 — `tsconfig.json` — fix extends path

```json
{
  "extends": "./tsconfig.base.json",   ← không phải ../../tsconfig.base.json
  "compilerOptions": { "esModuleInterop": true }
}
```

### Bước 7 — `tsconfig.app.json` — fix outDir

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",    ← không phải ../../dist/out-tsc
    "module": "commonjs",
    "types": ["node"],
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "target": "es2021"
  },
  "include": ["src/**/*.ts"]
}
```

### Bước 8 — `nx.json` — strip xuống tối thiểu

```json
{
  "$schema": "./node_modules/nx/schemas/nx-schema.json",
  "tui": { "enabled": false }
}
```

> ⚠️ Xóa `nxCloudId`, `@nx/eslint/plugin`, `@nx/jest/plugin` — các plugin này không được install trong repo standalone, sẽ gây lỗi khi build. `defaultProject` deprecated trong nx v21+, không hoạt động với `nx run`.

### Bước 9 — `project.json` — flat paths

```json
{
  "name": "<service>",
  "$schema": "./node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "src",
  "projectType": "application",
  "targets": {
    "build": {
      "executor": "nx:run-commands",
      "outputs": ["{workspaceRoot}/dist"],
      "options": {
        "command": "npx webpack-cli build",
        "args": ["--node-env=production"],
        "cwd": "."
      },
      "configurations": {
        "development": { "args": ["--node-env=development"] }
      }
    }
  },
  "tags": []
}
```

> Scripts `api`/`wrk` trong `package.json` dùng `node dist/main.js` trực tiếp — không cần target `api`/`wrk` trong `project.json`.

### Bước 10 — `webpack.config.js` — thay NxAppWebpackPlugin

```js
const { join } = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  target: 'node',
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  devtool: process.env.NODE_ENV !== 'production' ? 'source-map' : false,
  entry: './src/main.ts',
  output: {
    path: join(__dirname, 'dist'),
    filename: 'main.js',
  },
  resolve: { extensions: ['.ts', '.js'] },
  module: {
    rules: [{
      test: /\.ts$/,
      use: { loader: 'ts-loader', options: { configFile: 'tsconfig.app.json', transpileOnly: true } },
      exclude: /node_modules/,
    }],
  },
  optimization: { minimize: false },
  externalsPresets: { node: true },
  externals: [nodeExternals()],
};
```

> ⚠️ **Không dùng `NxAppWebpackPlugin`** — plugin này resolve workspace root từ nx daemon, sẽ output vào monorepo cũ thay vì repo mới.

### Bước 11 — `package.json`

```json
{
  "name": "@x-or-cloud/core-<service>",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "NODE_ENV=production node_modules/.bin/webpack-cli build",
    "build:dev": "NODE_ENV=development node_modules/.bin/webpack-cli build",
    "api": "npm run build && node dist/main.js",
    "api:dev": "NODE_ENV=development node_modules/.bin/webpack-cli build && node dist/main.js",
    "wrk": "npm run build && node dist/main.js wrk"
  },
  "dependencies": {
    "@x-or-cloud/base": "^1.0.1",
    "@x-or-cloud/shared": "^1.0.1",
    "@nestjs/common": "...",
    "..."
  },
  "devDependencies": {
    "@nx/js": "^21.0.0",
    "@nx/webpack": "^21.0.0",
    "@types/node": "^20.0.0",
    "nx": "^21.0.0",
    "ts-loader": "^9.0.0",
    "tslib": "^2.3.0",
    "typescript": "^5.3.3",
    "webpack-cli": "^5.0.0",
    "webpack-node-externals": "^3.0.0"
  }
}
```

> Thêm `@x-or-cloud/sys-client` nếu service dùng audit log.

### Bước 12 — Replace scope

```bash
find src -name "*.ts" -exec sed -i '' 's/@hydrabyte\//@x-or-cloud\//g' {} \;
grep -r "@hydrabyte" src/ || echo "clean"
```

### Bước 13 — Install & build

```bash
export GITHUB_TOKEN=<classic-pat>   ← cần classic PAT để install @x-or-cloud/* packages
npm install
NODE_ENV=production node_modules/.bin/webpack-cli build
ls dist/main.js   # verify output
```

Lỗi thường gặp:
- `Can't resolve '@x-or-cloud/...'` → check `.npmrc` và `GITHUB_TOKEN` env
- `Module not found: <some-dep>` → thêm vào `dependencies` trong `package.json`

### Bước 14 — Verify runtime

```bash
# Cần .env với MONGODB_URI, REDIS_HOST, PORT, ...
node dist/main.js
curl http://localhost:<port>/health
```

### Bước 15 — Commit & push

```bash
export GITHUB_TOKEN=<fine-grained-pat>
git config user.email "dev@x-or.cloud"
git config user.name "Tony Hoang"
git remote set-url origin https://x-access-token:${GITHUB_TOKEN}@github.com/X-OR-Cloud/core-<service>.git
git add .
git commit -m "feat: initial migration from hydra-services monorepo"
git push origin master
```

### Checklist hoàn thành

- [ ] Repo tạo xong
- [ ] Source copy + flatten về `src/` root
- [ ] `.npmrc`, `.gitignore` đúng
- [ ] `nxCloudId` đã xóa khỏi `nx.json`
- [ ] `webpack.config.js` dùng `ts-loader + webpack-node-externals`
- [ ] `tsconfig.base.json` không có path aliases
- [ ] `package.json` với `@x-or-cloud/*` dependencies
- [ ] `@hydrabyte/` đã replace thành `@x-or-cloud/` trong toàn bộ `src/`
- [ ] `npm install` không lỗi
- [ ] `npm run build` → `dist/main.js` tồn tại
- [ ] Code push lên GitHub

---

## Cross-service coupling

Nếu phát hiện service import trực tiếp từ service khác:

1. Shared type/enum → move vào `@x-or-cloud/shared`, publish version mới
2. Business logic → gọi qua HTTP/event (microservice pattern đúng)

---

## Cập nhật `@x-or-cloud/*` version

```bash
# Trong service repo
npm install @x-or-cloud/base@latest
# Commit riêng: chore: bump @x-or-cloud/base to v1.x.x
```
