# Is iloom Right for You?

iloom was built to solve a specific problem: AI helps us write code faster, but it makes keeping track of _why_ we wrote it much harder.

Whether you are a solo developer or an enterprise architect, iloom shifts the AI's role from a "code generator" to a persistent collaborator. Here is how it impacts your workflow at different scales.

## 1. The Solo Developer & Indie Hacker

**The Goal:** Act like a team of five without losing your mind.

You wear every hat: Product Manager, CTO, Frontend Dev, and DevOps. Your biggest enemy isn't writing code—it's cognitive load. When you switch from fixing a database bug to designing a UI component, the "context switch" is expensive.

### How iloom helps you:

**"Context Window" Tetris is Over:** You don't need to keep the entire architecture in your head or constantly re-paste context into a chat window. iloom stores the AI's understanding in the issue itself. You can pick up a task you paused two weeks ago, and the AI (and you) will know exactly where you left off.

**Parallel Multitasking:** You're working on a big feature (Issue #25), but a critical bug (Issue #99) comes in.

- **Without iloom:** `git stash`, change branches, `npm install`, restart server, fix bug, switch back, hope nothing broke.
- **With iloom:** Run `il start 99`. It spins up a fresh directory and a server on a new port (e.g., 3099). You fix the bug while your feature server (3025) keeps running. No stashing, no friction.

**The "Future You" Benefit:** When you return to code you wrote six months ago, you won't just see the _what_ (the code); you'll see the _why_ (the structured AI analysis and planning comments in the issue).

---

## 2. The Startup & Scale-up Team

**The Goal:** Move fast without breaking things (or communication).

You have a team of 3-20 engineers. Velocity is everything, but "AI-generated spaghetti code" is a real risk. You need to ensure that when an AI writes code, it adheres to the team's mental model, not just syntax rules.

### How iloom helps your team:

**Alignment Before Implementation:** Before a single line of code is written, iloom's agents (Enhancer, Evaluator, Planner) post a structured plan to the GitHub/Linear issue. The team can review the plan asynchronously. This catches "hallucinations" and architectural mistakes early, saving days of rework.

**Zero-Friction Context Sharing:** When a teammate asks, "What is the status of the auth refactor?", you don't need a meeting. They can check the issue comments to see exactly what the AI analyzed and what the plan is. The context is public infrastructure, not locked in a private chat log.

**Onboarding Accelerator:** New engineers can run `il start <issue-id>` and immediately have a running environment with the full context loaded. They don't need to spend 3 days setting up local databases or figuring out branch naming conventions—iloom standardizes the "start" of every task.

---

## 3. The Enterprise & Large Org

**The Goal:** Innovation with guardrails.
**The Reality:** Early stage, but architected for your scale.

We know we aren't fully enterprise-ready yet. We don't have SSO, RBAC, or JIRA integration today. But we are building iloom specifically because current AI tools (chatbots) often lack the visibility and control large organizations require.

### Why you should watch this space:

**Solving "Shadow AI":** Instead of developers using unapproved prompts and tools in secret, iloom offers a standardized control plane. We are building the infrastructure that lets you define which models and agents your team uses.

**Metrics for Optimization:** iloom will monitor and report on token efficiency and success rates. This allows you to A/B test changes to prompts and AI tooling configurations, turning "prompt engineering" from guesswork into a measurable engineering discipline.

**Auditability is Native:** In an enterprise, "Why did we make this change?" is a compliance question. iloom forces the AI to document its reasoning in the issue tracker, creating a permanent audit trail that chat windows can't provide.

**Environment Isolation (Sandbox Safety):** Enterprise dev environments are fragile. iloom's use of Git Worktrees and isolated database branches (via Neon) ensures that one developer's AI experiment cannot corrupt the schema or state for other developers. It safeguards the "Main" environment.

**Verdict:** We might be too early for your main production pipeline, but our architecture aligns with your compliance and security needs. We'd love your feedback as we get there.
