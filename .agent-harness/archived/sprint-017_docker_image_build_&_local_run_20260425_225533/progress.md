# Progress Log - Docker Image Build & Local Run

Archived: 2026-04-25 22:55:33

---

## Sessions

<!-- New sessions should be added above this line -->

## 996 Orchestration - 2026-04-25
**Agent**: 996 Orchestrator
**Sprint**: sprint-017
**Max Parallelism**: 1 (sequential — feat-002 depends on feat-001)

### Execution Summary
| Feature | Status | Result |
|---------|--------|--------|
| s17-feat-001 | completed | Fixed .dockerignore exclusion patterns |
| s17-feat-002 | completed | Docker image built and gateway running on localhost:3000 |

### Statistics
- Total features: 2
- Completed: 2
- Blocked: 0
- Success rate: 100%

### Batch Execution
**Batch 1**: s17-feat-001 — fix .dockerignore
**Batch 2**: s17-feat-002 — build & run (depends on 001)

### Issues Found & Fixed During Build
1. **.dockerignore `pnpm-workspace.yaml`** — excluded file needed by Dockerfile COPY; removed the exclusion
2. **.dockerignore `tsconfig.json` recursive** — `tsconfig.json` pattern matches at all levels, excluding `apps/*/tsconfig.json`; scoped to `/tsconfig.json`
3. **.dockerignore `node_modules` non-recursive** — only matched root-level; changed to `**/node_modules` to prevent host node_modules leaking into build context
4. **pnpm `shamefully-hoist` doesn't hoist bins to workspace packages** — `tsc` not found in `apps/*/node_modules/.bin/`; fixed by using `node-linker=hoisted` in Dockerfile builder stage
5. **Docker Hub network** — configured registry mirror in `~/.docker/daemon.json`

### Files Changed
- `.dockerignore` — removed pnpm-workspace.yaml, scoped tsconfig.json/vitest.config.ts to root, recursive node_modules
- `Dockerfile` — added `echo "node-linker=hoisted" > .npmrc` before pnpm install in builder stage

### Verification
- `docker compose build` — PASS (multi-stage build completes)
- `docker compose up -d` — container starts
- `curl http://localhost:3000/health` — `{"status":"ok","providers":1}`
- `curl http://localhost:3000/admin/` — admin SPA HTML returned
