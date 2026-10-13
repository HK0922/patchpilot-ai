# PatchPilot project instructions

Use the project-local UX/UI skill pack in `.agents/skills` for design work. Route dashboard redesigns to `dashboard-redesign/SKILL.md`, AI interaction changes to `ai-product-design/SKILL.md`, visual craft checks to `ux-ui-audit/references/visual-craft.md`, and component-wide audits to `design-system-review/SKILL.md`. Read the selected skill and applicable references before editing. The experimental `product-design` skill requires explicit invocation.

Preserve the hosted dashboard's recorded-demo disclosure. No live model execution occurs in the static site. Keep source changes, regression evidence, review gates, and export reachable. Do not invent success rates, model benchmarks, or time savings.

Frontend: `cd web && npm test && npm run build`. Backend changes: run pytest with the project's Python environment. This checkout is synced to the PatchPilot Site; preserve its existing identity and audience.

Imported skills retain their upstream MIT license. Source and pinned commit are recorded in `.agents/SKILL_SOURCES.json`.
