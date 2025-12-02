---
description: Generate user-focused release notes between two versions
args:
  - name: fromVersion
    description: Starting version tag (e.g., v0.2.0)
    required: true
  - name: toVersion
    description: Ending version tag or HEAD (e.g., v0.3.0 or HEAD)
    required: true
---

Generate release notes for iloom CLI from {{fromVersion}} to {{toVersion}}.

## Context Requirements

1. Read README.md to understand:
   - iloom's core value proposition (maintaining shared understanding between human and AI)
   - What features are central to this mission vs peripheral
   - Product terminology and concepts

2. Determine the git reference to use:
   ```bash
   # Check if toVersion exists as a git reference
   git rev-parse --verify {{toVersion}} 2>/dev/null
   ```
   - If the command succeeds, use {{toVersion}} for the git log
   - If the command fails (toVersion doesn't exist), use HEAD for the git log
   - **Important**: Always label the release notes as {{fromVersion}} → {{toVersion}} regardless of which git ref is used

3. Get detailed commit history:
   ```bash
   # Use {{toVersion}} if it exists, otherwise use HEAD
   git log {{fromVersion}}..<git-ref> --format="format:%h %s%n%b%n" --reverse
   ```

## Release Notes Guidelines

### What to Include

**Focus on User Benefits**
- Describe what users can now do, not how it works internally
- Lead with impact and value, not implementation details
- Example: ❌ "Add optional `[prompt]` argument to init command"
- Example: ✅ "Quickly tell `il init` what changes you want"

**Recognize Core vs Peripheral Features**
- Analysis/planning improvements are CORE PRODUCT FEATURES, not documentation
- These directly deliver on iloom's promise of maintaining shared understanding
- Position major improvements to analysis capabilities at the top of the release notes

**Terminology Corrections**
- `il init` / `il config` is a configuration wizard, not about "initial prompts"
- "Analysis templates" are the intelligence behind the AI agents
- Child looms, not nested looms (though "nested" can be used descriptively)

### What to Exclude

**Internal/Developer-Facing Items**
- ❌ Unit test improvements
- ❌ Mock factory changes
- ❌ Refactoring for code clarity
- ❌ Debug logging additions
- ❌ Performance optimizations that don't impact user experience
- ❌ Build process changes
- ❌ Dynamic import removal
- ❌ Test mocking improvements

**Technology Details Users Don't Need**
- ❌ "Add JSDoc comments"
- ❌ "Mock executeGitCommand in tests"
- ❌ "Remove unused execSync import"
- ❌ References to MCP tools in feature descriptions

### Structure

```markdown
## Release Notes ({{fromVersion}} → {{toVersion}})

### 🎉 New Features

**[Most Important Feature First - Usually Analysis/Core Capability Improvements]**
- Bullet points focusing on user impact
- What this enables users to do
- Why it matters for the core mission

**[Second Most Important Feature]**
- ...

### 🐛 Bug Fixes

**[Fix Name]**
- What was broken
- What now works correctly

### 📚 Documentation

**[Documentation Updates]**
- Only user-facing documentation
- README updates, guides, etc.

---

**Full Changelog**: {{fromVersion}}...{{toVersion}}
```

## Prioritization

When ordering features, ask yourself:
1. **Does this improve human-AI alignment?** (Core mission - top priority)
2. **Does this reduce cognitive overhead?** (Core value prop - high priority)
3. **Does this enable new workflows?** (Major feature - high priority)
4. **Does this fix broken functionality?** (Bug fixes - medium priority)
5. **Does this improve convenience?** (Quality of life - medium priority)

Analysis framework improvements, planning enhancements, and context management features should typically be positioned first, as they directly deliver on iloom's core promise.

## Final Check

Before finalizing, verify:
- [ ] No mentions of tests, mocking, or internal improvements
- [ ] Features described by user benefit, not implementation
- [ ] Most impactful features (especially analysis improvements) listed first
- [ ] Terminology is correct (config wizard, not initial prompts)
- [ ] No MCP tools mentioned
- [ ] All issue numbers referenced with (#XXX) format
