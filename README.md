**Claude Prompt:**

```
Go through my entire project and create a professional, accurate, and maintainable README.md.

Before writing the README, first inspect the repository thoroughly and ask me any clarifying questions that are necessary to avoid making incorrect assumptions.

Do NOT guess:
- setup steps
- deployment details
- environment variables
- intended architecture
- feature behavior
- future plans
- supported platforms
- production readiness
- testing status
- licensing
- roadmap items
- or anything else that cannot be confidently inferred from the codebase

If something is unclear, ask me instead of inventing an answer.

Your goal is to create a README that would be genuinely useful for:
- new contributors
- future me
- recruiters/professors reviewing the project
- someone trying to run the project locally

The README should prioritize correctness, clarity, and signal-to-noise ratio.

Please inspect:
- project structure
- backend/frontend architecture
- package managers and dependencies
- scripts and commands
- environment variable usage
- database setup and migrations
- authentication/session flow
- build pipeline
- linting/formatting/testing setup
- static asset serving

Include sections only if they are actually relevant to this project.

Potential sections to include:
- Project Overview
- Features
- Tech Stack
- Project Structure
- Local Development Setup
- Environment Variables
- Database & Migrations
- Running the Backend
- Running the Frontend
- API Overview
- Authentication
- Development Notes
- Known Limitations
- Troubleshooting

Avoid:
- generic filler
- AI-sounding prose
- marketing language
- overexplaining obvious technologies
- fake badges
- fake metrics
- fake future roadmap items
- claiming features that do not exist

Prefer concrete instructions and examples over vague explanations.

If setup commands or workflows are inconsistent, awkward, fragile, or unconventional, point that out separately before generating the final README.

After asking any necessary questions and receiving answers, generate the complete README.md in proper Markdown format.
```