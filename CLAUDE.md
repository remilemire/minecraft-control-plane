**Claude prompt:**

```
Go through my entire project and create a high-quality CLAUDE.md file for future Claude Code sessions.

Before writing the file, first inspect the project structure and then ask me any clarifying questions you genuinely need answered. Only ask questions if the answer would materially change the CLAUDE.md. Do not ask obvious or low-value questions.

Your goal is not to summarize everything. Your goal is to create a concise but thorough project guide that makes future Claude sessions faster, safer, and more accurate.

Please include only details that are actually useful for working on this project, such as:

- project purpose and architecture
- backend/frontend structure
- important commands for setup, development, testing, linting, building, migrations, and deployment
- environment variables and what they are used for
- database/migration setup
- authentication/session/CSRF behavior
- API conventions
- frontend conventions
- naming/style conventions
- important gotchas, deployment quirks, or non-obvious decisions
- files or modules Claude should inspect before making related changes
- rules Claude should follow when editing this project

Be selective. Do not include generic advice, obvious explanations, or filler. Do not document every file unless it matters. Prefer concrete project-specific guidance over broad summaries.

Also identify and include any project-specific constraints, such as:
- where commits/flushes should happen
- how services/routes/schemas are supposed to interact
- how user-owned resources should be authorized
- how frontend build output is served
- anything unusual about SQLite, Alembic, static files, cookies, or environment setup

Treat CLAUDE.md as a living project document.

When you discover important project-specific conventions, architecture decisions, deployment quirks, recurring patterns, or non-obvious constraints during future work sessions, update CLAUDE.md accordingly.

Only add information that is:
- stable
- reusable
- likely to help future sessions
- specific to this project

Do not add temporary debugging notes, one-off tasks, generic programming advice, or obvious observations.

Prefer concise additions over long explanations. Keep the file high signal-to-noise.

After asking any necessary questions and receiving my answers, create the CLAUDE.md content.

Format the final result as a complete Markdown file titled `CLAUDE.md`.

Tone: direct, technical, concise, and opinionated where useful.
```