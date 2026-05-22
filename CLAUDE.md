# minecraft-ai-manager

## Development Workflow

For every bug fix, feature, or code change — always follow this flow in order:

1. **Register issue** — Open a GitHub issue describing the bug or task before touching any code.
2. **Fix on a branch with a PR** — Create a dedicated branch, make the fix, open a PR that references the issue (`Fixes #N`).
3. **Validate CI** — Wait for all CI check runs to complete. Every check must be green before merging.
4. **Merge PR** — Once all CI checks are green, squash-merge the PR into `main` automatically without waiting for user confirmation.
5. **Close issue** — Close the issue as completed after the merge.

Never merge without green CI. Never close an issue without a merged PR.

## Post-deploy validation

After merging any plugin fix to `main`, the `deploy-v2` workflow runs a `Validate Minecraft startup` job on the CT102 self-hosted runner. Always check its result:

1. Use `get_check_runs` on the merge commit to find the `Validate Minecraft startup` check.
2. If the check **failed** — read the `::error::` annotations. Each maps to a specific plugin log line. Open a new issue per distinct error and fix it following the normal workflow above.
3. If the check **passed** — the fix is confirmed working on the live server. Close the issue.
4. The full startup log is available as a downloadable workflow artifact (`minecraft-startup-log`) for deeper diagnosis.
