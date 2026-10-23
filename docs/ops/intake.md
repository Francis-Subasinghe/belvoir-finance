# Feed intake (F5)

Intake reads the registry in `content/sources/`, fetches the `feedUrl` of each `active` Source whose `rights` is not `none`, and writes a review queue. **Nothing is published automatically.** SourceItems are never shown on the site; a person reviews them in a pull request, and only a published Story with Belvoir's explanation can use one.

The ten seed Sources are `paused` and await Francis (pre-launch list, Q-1 and Q-2), so a live run fetches nothing until he activates them.

## Run on fixtures locally

Needs Node 24. No network is used.

```sh
npm run intake -- --fixtures tests/fixtures/f5 --out "$(mktemp -d)/intake"
```

`--out` must be a new or empty folder. It receives:

- `content/source-items/<sourceId>-<12 hex>.json`: new queue items (existing ones are never overwritten),
- `content/sources/<id>.yaml`: Sources whose `lastError`, `lastErrorAt` or `consecutiveFailures` changed,
- `summary.txt`: one `run …` line, then `[failures]`, `[dropped]` and `[items]` sections. It holds ids, codes, counts and hosts only, never titles or URLs.

## Open a review PR from a workflow artifact (F5-51)

The intake workflow job is read-only (`contents: read`, no secrets) and only uploads an artifact (ADR-0001 req 6, Q-4). To turn it into a review PR:

1. Download the artifact zip from the workflow run.
2. On an up-to-date `main`, create the branch `intake/review-<YYYY-MM-DD>`.
3. Run the committed import script, `npm run intake:import -- <path-to-zip>`. It unpacks the zip into a temporary folder outside the repo, checks every entry against the artifact path patterns and `ARTIFACT_LIMITS`, and validates every file against `sourceItemSchema` and `sourceSchema` before copying anything into `content/`. Nothing from the artifact is executed or installed.
4. Read `summary.txt`, check each item's title, link and rights, and delete any you don't want.
5. Commit and open a PR titled `Intake review <YYYY-MM-DD>`. It runs the same CI as any PR.

## Import an artifact: commands (F5-51)

This section adds the exact commands to the steps above. Use the same branch pattern and PR title.

1. Find the artifact. In the `Intake` workflow run, the only artifact is `intake-queue`, kept for 7 days. Note its numeric id from the run page, or download the zip from that page.
2. On an up-to-date `main`, create the branch:

   ```sh
   git switch -c intake/review-YYYY-MM-DD main
   ```

3. Check the artifact without writing anything:

   ```sh
   npm run intake:import -- --dry-run --artifact <artifact-id>   # downloads with `gh api`, read-only
   npm run intake:import -- --dry-run path/to/intake-queue.zip   # or a zip you downloaded
   ```

   It lists each file as `create`, `update` or `unchanged`. A failed check exits 1 with every problem listed (for example `entry-name`, `entry-symlink`, `entry-too-large`, `item-schema`, `source-schema`, `source-changed`, `summary-format`), and nothing is written. Don't edit the zip to get past a failure; rerun intake instead.

4. Run the same command without `--dry-run`. The checks run again, then the files are copied into `content/source-items/` (new items only, never overwritten) and `content/sources/` (only `lastError`, `lastErrorAt` and `consecutiveFailures` may change). Nothing is committed. The script prints the `git add` line and `summary.txt`.
5. Review the diff, then commit and open the PR from `intake/review-YYYY-MM-DD` with the title `Intake review YYYY-MM-DD`. Paste `summary.txt` into the PR body. CI runs `check:content`, the schema tests, prettier and the build as on any PR.

`npm run intake:verify -- <out> --registry <dir>` runs the same checks on an intake output folder. The workflow runs it before upload with `--registry tests/fixtures/f5/registry`, the registry the fixture run reads.
