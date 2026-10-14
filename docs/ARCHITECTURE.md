# Architecture

The source checkout, installed runtime and encrypted private state have different purposes. Editing or moving the checkout does not alter a running installation. `Deploy-Runtime.ps1` is an explicit deployment step and refuses an enabled runtime.

`Run-Capture.ps1` obtains an exclusive runner lock, cleans abandoned temporary files, verifies TickTick/model health, discovers recent Slack and WhatsApp conversations separately, collects each available source, and processes saved work. A source failure does not discard its checkpoint or prevent processing other saved sources. Each child step has a ten-minute limit. Safe logs record phase timings, counters and approved error codes; raw stderr is discarded.

`Resolve-Recent.cjs` uses cached message timestamps when conversation activity metadata is missing. It isolates identities per connected account. `Collect-Beeper.cjs` derives durable hashes from account/chat/message identity, preserves semantic revisions and commits encrypted bodies/checkpoints transactionally to SQLite. Completed bodies are pruned after seven days; unfinished work stays retryable.

Candidate selection is local. It uses configured aliases and ownership signals, includes bounded nearby/reply context, and defers excess candidates rather than silently dropping them. Extraction runs only for selected targets, up to 40 per pass and a bounded text budget.

The extraction contract maps durable IDs to short aliases. Its generated schema has one required nullable slot per target. Context aliases cannot become canonical task slots. The model chooses task details; Node restores original IDs and validates fields, deadlines, duplicate targets and unique source ownership. Malformed deadline strings are removed and explicitly flagged for review; other invalid shapes or identity conflicts fail closed.

Delivery reserves each source before a write, verifies readback, binds related sources and retains uncertain drafts for reconciliation. Absence from active TickTick tasks is not proof that an uncertain creation failed: it may have been completed, moved or deleted. That branch never blindly creates again.

Manually deleting a task does not replay its original processed message. A new message requesting the same action can create another task because there is no permanent semantic ignore list. Repeated requests can merge into an active managed task; semantic matching still depends on model accuracy.

The TickTick client uses Codex app-server RPC to call the configured official MCP tools without starting a model turn. The extraction model is called separately through subscription-authenticated `codex exec`. The optional Claude auditor is a source-only development tool and is not a runtime dependency.
