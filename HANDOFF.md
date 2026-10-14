# Developer handoff

The source is organized as a standalone repository. Operational configuration and local historical notes are ignored; see `private/` only on an authorized local installation. A clone contains no credentials, destination IDs or captured chat history.

Start with `Initialize-Config.ps1`, then `Test-Offline.ps1`. Core interfaces are in `worker/intake-store.cjs`, `worker/extraction-contract.cjs`, `worker/task-validation.cjs`, `worker/deliver-task.cjs` and `worker/ticktick-client.cjs`. Setup and architecture are documented under `docs/`.

Preserve these invariants:

- A default dry run does not collect chats, decrypt bodies, call a model/connector or change queue state.
- Model output has one nullable canonical slot per target; IDs are restored locally and strictly checked before delivery.
- Unknown/repeated source ownership and unknown duplicate targets fail closed. Never replace durable source matching with title-only matching.
- Malformed deadline strings become undated review items; never invent a time or quietly drop a request.
- Uncertain remote writes must be reconciled before retrying; missing active tasks do not justify recreation.
- Maintenance label updates are update-only and checked by readback. Do not add automatic deletion/completion.
- Keep source permissions, activation and scheduling explicit. Do not overwrite an enabled runtime.
- All new tests must be offline by default. Source audits must not receive private configuration, chats or credentials.

The experimental Codex app-server bridge and model interpretation remain compatibility/accuracy risks. Current tests cover deterministic behavior, protocol failures, Unicode, identity isolation, pagination, deadlines, slot conversion, delivery recovery and safe logging. Model benchmarks are a separate activity.

Future work is committed and pushed from this repository. Deployment remains a deliberate separate operation against an authorized private installation.
