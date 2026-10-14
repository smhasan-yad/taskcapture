# Troubleshooting

Start with the most recent file by modification time under the private state's `logs` directory, plus Windows Task Scheduler history. A run can span hibernation/resume and keep writing to the log named for its original launch date.

| Symptom/code | Meaning and next check |
| --- | --- |
| Interrupted console / 0xC000013A | Closing the visible console can stop capture. Minimize the named progress window. |
| `ticktick_timeout` | The safe operation field identifies the RPC. Verify internet and TickTick OAuth; do not retry an uncertain write blindly. |
| `extraction_authentication` | The wrapper did not verify ChatGPT subscription login. Check `codex login status`. |
| `extraction_cli_failed` | Codex exited unsuccessfully without a more specific approved classification. Inspect configuration/model availability without sharing raw prompts. |
| `extraction_result_missing` / `extraction_result_invalid` | The CLI did not produce a usable JSON result. Queue data is retained. |
| `extraction_contract_invalid` | The result did not match the per-message slot contract. No task delivery occurs. |
| `validation_source_identity` | Sources were unknown or claimed more than once, including conflicting canonical/related mappings. Strict validation preserves the queue. |
| `validation_duplicate_target` | A proposed duplicate target was not an active allowed managed task. |
| `[Review]` deadline note | The request was kept without inventing a deadline; confirm it manually. |
| Beeper history unavailable | Metadata exists but local messages are not cached. Open/sync the conversation and let discovery revisit it. |

Read-only queue check from the installed runtime: `./Run-Capture.ps1` without `-Live`.

The development tool `node tools/Check-Extraction.cjs` also defaults to read-only queue inspection. Its explicit `--model-check` mode makes one bounded subscription extraction and TickTick reads; it never delivers tasks or modifies queue records. Run it deliberately because it consumes subscription capacity. It reads private runtime configuration.

`Verify-State.ps1` checks DPAPI decryption without displaying decrypted values. `Repair-Labels.cjs` is an update-only maintenance tool with a manual acknowledgement-removal guard. Neither is a general duplicate-deletion tool.

Run `./Test-Offline.ps1` after code changes. Tests use synthetic data and fake connectors; a passing suite does not prove real-world task interpretation accuracy.
