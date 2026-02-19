# sync-oss

# Backporting Features from Enterprise to OSS

## Quick Reference

### Setup (One-time)
Verify you have both remotes configured:
```bash
git remote -v
# Should show:
# origin: gateway-enterprise-node
# oss: gateway (open-source repo)
```

## How to Start (For AI Agents)

When asking an AI agent to backport a PR, provide:

### Required Information
1. **Enterprise PR number** (e.g., `#697`)
2. **Desired branch name** for the OSS PR (e.g., `chore/more-audio-types-vertex`)

### Example Prompts

**Simple request:**
```
Please backport PR #697 to the OSS repository using the branch name chore/more-audio-types-vertex
```

**Detailed request:**
```
I need to backport enterprise PR #697 to the open-source gateway repository.
- Branch name: chore/more-audio-types-vertex
- This PR was already merged to enterprise main
Please create a new PR on the OSS repo with the same title and description.
```

**What the agent will do:**
1. Fetch the PR details from enterprise repo (title, description, commits)
2. Create a new branch from `oss/main`
3. Cherry-pick the commits
4. Push to OSS remote
5. Create PR on OSS repo
6. Return you to your enterprise branch

### Workflow

#### 1. Create a branch from OSS main
```bash
# If branch doesn't exist yet
git checkout -b <branch-name> oss/main

# If branch already exists locally, use -B to reset it safely
# (This will warn you if the branch has unmerged changes)
git checkout -B <branch-name> oss/main

# Or, if you want to be extra careful, check the branch status first
git checkout <branch-name>
git status  # verify it's clean and merged
git checkout -B <branch-name> oss/main
```

#### 2. Cherry-pick the commit(s)

**For single-commit PRs:**
```bash
# Find the actual commit hash (not the merge commit)
git log --oneline <merge-commit-hash>^..<merge-commit-hash>^2

# Cherry-pick the commit
git cherry-pick <commit-hash>
```

**For multi-commit PRs (squashed and merged):**
```bash
# Cherry-pick the squash merge commit from enterprise main
git cherry-pick -m 1 <merge-commit-hash>
```

The `-m 1` flag tells git to use the first parent (main branch) when cherry-picking a merge commit.

#### 3. Push to OSS repo
```bash
# Skip pre-push hooks (enterprise dependencies may differ from OSS)
git push -u oss <branch-name> --no-verify
```

#### 4. Create PR on OSS repo
```bash
# Get the original PR details
gh pr view <enterprise-pr-number> --json title,body

# Create PR on OSS repo with same title/description
gh pr create --repo Portkey-AI/gateway \
  --base main \
  --head <branch-name> \
  --title "<same-title>" \
  --body "<same-description>"
```

#### 5. Switch back to enterprise branch
```bash
# Return to your enterprise branch to continue development
git checkout <original-enterprise-branch>
```

## Common Scenarios

### Finding the merge commit hash
```bash
# From PR number
gh pr view <pr-number> --json mergeCommit -q .mergeCommit.oid

# Or from git log
git log --oneline --merges origin/main | grep "Merge pull request #<pr-number>"
```

### Handling conflicts
If cherry-picking results in conflicts:
```bash
# Resolve conflicts in your editor
# Then:
git add .
git cherry-pick --continue
```

### Verifying what you're about to cherry-pick
```bash
# For a merge commit, see what changed
git show <merge-commit-hash>

# For multi-commit PRs, see all commits in the PR
git log --oneline <base-commit>..<pr-branch-commit>
```

## Example

```bash
# 1. Create branch from OSS
git checkout -b feat/my-feature oss/main

# 2. Cherry-pick the squashed merge commit
git cherry-pick -m 1 c32d46572f688c19780b92d31d2a58c637e8c2e3

# 3. Push to OSS
git push -u oss feat/my-feature --no-verify

# 4. Create PR
gh pr create --repo Portkey-AI/gateway --base main --head feat/my-feature \
  --title "feat: My Feature" \
  --body "Description of the feature"

# 5. Return to enterprise branch
git checkout feat/my-feature  # or whichever enterprise branch you were on
```

## AI Agent Workflow (Permission Checkpoints)

When using an AI agent to perform this backport, the agent should request permission at these critical points:

### Checkpoint 1: Before Creating/Resetting Branch
```
🤖 Agent should:
- Show which branch will be created/reset
- Show the base branch (oss/main)
- If branch exists, show its current status
- Ask: "Can I proceed to create/reset this branch?"
```

### Checkpoint 2: Before Cherry-picking
```
🤖 Agent should:
- Show the commit hash(es) to be cherry-picked
- Show the commit message(s)
- Show the files that will be changed (git show --stat)
- Ask: "Can I proceed to cherry-pick this commit?"
```

### Checkpoint 3: Before Pushing to OSS
```
🤖 Agent should:
- Show the branch name
- Show the target remote (oss)
- Show the diff or summary of changes
- Ask: "Can I proceed to push this branch to the OSS repository?"
```

### Checkpoint 4: Before Creating PR
```
🤖 Agent should:
- Show the PR title and body
- Show the target repository (Portkey-AI/gateway)
- Show the base and head branches
- Ask: "Can I proceed to create this PR on the OSS repository?"
```

### After Completion
```
🤖 Agent should:
- Provide the PR URL
- Confirm whether to switch back to the enterprise branch
- Ask: "Should I switch back to your enterprise branch?"
```

## Tips

- **Always use `oss/main` as the base** when creating backport branches
- **Use `git checkout -B`** instead of deleting and recreating branches - it's safer and will preserve unmerged work
- **Use `--no-verify`** when pushing to avoid pre-push hook failures due to dependency differences
- **Use `-m 1`** for squashed merge commits (this is the most common case)
- **Copy the PR title and description** from the enterprise PR to maintain consistency
- **Verify branch status** before resetting: use `git status` and `git log` to ensure branches are properly merged
- If unsure whether it's a merge or regular commit, check: `git cat-file -p <commit-hash>` (merge commits have 2+ parent lines)

