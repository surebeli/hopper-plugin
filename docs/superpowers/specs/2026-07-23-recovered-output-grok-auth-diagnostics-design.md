# Design: Preserve recovered vendor text and make Grok readiness diagnostic-honest

Date: 2026-07-23

Status: Approved for implementation

Scope: `hopper-plugin` only. The implementation updates the root `cli/` source and
then regenerates the shipped `plugins/hopper/cli/` mirror. It does not publish,
push, retry, reroute, or perform a live authentication smoke.

## 1. Problem statement and evidence

Two independent but interacting operator-facing problems have been observed.

### 1.1 A failed task can contain a useful parsed answer that Hopper hides

The background runner currently keeps adapter text only when
`adapterStatus === 'success'`. At `cli/bin/hopper-runner:557`, an adapter result
with `status: 'auth-fail'`, `permission-fail`, `timeout`, or `unknown-fail` has
its text replaced with an empty string before the output body and full-text
sidecar are written. Consequently, `output.md` says "vendor produced no parsed
text" even when the adapter had already reconstructed vendor text.

This is a display/data-retention defect, not proof that every failed run was a
complete review. The failure can occur after a complete terminal answer, or it
can interrupt a turn after the model has emitted only a provisional finding.
The terminal queue status therefore remains authoritative for execution outcome.

The observed incidents include:

- OpenCode reporting `adapter-protocol-invalid` after emitting review text;
- Grok reporting `adapter-permission-failed` or `auth-fail` after review text;
- a Claude RCA whose raw vendor envelope reported completion while Hopper's
  output view retained no parsed body.

Existing source and tests make the current discard explicit:

- `cli/bin/hopper-runner:546-579` parses the result, then clears all non-success
  text before calling `renderVendorOutputSection()` and `writeRunnerSidecar()`;
- `tests/integration/runner-single-spawn.test.js` currently locks in that
  failure-only discard behavior;
- `cli/src/output.js:324-335` already has a capped rendered-text path and the
  explicit `hopper-dispatch --result <id> --full` sidecar boundary. Those
  boundaries remain the right transport mechanism once a text is eligible.

### 1.2 Grok's zero-spawn readiness output overstates authentication certainty

`cli/src/vendors/grok.js:143-161` intentionally uses a soft preflight: all
paths return `ok: true`; it only checks whether the *current Hopper Node
process* has a non-empty `XAI_API_KEY` or whether one of four `~/.grok/`
credential artifacts exists. It never reads or validates secret material.

`cli/src/vendors/index.js:84-109` converts this into `authOk: true` and
`overallStatus: READY`. The resulting `hopper-dispatch --check grok` and
`--setup grok` presentation can therefore be read as `auth=verified`, although
the check can establish only local context, not working remote credentials.

This explains the apparently contradictory report "interactive Grok is logged
in, Hopper says auth-fail":

- interactive Grok and the Hopper Node parent can have different inherited
  environments; Hopper passes the Node process environment through to its child,
  not a terminal's future or separate-session environment;
- an existing `~/.grok/` credential file can be stale or otherwise unusable;
- the current broad Grok failure matcher treats `transport channel closed` and
  `worker quit with fatal` as authentication failures even when those phrases do
  not contain an authentication-specific cause;
- the outer host wrapper, `hosts/grok-cli/bin/hopper-grok`, still defaults to
  retired `grok-build`, whereas the JavaScript Grok adapter and verified static
  catalogue use `grok-4.5`.

The source facts above were corroborated by the read-only RCA artifact
`.hopper/handoffs/grok-auth-headless-precedence-rca-20260723-output.md`. Its
runtime conclusions are advisory operational evidence, not a claim that a
credential is valid in all sessions.

## 2. Goals and non-goals

### Goals

1. Preserve eligible adapter-parsed text from a failed background dispatch
   without ever changing its terminal status from `failed` to `done`.
2. Make text completeness explicit rather than inferring it merely from the
   existence of characters.
3. Preserve Hopper's existing safe-output boundary: recover only
   parser-designated vendor answer text, never arbitrary raw stdout, stderr,
   prompt contents, paths, credentials, or diagnostic exceptions.
4. Make Grok's non-spawning readiness surfaces say what they know: binary and
   non-secret credential-context presence, not verified remote authentication.
5. Classify Grok authentication evidence separately from generic
   transport/worker infrastructure failures.
6. Align the outer Grok host wrapper's default model with the confirmed
   `grok-4.5` adapter default.

### Non-goals

- No automatic retry, vendor fallback, reroute, re-dispatch, or status override.
- No attempt to read or print `XAI_API_KEY`, OAuth tokens, `~/.grok/` file
  contents, raw stderr, or resolved credential paths.
- No new default vendor subprocess. In particular, an authentication smoke is
  not part of this change.
- No claim that recovered text proves the vendor performed every requested
  investigation or that an interactive login must be repeated.
- No change to strict read-only policy, subject-root enforcement, or the
  permission contract of any vendor.

## 3. Chosen design

### 3.1 Keep execution state and recovered-output state separate

The queue/frontmatter terminal status remains one of Hopper's existing legal
states. A non-success adapter classification remains `failed`; the runner exit
code remains non-zero. The following is an additional *output evidence* record,
not a queue status and not a retry recommendation:

| Field | Allowed values | Meaning |
| --- | --- | --- |
| `recovered_output_state` | `verified-complete`, `unknown-completeness`, `no-text` | What Hopper can prove about parser-designated answer text at terminalization. |
| `recovered_output_source` | `structured-envelope`, `event-stream`, `vendor-result-field`, `none` | Closed provenance of the answer text. Never a raw path, URL, or vendor-provided diagnostic. |
| `recovered_output` | `true` or `false` | `true` only for a failed status with eligible non-empty parsed text. |

The state meanings are deliberately narrow:

| Evidence state | Required evidence | Body/sidecar behavior | Operator interpretation |
| --- | --- | --- | --- |
| `verified-complete` | Non-empty eligible parsed text and an adapter-recognized terminal answer marker, such as a structured final envelope or terminal event. | Preserve and label the text. | The answer stream ended according to that adapter's documented result shape; the task is still failed for its original reason and the text remains advisory. |
| `unknown-completeness` | Non-empty eligible parsed text, but no trustworthy terminal answer marker. This includes text followed by a tool request, permission failure, parser error, process failure, or timeout. | Preserve and label the text. | The text can be useful, but may be a mid-turn/provisional report. Do not treat it as completion. |
| `no-text` | No non-empty eligible parsed text, malformed provenance, or no completion evidence supplied by the adapter. | Do not write a text sidecar or body payload. | Retain the existing no-parsed-text presentation and the original failure diagnostic. |

For a normal successful dispatch, Hopper continues to display the parsed answer
as today. Its parser result carries `verified-complete` internally for a
uniform terminal schema, but it is not described as "recovered" and does not
change user-visible success behavior.

### 3.2 Add a conservative adapter parser contract

`parseResult()` gains an optional output-evidence subrecord alongside its
existing `text`, `status`, and diagnostic fields:

```text
outputEvidence = {
  completeness: 'verified-complete' | 'unknown-completeness' | 'no-text',
  source: 'structured-envelope' | 'event-stream' | 'vendor-result-field' | 'none'
}
```

Only an adapter may designate the text and its provenance. The runner does not
scan raw logs, scrape arbitrary JSON recursively, or promote raw stdout/stderr
to answer text. This keeps the raw log as a diagnostic artifact and prevents a
failed command, echoed prompt, path, or credential-adjacent message from being
displayed as a recovered review.

The compatibility rule is fail-closed: an adapter result without a well-formed
`outputEvidence` is treated as `no-text` for failure recovery, even if its
legacy `text` property is non-empty. Existing success handling is unchanged.
The first implementation coverage is the observed parser families:

- OpenCode: reconstructed assistant text from its recognized event stream;
- Grok: text from its recognized output JSON envelope;
- Claude: text from its recognized JSON result field.

Other adapters retain the conservative `no-text` recovery default until they
declare an equivalent source and terminal marker. This scope avoids silently
changing output policy for vendor formats that have not been audited.

### 3.3 Runner and persisted artifacts

The background runner consumes the adapter's typed evidence before it maps the
adapter status to the queue status.

1. If the adapter status is `success`, it uses the existing parsed-text path.
2. If the adapter status is non-success and evidence is
   `verified-complete` or `unknown-completeness`, it retains the eligible parsed
   text for the output renderer and full-text sidecar, but sets queue status to
   `failed` and exits non-zero.
3. If evidence is `no-text`, malformed, or its text is empty after the existing
   text safety normalization, it writes no recovered body or sidecar.
4. A prompt-delivery failure always forces `no-text`: Hopper cannot establish
   that the vendor received the requested prompt, so any coincidental process
   output remains in the raw log only.

The terminal event and output frontmatter carry the three closed fields above.
`finalizeTerminalAttestation()` owns their event-first persistence so sync and
background terminal readers see the same value. The public canonical
attestation projection adds only these closed fields; it never exposes the text
itself, raw diagnostic material, or source internals.

`output.md` uses distinct headings for a normal answer and a recovered answer:

- `## Vendor output (parsed)` remains the normal success form.
- `## Vendor output (recovered; evidence: verified-complete)` identifies a
  terminally failed run whose structured answer stream ended.
- `## Vendor output (recovered; evidence: unknown-completeness)` additionally
  states that the text may be incomplete and is advisory.
- `no-text` retains the current no-parsed-text notice.

The existing preview cap continues to apply. When the recovered text exceeds
the cap, `writeRunnerSidecar()` retains the full eligible text and only
`hopper-dispatch --result <task-id> --full` can print it. `--result` without
`--full` stays a closed projection plus an explicit full-output instruction.

`--jobs` and `--result` must preserve the legal terminal status (`failed`) while
rendering a compact factual suffix, for example:

```text
status: failed; recovered-output: unknown-completeness (advisory)
```

Neither command may show `done`, `success`, or a synthetic
`failed-with-recovered-output` status. The latter phrase may appear only as
human-readable explanatory prose, never as a queue value, terminal event
status, or process exit policy.

### 3.4 Grok readiness: detect context, not credentials

Grok's `envPreflight()` remains a zero-spawn, non-secret context check. Its
current boolean `ok` continues to mean dispatch is allowed to attempt a normal
single vendor invocation; it must not be rendered as proof of authentication.
The adapter provides an explicit closed auth-context value:

| `auth_context` | Zero-spawn evidence | Meaning |
| --- | --- | --- |
| `key-present-unverified` | The current Hopper Node process has a non-empty `XAI_API_KEY`. | A key is inherited by this launcher context; its validity, entitlement, and precedence are unverified. |
| `credential-artifact-present-unverified` | A recognized `~/.grok/` credential artifact exists. | A local artifact exists; its freshness and usability are unverified. |
| `not-detected` | Neither condition is observed. | No supported credential context was detected. Browser/keychain/interactive state may still exist, so this does not prove logout. |
| `unknown` | The check could not make a safe determination. | No authentication conclusion. |

If both a key and a recognized artifact exist, `key-present-unverified` is
reported as the launcher-visible precedence indicator; the check still does not
inspect either source. `GROK_API_KEY` remains deliberately ignored because it
belongs to a third-party binary with colliding command name and different
arguments.

`installCheckForAdapter()`, `hopper-dispatch --check grok`, and
`hopper-dispatch --setup grok` expose this separately from binary availability.
The text must never render `auth=verified` for Grok on the basis of environment
or file existence. `READY` may still mean "the binary can be invoked" but its
auth column/message must say `unverified`, `not detected`, or `unknown` as
appropriate. A soft warning must explain that the result is specific to the
Hopper Node parent environment and that a valid interactive session in another
terminal does not prove this process sees the same credentials.

The check output is limited to booleans and closed labels. It does not print the
key value, credential filename, home directory, PATH resolution, token expiry,
or raw validation errors. `--check` stays zero-spawn. `--setup` without `--deep`
also stays zero-spawn with respect to Grok auth; its existing separately
documented deep capability/model probes do not become auth probes.

### 3.5 Grok terminal-failure classification

Grok's parser first accepts a valid successful structured result exactly as it
does today. If no such result is available, it classifies an authentication
failure only on authentication-specific evidence, including a clear
unauthorized/invalid-key/login-required signal, HTTP 401/403, or
`AuthorizationRequired` in the relevant error context.

`transport channel closed`, `worker quit with fatal`, generic worker crashes,
and generic network failures no longer independently select `auth-fail`.
They use the existing closed `unknown-fail` / `adapter-unknown-failed` path
unless combined with the authentication-specific evidence above. No raw vendor
message is published in the diagnostic code, job list, result view, or
frontmatter.

This change corrects attribution, not availability: a genuine 401/403 remains
`auth-fail`; a generic infrastructure failure remains terminally failed and is
not retried automatically.

### 3.6 Align the outer Grok host default

`hosts/grok-cli/bin/hopper-grok` changes its documented and effective
`GROK_HOST_MODEL` fallback from `grok-build` to `grok-4.5`. This applies only to
the outer Grok host wrapper that asks Grok to invoke Hopper; it is distinct from
the inner `grok` vendor adapter, which already explicitly defaults to
`grok-4.5`.

An explicitly supplied `GROK_HOST_MODEL` remains untouched. No model discovery
or automatic model fallback is added.

## 4. Explicitly deferred authentication smoke

A future opt-in command may run a short Grok invocation from the exact Hopper
launch environment and report only a closed success/failure classification. It
would be useful for distinguishing context presence from usable credentials,
but it is intentionally **out of scope** for this implementation.

That future work requires its own approved design because it would introduce a
vendor subprocess, account usage, timeout and permission semantics, and a
clear distinction between a diagnostic invocation and a real task dispatch.
It must remain opt-in, must not run as part of `--check`, `--setup`, `--resolve`,
or ordinary dispatch, and must not silently retry or expose secrets.

## 5. Implementation boundaries and test strategy

The subsequent implementation plan must cover these source areas and their
vendored counterparts:

| Area | Root files | Required verification |
| --- | --- | --- |
| Output evidence and terminal persistence | `cli/src/types.js`, `cli/bin/hopper-runner`, `cli/src/output.js`, `cli/src/handoff-attestation.js` | Unit and integration fixtures for all three evidence states, event/frontmatter/public projection round-trips, preview cap, sidecar, and unchanged `failed` status/exit code. |
| Parser declarations | `cli/src/vendors/opencode.js`, `cli/src/vendors/grok.js`, `cli/src/vendors/claude.js` | Fixtures for complete structured terminal text, text followed by permission/tool/protocol failure, and no eligible text. Confirm that arbitrary raw stdout/stderr cannot be recovered. |
| Result and jobs rendering | `cli/bin/hopper-dispatch` and its result/jobs helpers | `--result`, `--result --full`, and `--jobs` preserve `failed` while showing only closed recovery evidence. |
| Grok auth context and classification | `cli/src/vendors/grok.js`, `cli/src/vendors/index.js`, `cli/src/setup.js`, `cli/bin/hopper-dispatch` | Key-present/artifact-present/none/unknown fixtures without printing secrets or paths; zero vendor spawn for `--check grok`; true auth evidence versus transport-only failure fixtures. |
| Host wrapper model default | `hosts/grok-cli/bin/hopper-grok`, relevant host validation tests/docs | `grok-4.5` is the only fallback and help text agrees; an explicit `GROK_HOST_MODEL` still wins. |

All modified root CLI files must be mirrored by the repository's existing
`scripts/sync-vendored-plugin.mjs` workflow; the mirror hash test is a release
gate. The implementation must retain the single-spawn contract, existing
read-only enforcement, and all closed diagnostic enums. It must run focused
Node tests first, then the full unit suite, the vendored-mirror check, and the
existing smoke/integration checks proportionate to the changed surfaces.

## 6. Acceptance criteria

1. A failure with eligible parser-designated text remains `failed` in the
   queue, terminal event, `--result`, `--jobs`, and process exit code, while its
   output is available with a `verified-complete` or
   `unknown-completeness` evidence label.
2. A failure with only raw/unstructured text, malformed evidence, or no text
   remains the existing `no-text` presentation; Hopper never promotes raw
   stdout/stderr into recovered content.
3. `unknown-completeness` is visibly advisory and never implies a completed
   task, even when the prose resembles a final review.
4. Successful background output and explicit `--result --full` behavior remain
   backward compatible, including preview cap and sidecar semantics.
5. Grok `--check` and `--setup` no longer report `auth=verified` from an
   environment-variable or credential-file existence check; they report only a
   non-secret, launcher-context-specific unverified state.
6. Grok's parser labels a clearly authentication-specific failure `auth-fail`,
   but does not label transport/worker text alone as auth failure.
7. The Grok host wrapper's documented and effective default is `grok-4.5`, with
   no automatic fallback or extra spawn.
8. The root and vendored CLI implementations are synchronized; all added
   regression tests and the pre-existing unit/integration/smoke/mirror checks
   pass.

## 7. Alternatives rejected

1. **Convert a recovered failure into `done`.** Rejected because terminal text
   may precede an unperformed tool call, permission denial, timeout, or prompt
   delivery failure. It would also destroy the user's ability to distinguish
   execution outcome from advisory evidence.
2. **Recover any non-empty raw log text.** Rejected because logs can contain
   prompts, error output, paths, or vendor protocol fragments. Parser-declared
   provenance is the minimal safe boundary.
3. **Use credential existence as authentication verification.** Rejected because
   existence says nothing about validity, expiry, account entitlement, or the
   environment that launched Hopper.
4. **Run an authentication smoke before every Grok dispatch.** Rejected because
   it doubles vendor calls, adds cost/latency/failure surface, and violates the
   zero-spawn diagnostic expectation. Any smoke must be an explicitly approved,
   opt-in future feature.
5. **Treat every `transport channel closed`/`worker quit with fatal` as an auth
   failure.** Rejected because those phrases also describe infrastructure faults;
   false attribution gives the operator the wrong repair action.

