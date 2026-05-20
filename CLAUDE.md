# minecraft-ai-manager

## Development Workflow

For every bug fix, feature, or code change — always follow this flow in order:

1. **Register issue** — Open a GitHub issue describing the bug or task before touching any code.
2. **Fix on a branch with a PR** — Create a dedicated branch, make the fix, open a PR that references the issue (`Fixes #N`).
3. **Validate CI** — Wait for all CI check runs to complete. Every check must be green before merging.
4. **Merge PR** — Squash-merge the PR into `main`.
5. **Close issue** — Close the issue as completed after the merge.

Never merge without green CI. Never close an issue without a merged PR.
