# Security and data handling

Only portable source, synthetic tests, example configuration and public documentation belong in Git. Private configuration, historical notes, DPAPI blobs, chat bodies/drafts, SQLite state, logs, API keys and OAuth stores must remain local and ignored.

Authorized candidate messages and limited context are sent to the configured AI provider using the signed-in subscription. Beeper and TickTick connections are private integrations; publishing this source does not publish any conversations. Configure scope deliberately for your own accounts and data.

State defaults to a fixed physical directory under the Windows user profile, rather than packaged-app LocalAppData redirection. DPAPI encryption is bound to that Windows account. Deployment restricts the state directory ACL. Temporary plaintext extraction files are removed after use; abandoned generated temporary directories are cleaned by the runner.

Logs contain only approved phase/request names, numeric counters and error codes. Do not paste tokens, message bodies, raw model output or private runtime configuration into GitHub issues. Rotate a credential if it is ever exposed; deleting a file from a later commit does not erase Git history.

Treat messages as untrusted input. The extraction CLI runs with tools disabled, an ephemeral session and API-key fallback removed. Strict local validation and durable write reservations are required even when the model schema is constrained. The system creates review tasks for uncertain ownership/deadlines; it is not an error-free autonomous decision maker.

Report a suspected credential exposure through GitHub's private reporting facilities when available. Public issues should contain sanitized reproduction steps and synthetic fixtures only.
