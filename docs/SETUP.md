# Setup

Use a normal PowerShell session under the Windows account that will run capture. The initial setup is manual; it does not register or activate a schedule automatically.

## 1. Local configuration and software

Install the requirements in the README, clone the repository, and run:

```powershell
.\Initialize-Config.ps1
.\Test-Offline.ps1
```

Edit `config/ticktick-destination.json`: set `user_name`, every relevant name spelling in `name_aliases`, the TickTick `project_id` and `project_name`, and an extraction model/reasoning effort available to your account. The model in the example is a starting value, not a guarantee of account access. Create the destination list in TickTick before configuring its ID.

In each source configuration, set permissions only for conversations you intend to process. The current discovery mode covers all connected accounts' group and direct conversations active within seven days; it is intentionally broad. Keep `groups`/`channels` empty initially: discovery fills them locally. Leave activation flags off until the connections and destination are verified.

## 2. Authentication

Sign Codex CLI into your ChatGPT account with `codex login`. The extraction wrapper requires subscription login and disables API-key fallback.

Configure the TickTick MCP server under the exact name `ticktick`:

```powershell
codex mcp add ticktick --url https://mcp.ticktick.com
codex mcp login ticktick
```

Complete OAuth in the browser. Keep the Codex configuration and credential store private. These commands were checked against the installed CLI; see the [official OpenAI MCP documentation](https://developers.openai.com/codex/mcp) for current configuration and OAuth guidance.

If the CLI is installed elsewhere, set `TASKCAPTURE_CODEX` to its absolute executable path. Ensure the Windows scheduled task can see that environment variable.

## 3. Create private state and deploy disabled

Create the empty state database from this checkout, then deploy:

```powershell
node -e "const store=require('./worker/intake-store.cjs').openStore();store.close()"
.\Deploy-Runtime.ps1
```

Deployment applies a private Windows ACL to state and updates runtime code. Local configuration is copied only when its destination file is missing; existing installed settings, discovered chats and task names are preserved byte for byte. To change an existing installation, edit its private runtime configuration deliberately. Deployment refuses to overwrite an enabled runtime. Review the local files before deploying; examples are not deployed. An absolute `TASKCAPTURE_STATE` can select a different physical state directory.

For an existing installation, keep its encrypted state, personal configuration, task name and schedule. Stop/disable capture deliberately before redeployment; do not register a second task over an existing one. Moving the source checkout does not require redeployment.

## 4. Connect Beeper

Open Beeper, connect your chat accounts and enable its local API. From the installed runtime, run:

```powershell
node .\worker\beeper-token-setup.cjs
```

Open the localhost URL shown by the helper. Create a Beeper approved connection and paste its token into that local password field. The helper verifies it and stores a DPAPI-encrypted blob; no token belongs in JSON configuration or Git.

After choosing the source scope, set the appropriate source privacy/scope confirmations in the private runtime configuration. Discovery creates the per-account encrypted identity files. Unsynced Beeper history may be unavailable and will be revisited on later discoveries.

## 5. Verify, activate and schedule

Run the read-only connector health check:

```powershell
node .\worker\Health-Check.cjs
.\Run-Capture.ps1
```

When ready for a live run, set `enabled` and `first_live_run_approved` to true in the private runtime's `config/runtime.json`, and enable the destination/source settings. A live run can create or update TickTick tasks:

```powershell
.\Run-Capture.ps1 -Live
```

Review the result before registering the schedule. From the runtime directory:

```powershell
.\Install-Schedule.ps1
.\Install-Schedule.ps1 -ApproveRegistration
```

The first command previews. The second registers daily 20:00 and 23:00 triggers, catch-up after missed starts, a 75-minute limit and overlap prevention. Registration currently requires Windows timezone `Pakistan Standard Time`; scheduling another timezone requires a deliberate code/configuration change. The task name comes from private `runtime.json` or `-TaskName`; new examples default to `TaskCapture`.

For manual runs after registration:

```powershell
Start-ScheduledTask -TaskName 'TaskCapture'
```

Use your configured task name if different. A desktop shortcut can launch that same command; it should not create another independent schedule.
