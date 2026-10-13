# PatchPilot visual design

The October 13 revision treats PatchPilot as a repair and review workspace. Its primary user is a developer supervising a bounded code repair. This is an implementation-led redesign; no user research or measured usability improvement is claimed.

## Decision architecture

| Decision | Evidence | Comparison | Action |
| --- | --- | --- | --- |
| Which run should I inspect? | Case identity, status, attempt count | Other recorded or local runs | Select or filter history |
| Does the patch address the issue? | Unified source diff and plan | Original source versus candidate | Inspect changed files |
| Does the evidence support a repair? | Executed tests and regression gate | Original failure versus patched suite | Open Tests and Review |
| What happened during an attempt? | Ordered agent events | Earlier attempts and failure feedback | Replay or inspect Activity |
| Can I use the result? | Review checklist, reviewer concerns, patch export | Acceptance criteria and repository context | Review, download, or reject locally |

## Visual direction

- Warm paper surfaces and a charcoal selected-run summary establish a clear reading order.
- A serif page title, sans-serif interface text, and monospace code distinguish the main type roles.
- Orange marks primary actions and selected evidence tabs. Green and amber remain status signals reinforced by text and icons.
- Run history uses compact rows. Execution settings use native expandable details instead of occupying the full setup panel.
- The diff remains a horizontally scrollable code artifact; surrounding content wraps. Compact navigation and a single-column evidence layout are proposed for smaller screens.
- All four pages share semantic CSS variables and a consistent border and spacing treatment. No remote font or decorative image dependency is needed.

## Imported skills

The seven skills from `aditya-ariosity/ux-ui-skills` release 2.1.1 are saved under `.agents/skills`, with upstream MIT licenses. The pinned commit and source are in `.agents/SKILL_SOURCES.json`. `AGENTS.md` routes future design work to the applicable skill. This is a project installation, not an account-wide ChatGPT plugin registration.

This revision used the dashboard-redesign workflow and its decision, representation, interaction, and QA references, plus the visual-craft reference from ux-ui-audit. The other imported skills remain available for subsequent scoped tasks.

## Acceptance and validation

The replay disclosure must remain visible. Selecting or filtering history must preserve selected evidence. Tests, activity, plan, and review must stay reachable, and replay must never POST a live run. The regression test suite covers these existing behaviors.

Validation: all nine frontend cases reported passing assertions (six dashboard interactions and three evidence utilities), but Vitest did not exit cleanly in this restricted session. A bounded rerun also hung after reporting successful cases. TypeScript and the production build exit successfully. The seven skill directories pass the skill-creator validator plus license and referenced-file checks. Measured contrast for body text, metadata, primary buttons, dark run metadata, and source additions/deletions exceeds 4.5:1.

Interactive browser QA is unavailable in this environment. Breakpoint behavior, focus visibility in a rendered browser, zoom/reflow, and assistive-technology behavior need visual/manual verification. The contrast checks and DOM tests do not establish full WCAG conformance.

The hosted app continues to replay completed scripted fixture runs; it is not evidence of live model performance. Backend execution behavior was not changed by this redesign.
