# address-pr-comments

# Addressing PR Review Comments

## Quick Reference

### The Process
1. Read all comments before responding
2. Categorize and present assessment → **wait for approval**
3. Respond → Fix → Re-request review → Resolve threads

## Workflow

### 1. Categorize Feedback
| Priority | Type | Action |
|----------|------|--------|
| 🔴 Must-fix | Bugs, security, blocking issues | Fix immediately |
| 🟡 Should-fix | Style, code quality | Fix in this PR |
| 🟢 Nice-to-have | Alternative approaches | Discuss or defer |
| 💬 Needs discussion | Ambiguous points | Clarify before acting |

### 2. Present Assessment (Checkpoint)
Before making any changes, create a summary table and **wait for confirmation**:

| # | File | Comment Summary | Priority | Proposed Action |
|---|------|-----------------|----------|-----------------|
| 1 | `src/handler.ts:42` | Missing null check | 🔴 Must-fix | Add guard clause |
| 2 | `src/utils.ts:15` | Rename variable | 🟡 Should-fix | Rename `x` → `userId` |
| 3 | `src/api.ts:88` | Consider caching | 🟢 Nice-to-have | Defer to follow-up |
| 4 | `src/auth.ts:20` | Unclear requirement | 💬 Discussion | Ask for clarification |

```
🛑 CHECKPOINT: Review the assessment above.
- Confirm priorities are correct
- Adjust proposed actions if needed
- Approve before proceeding with fixes
```

### 3. Respond to Each Comment
```
✅ "Good catch, will fix"
✅ "Thanks! Updated in <commit-hash>"
✅ "I chose X because... would you prefer Y instead?"
❌ Ignoring comments without acknowledgment
❌ Resolving threads without addressing the issue
```

### 4. Make Changes
```bash
# Option A: Amend if single change
git add .
git commit --amend --no-edit
git push --force-with-lease

# Option B: New commit for traceability
git add .
git commit -m "fix: address review feedback - <description>"
git push
```

### 5. Re-request Review
After pushing changes:
- Re-request review from the same reviewers (GitHub UI or `gh pr edit`)
- Summarize what you addressed in a comment:
  ```
  Updated based on feedback:
  - Added null check for edge case
  - Renamed variable for clarity
  - Added missing test coverage
  ```

### 6. Resolve Threads
- **Author resolves**: After you've pushed the fix
- **Reviewer resolves**: Some teams prefer this—follow your team's convention
- **Never resolve** without addressing the feedback

## Common Scenarios

### Disagreeing with Feedback
```
"I considered that approach, but went with X because [reason]. 
Happy to change if you feel strongly—what do you think?"
```

### Scope Creep
```
"Great suggestion! That feels like a bigger change—mind if I 
create a follow-up issue/PR for it?"
```

### Unclear Feedback
```
"Want to make sure I understand—are you suggesting [X] or [Y]?"
```

### Stale Branch / Conflicts
```bash
git fetch origin main
git rebase origin/main
# Resolve conflicts if any
git push --force-with-lease
```

## Tips

- **Respond within 24-48 hours** — stale PRs are harder to merge
- **Don't take it personally** — feedback is about the code, not you
- **Use `--force-with-lease`** instead of `--force` — it's safer
- **Batch related fixes** — group logically related changes in one commit
- **Link commits to comments** — makes it easy for reviewers to verify fixes
- **If stuck, hop on a call** — 5 min sync beats 10 back-and-forth comments

## AI Agent Usage

When asking an AI agent to address PR comments:

```
Please address the review comments on PR #<number>
```

The agent will:
1. Fetch all open review comments
2. **Present assessment table and wait for approval** ← checkpoint
3. Propose fixes for approved items
4. Ask permission before committing changes
5. Push and summarize what was addressed

