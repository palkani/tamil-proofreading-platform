## Task: PR Self-Review and Auto-Fix (required for every PR)

Before creating a pull request, and again right after it is opened, run this review loop. Never skip it.

### 1. Gather the changes
- Run `git fetch origin` and `git diff origin/main...HEAD` (use this repo's default branch).
- Read each changed file in full context, not just the diff hunks.

### 2. Review checklist
Check every change for:
- **Correctness:** logic bugs, off-by-one errors, null/undefined handling, unhandled errors or promises, race conditions, broken edge cases.
- **Security:** SQL/command injection, XSS, hardcoded secrets or API keys, missing auth/permission checks, unvalidated user input.
- **Performance:** N+1 queries, unnecessary loops or re-renders, missing indexes, oversized payloads.
- **Code quality:** dead code, leftover console.log/print/debug statements, stray TODOs, duplicated logic, unclear names.
- **Consistency:** follows existing patterns, folder structure, and conventions in this repo.
- **Tests:** new or changed behavior has tests; no existing tests were deleted or weakened to make them pass.

### 3. Verify
Run all of these and treat any failure as an issue:
- Lint: `<lint command>`
- Type check: `<typecheck command>`
- Tests: `<test command>`
- Build: `<build command>`

### 4. Fix automatically
- Fix every issue found in steps 2 and 3.
- Commit fixes separately with the message `fix: address PR self-review findings`.
- Re-run step 3 after fixing. Repeat until clean, up to 3 rounds.
- **Do not auto-fix, flag instead:** changes to public APIs, database migrations, auth/security behavior, or anything that needs a product decision.

### 5. After the PR is created
- Run `gh pr checks` to watch CI. If a check fails, read the logs, fix the cause, push, and re-check.
- Never force-push over someone else's commits or merge the PR yourself.

### 6. Report
End with a short summary:
- Issues found
- What was fixed (with commit hashes)
- Anything left for a human to review, and why