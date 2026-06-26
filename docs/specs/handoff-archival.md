# Handoff archival — when & how

A short, opinionated process for keeping `.hopper/handoffs/` lean over a project's lifetime
without losing any result. Implemented by `hopper-dispatch --archive` (`cli/src/archive.js`).

## Why archive

Every dispatch writes a **5-file artifact set** into `.hopper/handoffs/`:
`<id>-output.md` (status frontmatter + body), `-output.log` (raw stdout/stderr),
`-output-raw.txt` (full vendor answer), `-progress.log` (JSONL lifecycle), and `-prompt.md`
(the composed prompt). Across a long project this grows to hundreds of files and many MB. That
causes two concrete problems:

1. **Noise.** The Claude Code completion monitor (`--watch-events`), the reaper, and `--jobs`
   all scan `handoffs/`. A large terminal backlog is clutter (and historically the monitor
   replayed it as startup spam — now baselined, see `hosts/claude-code/README.md`).
2. **Bloat.** Slow `ls`/greps, a heavier working tree, and a harder time finding the one task
   you care about.

Archival **moves finished task artifacts** to `.hopper/archive/<date>/` — handoffs/ stays small,
every result stays on disk, and results stay retrievable.

## When — the policy

hopper has **no reaction core; nothing auto-archives.** Archival is an explicit action you run
(by hand, or from your own cron / git hook). Recommended triggers, in priority order:

- **Periodic hygiene (the default you want):** `hopper-dispatch --archive --older-than 7`, run
  weekly or per sprint. Archives tasks that finished more than 7 days ago and keeps the last
  week's context live for quick `--result` / `--watch`.
- **Keep-recent:** `hopper-dispatch --archive --keep 20` always retains the 20
  most-recently-finished tasks in handoffs/ and archives the rest — good when you reference
  recent results often regardless of age.
- **Before committing / sharing the repo:** archive so the working tree isn't carrying a large
  handoffs/ backlog.
- **After consuming a batch:** once you've read the results you needed.
- **Triage split:** `--archive --only-status done` archives the successes and leaves
  `failed` / `timeout` / `orphaned` in handoffs/ for review; archive those once you've triaged.

**Safety invariant (so `--archive` is safe to run at ANY time, even mid-dispatch):** it never
touches a task that is `pending`, `in-progress`, or whose runner PID is still alive. Only
**terminal** tasks (`done` / `failed` / `timeout` / `cancelled` / `orphaned`) with a dead or
absent runner are eligible.

## How — the mechanism

```
hopper-dispatch --archive [--older-than <days>] [--keep <N>] [--only-status <s,..>] [--dry-run]
```

- Moves each eligible task's full artifact set into `.hopper/archive/<YYYY-MM-DD>/` (the
  archival-run date — a batch archived together lands in one dated folder).
- **Selection is by exact artifact suffix**, so it never touches shared files
  (`leader-tasklist.md`, `*_vlreq-msg.txt`, …) and id-prefix collisions are impossible
  (`T-1` is never confused with `T-10`).
- **`queue.md` is left untouched** — it's the historical ledger; only the bulky per-dispatch
  artifacts move.
- **`--result <id>` falls back to the archive automatically**, so an archived task's verdict,
  body, log tail, and `--full` output stay retrievable with no extra flags.
- **`--dry-run`** prints the plan (counts, per-task list, skip reasons) and moves nothing.
- The archive is just files — **prune it with plain shell**: `rm -rf .hopper/archive/2026-05-*`
  or move old dated folders to cold storage. hopper never deletes archived data itself.

## Recommended flow

```bash
hopper-dispatch --archive --older-than 7 --dry-run   # preview
hopper-dispatch --archive --older-than 7             # do it
# optional: schedule weekly via your OS scheduler, or a git pre-push hook, e.g.
#   hopper-dispatch --archive --older-than 14 >/dev/null 2>&1 || true
```

Archival is orthogonal to the `--watch-events` baseline fix: baselining stops the monitor from
*replaying* the backlog each session; archival *removes* the backlog from handoffs/ entirely.
Together they keep a busy hopper project quiet and tidy.
