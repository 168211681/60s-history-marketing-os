# Redacted backup/rehearsal evidence template

Use PREPARED / BLOCKED / FAIL until the separately authorized real recovery gates
have completed. A successful synthetic fixture is not a Production backup PASS.
Never include connection URIs, passwords, raw rows/dumps, tokens, personal paths,
full archive lists/catalog definitions, or screenshots of secrets.

| Item | Redacted evidence |
|---|---|
| Phase / status | Phase A / PREPARED; real backup and restore BLOCKED |
| UTC time / code commit | `<time>` / `<tooling SHA>` |
| Actual main / PR #41 head | `<SHA>` / `<SHA>`; unmerged confirmed `<time>` |
| Operator authorization | `<approval reference, not credentials>` |
| Trusted host / encryption / off-host destination | `<approved inventory IDs, no personal paths>` or **BLOCKED** |
| Independent project identity | `<official Connect-screen review reference; no URI>` |
| PostgreSQL server/client versions | `<versions>` |
| Approved partial scope | public/private/supabase_migrations; excluded managed components listed |
| Snapshot / source counts | `<approved aggregate counts only; recorded consistently with dump>` |
| Dump exit / nonzero bytes / TOC / internal hashes | `<success/failure>`; internal files remain private |
| Retained encrypted artifact | `<ciphertext bytes, SHA-256, non-sensitive inventory ID>` or **UNVERIFIED** |
| Independent key/decryption/off-host verification | `<operator reference>` or **UNVERIFIED** |
| Restore target identity / isolation | `<approved disposable inventory ID; loopback/socket verified>` |
| Actual completed restore | `<exit, diagnostics reviewed, counts/catalog/RLS comparisons>` or **NOT RUN** |
| Critical-record/security checks | `<redacted aggregate assertions>` or **NOT RUN** |
| Auth/roles/extensions/Vault/external files | `<explicit supported scope and unverified/excluded limits>` |
| Cleanup decision | `<owner approval reference; retained copy remains recoverable>` |
| Migration history | Intentional divergence preserved; no apply/repair/reset/replay |
| Release decision | No merge/deploy; final owner gates remain separate |
