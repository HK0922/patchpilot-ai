# Portfolio material

## Title

PatchPilot AI - Supervised Software Repair Agents

## Description

AI-assisted engineering prototype that turns a software issue into a scoped patch, before-and-after regression evidence, a passing suite, and human review. Built with React, TypeScript, FastAPI, typed model contracts, SQLite, and a Docker execution path for live repairs.

## Resume bullets supported by the build

- Developed an AI-assisted issue-to-patch workflow with planner, implementer, verifier, and reviewer roles; enforced scoped edits, bounded retries, and human approval before handoff.
- Implemented a React/TypeScript dashboard and FastAPI service with persistent traces, test evidence, cancellation, and patch/PR artifacts; validated 79 backend and 23 UI tests.
- Created a reproducible scripted evaluation across four Python bug fixtures, verifying retry recovery and 28 passing final-suite tests; added a prohibited-edit probe and optional live structured-model provider.

Use wording you can personally verify and explain. The project was implemented with AI assistance. Do not replace "scripted evaluation" with "LLM benchmark" or claim productivity gains without a measured baseline.

## Portfolio story

Show the problem, role/tool design, pagination fix, invoice recovery, refused edit, evidence, and human gate. End with the held-out live evaluation planned next.

Status: working local prototype; hosted repository workspace and evidence review. Live model and Docker paths are implemented, with real calls/execution awaiting validation on a configured machine. GitHub integration is planned.

## Interview wording

"I wanted to demonstrate efficient AI use as an engineering process. I defined a bounded issue-to-patch task and used AI to accelerate implementation. Typed roles propose changes, tools verify a regression before and after the fix, and bounded retries stop for human review. The demo uses known recipes for reproducibility. Next I will evaluate held-out live issues rather than claim demo results prove general repair accuracy."
