# minecraft-ai-manager

## Development Workflow

For every bug fix, feature, or code change — always follow this flow in order:

1. **Register issue** — Open a GitHub issue describing the bug or task before touching any code.
2. **Fix on a branch with a PR** — Create a dedicated branch, make the fix, open a PR that references the issue (`Fixes #N`).
3. **Validate CI** — Wait for all CI check runs to complete. Every check must be green before merging.
4. **Merge PR** — Once all CI checks are green, squash-merge the PR into `main` automatically without waiting for user confirmation.
5. **Close issue** — Close the issue as completed after the merge.

Never merge without green CI. Never close an issue without a merged PR.

## CI validation rules — lessons learned

Green check marks on a PR are not enough on their own. Follow these rules before declaring CI clean:

### 1. Audit every workflow that touches the changed area
When a change affects the build system (e.g. Java version, Maven dependencies, plugin structure), open **every** workflow file that compiles plugins or runs the affected code and verify each one has the required setup steps. It is not sufficient to check that *a* build passed — all build paths must be self-contained.

### 2. Watch for GHA Maven / npm / pip cache cross-contamination
Two workflows running on the same PR can share a GHA cache (keyed by file hash). If workflow A seeds the cache and workflow B relies on it, both appear green on the PR — but after a squash-merge the cache key changes and workflow B fails on a cold cache. Before merging, confirm each workflow that compiles code installs its own dependencies without relying on another workflow's cache run order.

### 3. `continue-on-error: true` hides real failures
A step marked `continue-on-error: true` always shows a green tick even when it fails internally. When such a step is a prerequisite for a later step (e.g. pre-installing a library before `mvn`), a silent failure will cause the subsequent step to fail with a confusing cached-resolution error. Always trace the dependency chain: if step B requires step A to have succeeded, step A must **not** be `continue-on-error` unless step B has an explicit fallback.

### 4. Verify version strings exist before merging
When updating a dependency or server version (e.g. Paper, a Docker base image), confirm the version actually exists in the target registry/repository before opening a PR. For Paper: check `https://fill.papermc.io/v3/projects/paper/versions` (Fill v3 API — the old `api.papermc.io/v2` stopped receiving new builds December 31, 2025 and is fully disabled July 1, 2026). A version that doesn't exist will cause a failed download, making CI fail.

### 5. Check post-merge deploy-v2 results, not just PR checks
PR check runs only show checks for the PR head commit. The `deploy-v2` workflow runs on the **merge commit** on `main` and is not visible via `get_check_runs` on the PR. The `deploy-v2` workflow now has a `notify-failure` job that automatically opens a GitHub issue when any stage fails — watch for new issues with the `ci` label after a merge. Do NOT declare success until that issue either hasn't appeared (pipeline passed) or has been resolved.

### 6. PaperMC API migration (v2 → Fill v3)
PaperMC moved to a new download service. Always use `fill.papermc.io/v3`:
- **Endpoint:** `https://fill.papermc.io/v3/projects/paper/versions/${MC_VERSION}/builds`
- **Required header:** `User-Agent: <your-tool>/<version> (<contact-url>)`
- **Response:** array of build objects; filter `channel == "STABLE"`, use `last`, extract `.downloads."server:default".url`
- **Old endpoint** `api.papermc.io/v2` is dead for any version released after Dec 31, 2025

## Post-deploy validation

After merging any plugin fix to `main`, the `deploy-v2` workflow runs a `Validate Minecraft startup` job on the CT102 self-hosted runner. Always check its result:

1. Use `get_check_runs` on the merge commit to find the `Validate Minecraft startup` check.
2. If the check **failed** — read the `::error::` annotations. Each maps to a specific plugin log line. Open a new issue per distinct error and fix it following the normal workflow above.
3. If the check **passed** — the fix is confirmed working on the live server. Close the issue.
4. The full startup log is available as a downloadable workflow artifact (`minecraft-startup-log`) for deeper diagnosis.
