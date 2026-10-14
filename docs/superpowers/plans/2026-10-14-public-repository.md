# Standalone public repository implementation plan

> Execution follows the user's approved migration plan in the current session; no additional agent delegation is required.

**Goal:** Relocate the complete local source into its own project directory and publish a sanitized repository that supports future commits/pushes.

**Architecture:** Keep portable source and example configuration tracked. Keep personal settings/history ignored, with deployed runtime and encrypted state outside the checkout. Do not redeploy or run live capture during migration.

**Tech stack:** Windows PowerShell 5.1, Node.js, SQLite/DPAPI, Git and GitHub.

**Spec:** The approved requirements are standalone project ownership, public-safe files, preserved automation, tested code, and a configured GitHub remote.

## Tasks

- [x] Move the existing project directory and verify every original file hash.
- [x] Retain personal history locally; separate private JSON settings from public examples.
- [x] Provide non-overwriting config initialization, offline test entry point and portable user settings.
- [x] Write public setup, architecture, troubleshooting, security and handoff documents.
- [x] Verify a clean public checkout using examples and synthetic offline tests.
- [x] Review the exact staged file manifest and scan it for secrets/private identifiers.
- [x] Create the initial clean commit and public repository, then push and verify it.
- [x] Verify the installed schedule/shortcut still target the private runtime and that the old source folder is absent.

## Review focus

Private files must not enter initial history; config initialization must not overwrite personal settings; a clean clone must run offline tests; source relocation must not change runtime actions; Git publication must use the intended authenticated account.
