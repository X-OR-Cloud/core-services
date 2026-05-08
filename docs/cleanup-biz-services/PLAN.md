# Cleanup biz services khỏi repo core-services

**Ngày tạo:** 2026-05-09
**Mục tiêu:** Loại bỏ toàn bộ biz services (`vsm`, `pag`, `aivp`, `vbx`, `lcm`) ra khỏi repo này. Repo còn lại chỉ giữ core services (`template`, `iam`, `noti`, `aiwm`, `cbm`, `mona`, `schd`) + libs + infra/docs core.

**Ngữ cảnh:** Repo đã được clone sang một repo riêng cho biz; clone đó giữ biz và bỏ core. Repo này đi ngược chiều — bỏ biz, giữ core.

---

## 1. Phạm vi rà soát (đã xác định)

### 1.1 Service folders (xoá toàn bộ)
- [services/vsm/](../../services/vsm/)
- [services/pag/](../../services/pag/)
- [services/aivp/](../../services/aivp/)
- [services/vbx/](../../services/vbx/)

> `lcm` chưa có service folder.

### 1.2 Per-service CLAUDE files ở root (xoá)
- [CLAUDE_VSM.md](../../CLAUDE_VSM.md)
- [CLAUDE_PAG.md](../../CLAUDE_PAG.md)

> Không có CLAUDE_AIVP.md / CLAUDE_VBX.md / CLAUDE_LCM.md.

### 1.3 Docs biz (xoá)
- [docs/vsm/](../vsm/)
- [docs/pag/](../pag/)
- [docs/lcm/](../lcm/)

> Không có docs/aivp / docs/vbx.

### 1.4 PM2 ecosystem ([ecosystem.config.js](../../ecosystem.config.js))
- Xoá block biz: lines **1089-1264** (6 processes: `biz.vsm.api00/01/ami00`, `biz.pag.api00/01/wrk00`).
- Xoá luôn section markers `// ========== VSM ... ==========` và `// ========== PAG ... ==========`.
- Kết quả: file kết thúc tại block SCHD (~line 1086), đóng `],}` bình thường.

### 1.5 Env files
- [.env](../../.env), [.env.hbx](../../.env.hbx): xoá `PAG_BASE_URL`, `PAG_DISCORD_WEBHOOK_URL` (không service core nào consume).
- [.env.xor](../../.env.xor): scan lại — hiện không có biz key nhưng cần verify.

### 1.6 Build artifacts (xoá — sẽ tự sinh lại)
- `dist/services/vsm/`
- `dist/services/pag/`
- `dist/services/aivp/`
- `dist/services/vbx/`

### 1.7 Cross-refs trong tài liệu core (edit, không xoá file)

| File | Hành động |
|------|-----------|
| [CLAUDE.md](../../CLAUDE.md) | Xoá 3 dòng `pag/aivp/vbx` trong Services table (lines ~239-242). Update "Next available ports". |
| [README.md](../../README.md) | Xoá row `aivp` trong table; update câu "Services in development" (gỡ `pag`); xoá `aivp/` trong cây thư mục mẫu. |
| [CLAUDE_AGB.md](../../CLAUDE_AGB.md) | Update build script: gỡ `aivp pag vbx` khỏi `SERVICES="..."` (line ~269); xoá row `aivp/pag/vbx` trong tables; xoá pattern entrypoint multi-entry cho `pag, vbx`; update cây thư mục mẫu. |
| [docs/PORT-ALLOCATION.md](../PORT-ALLOCATION.md) | Gỡ entries `vsm/pag/aivp/vbx`. |
| [docs/infra/air-gap-images/README.md](../infra/air-gap-images/README.md) | Verify rồi gỡ refs `aivp/pag/vbx`. |
| [docs/cbm/file-module/PLAN.md](../cbm/file-module/PLAN.md) | Verify ngữ cảnh — chỉ remove ref nếu là dependency vào biz, không sửa nội dung khác. |

### 1.8 Changelog history (xoá file)
- [docs/change-logs/v1.8.3.md](../change-logs/v1.8.3.md)
- [docs/change-logs/v1.9.0.md](../change-logs/v1.9.0.md)
- [docs/change-logs/v1.9.1.md](../change-logs/v1.9.1.md)

> Theo quyết định: xoá hẳn các file này vì có nội dung biz. Các changelog từ `v1.10.x` trở lên giữ nguyên.

### 1.9 Không bị ảnh hưởng
- `libs/base`, `libs/shared` — không có ref biz.
- `nx.json`, `tsconfig.base.json`, `package.json` (deps), `.github/workflows/ci.yml` — không có ref biz.
- `apps/hydrabyte-e2e` — empty.
- `licenses/`, `air-gap-builder/artifacts/` — gitignored, không cần đụng.
- `k8s/`, `migrations/` — không có ref biz.
- `scripts/` — không có script biz-specific.

---

## 2. Kế hoạch thực hiện

### Phase 1 — Pre-flight
1. `git pull` để đồng bộ remote.
2. Tạo branch `chore/remove-biz-services`.
3. Verify không có uncommitted changes liên quan biz đang dở.

### Phase 2 — Xoá file/folder (reversible bằng git)
1. `rm -rf services/{vsm,pag,aivp,vbx}`
2. `rm -rf docs/{vsm,pag,lcm}`
3. `rm -f CLAUDE_VSM.md CLAUDE_PAG.md`
4. `rm -rf dist/services/{vsm,pag,aivp,vbx}` (build artifacts)
5. `rm -f docs/change-logs/v1.8.3.md docs/change-logs/v1.9.0.md docs/change-logs/v1.9.1.md`

**Verify:** `git status` cho thấy chỉ deletion, không có modification ngoài ý muốn.

### Phase 3 — Sửa ecosystem.config.js
1. Mở [ecosystem.config.js](../../ecosystem.config.js), xoá lines 1089-1264 (cả section markers).
2. Verify: `node -e "require('./ecosystem.config.js')"` parse OK.
3. Verify: `grep -c "name: '" ecosystem.config.js` = số core processes (33, hiện tại 39).

### Phase 4 — Sửa env files
1. `.env`, `.env.hbx`: xoá 2 dòng `PAG_*`.
2. `.env.xor`: re-grep `PAG|VSM|AIVP|VBX|LCM` để confirm không sót.

### Phase 5 — Update tài liệu core (cross-refs)
1. [CLAUDE.md](../../CLAUDE.md) — services table.
2. [README.md](../../README.md) — services table + tree.
3. [CLAUDE_AGB.md](../../CLAUDE_AGB.md) — build script SERVICES list, tables, tree, multi-entry pattern.
4. [docs/PORT-ALLOCATION.md](../PORT-ALLOCATION.md).
5. [docs/infra/air-gap-images/README.md](../infra/air-gap-images/README.md).
6. [docs/cbm/file-module/PLAN.md](../cbm/file-module/PLAN.md) — verify ngữ cảnh trước khi sửa.

### Phase 6 — Verification
1. **Grep clean:** `grep -rnE "vsm|aivp|vbx|/pag|\bpag\b" --include="*.{md,js,json,ts,mjs,sh}" . | grep -vE "node_modules|\.git|page|pagin"` — phải rỗng (trừ docs/cleanup-biz-services/ này).
2. **Nx still works:** `./node_modules/.bin/nx show projects` — list chỉ còn core services + libs.
3. **TypeCheck core:** `npx tsc --noEmit -p services/aiwm/tsconfig.app.json` (sample 1 service).
4. **Build sample:** `./node_modules/.bin/nx run iam:build` để verify build pipeline còn nguyên.
5. **PM2 dry-check:** `pm2 ecosystem` parse OK (không cần start).

### Phase 7 — Commit & version bump
- Theo CLAUDE.md versioning policy: đây là **breaking change** ở scope monorepo (xoá services) → bump **major** lên `v2.0.0`. Hoặc xem là cleanup nội bộ → `minor` `v1.20.0`. **Cần anh chốt.**
- Tạo `docs/change-logs/v{version}.md` ghi:
  ```
  ## Notes
  - Removed biz services (vsm, pag, aivp, vbx, lcm) — moved to separate repo
  - Removed PAG_* env keys
  - Cleaned PM2 ecosystem and infra docs
  ```
- Stage `package.json` + changelog cùng commit.

---

## 3. Risk & Rollback

- **Risk:** Service core ngầm gọi biz service qua HTTP (ví dụ aiwm → pag). **Mitigate:** đã grep `PAG_BASE_URL` không có consumer, nhưng cần grep thêm `aivp|vsm|vbx` HTTP endpoints khi vào Phase 6.
- **Risk:** ecosystem.config.js parse fail sau khi xoá block. **Mitigate:** verify bằng `node -e "require(...)"`.
- **Rollback:** mọi thay đổi đều trên branch riêng, `git reset --hard origin/main` nếu cần.

---

## 4. Câu hỏi còn mở

1. **Version bump:** `major` (v2.0.0) hay `minor` (v1.20.0)?
2. **CLAUDE.md.bak** ở root — file backup cũ, có muốn xoá luôn nhân tiện không? (Ngoài scope task, em không tự ý đụng.)
3. **`scripts/seed-vtv-agents.js`** và các seed scripts khác — có script nào seed data cho biz services không cần check kỹ trước khi xoá? (Tên file cho thấy là CBM-related, em sẽ verify ở Phase 6.)
