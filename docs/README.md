# Docs

| Document | What it is |
| --- | --- |
| [scope/](scope/README.md) | The scope document for each subsystem, for the Group Demo (printable PDFs in `scope/pdf/`) |
| [handover/](handover/README.md) | What changed for each slice when the six branches were merged into `integration`, one page per person |
| [next-steps-content-builder.md](next-steps-content-builder.md) | What is left in the content builder slice: Sprint 2 tickets, debt and stale documents |
| [test-plan.md](test-plan.md) | Test plan for the moderation queue and review detail (LIN-38, LIN-39) |
| [gui-tests/content-builder.md](gui-tests/content-builder.md) | GUI test walkthrough for the content builder, with screenshots |
| [td-cyclomatic-complexity.md](td-cyclomatic-complexity.md) | Cyclomatic complexity of the content builder's four largest classes |
| [ci.md](ci.md) | Continuous integration: what runs, the checkpoint for switching it on, and a local replica |

Slice-level detail that belongs with the code lives next to it: the API is
documented in `backend/openapi.yaml` and served at `/api/docs`, and the table
ranges each slice owns are in `backend/migrations/README.md`.
