---
name: thermos
description: "Launch both thermo-nuclear review subagents in parallel, then synthesize their findings. Use for $thermos, thermos, double thermo review, or combined bug/security and code-quality branch audits."
disable-model-invocation: true
---

# Thermos

Explicit invocation: `$thermos [base-ref | PR URL | scope]`

Run the two thermo review passes as async background subagents in parallel, then synthesize their results.

## Workflow

1. Determine the review scope from the user request, PR, current branch, or relevant changed files.
2. Gather the diff and any file/context excerpts needed for reviewers to evaluate the change without guessing. Keep the diff you paste to the reviewers separate from the changed line index you build for verification.
3. Launch both subagents in the same message with `run_in_background: true`:
   - `subagent_type: "thermo-nuclear-review-subagent"` for bugs, breakages, security, devex regressions, feature-flag leaks, and other branch-audit risks.
   - `subagent_type: "thermo-nuclear-code-quality-review-subagent"` for maintainability, structure, file-size growth, spaghetti, abstractions, and codebase-health risks.
4. Pass each subagent the same scoped diff/file context and ask it to return a findings block, with the finding report contract in its instructions.
5. Verify every card against the changed line index, then synthesize the surviving findings with findings first. Merge the findings that both passes reported at the same line and say so. Weight overlapping findings more heavily, resolve disagreements with your own judgment, and keep summaries brief. State how many cards were reported, merged and dropped, and name the dropped ones.

If individual background summaries are already visible to the user, do not restate them wholesale. Surface the unified verdict, the highest-signal findings, and any remaining uncertainty.

## Finding verification

The parent verifies every card before it reaches the report. A card that cannot be verified is not reported as a finding.

1. Build the changed line index. Run `git diff --unified=0` with the same scope expression you used for the diff you pasted to the reviewers, and read the hunk bodies. For every file, the `+` lines are the lines the change added and the `-` lines are the lines it removed. Keep the text of those lines with their line numbers, separated by side. The index stays with you. Do not paste it to the reviewers.
2. Verify each card. Look for the card's `quote` among the changed lines of the card's `path`, on the side the card names, comparing the text with leading and trailing whitespace removed.
   - Found. The finding is verified. Report the line number you found, not the number the card guessed. Two cards that resolve to the same file and line are one finding. Merge them and say that both passes found it.
   - Not found on that path. Look for the quote in the rest of the index. When it is there once, relocate the card to that file, side and line, and verify it there. That is the one repair you get. When it is not there, drop the card.
3. Drop the cards that do not verify. A dropped card is not approval. Never report a clean review when a card was dropped.
4. Count. The report states how many cards the two passes produced, how many were reported, how many were merged and how many were dropped.
5. When the index cannot be built, because git is unavailable or the scope has no diff, drop nothing. Report every card, label the findings unverified, and say in the report that the locality check did not run.

Report shape. When a card survived, the report opens with the biggest risk and then the findings. When no card survived and none was dropped, the report says the review found nothing. When every card was dropped, the report says that no finding could be verified and it names the dropped cards. Name every dropped P0 and P1 with what it claimed and why it could not be verified, and group the dropped P2 and P3 cards into one line.

## Codex Notes

Use Codex subagents or multi-agent tools when available. If the current Codex surface does not expose background subagents, run the two passes sequentially in the main thread and keep the outputs clearly separated before synthesis.

The packaged rubric references are available at `references/thermo-nuclear-review.md` and `references/thermo-nuclear-code-quality-review.md`. Give each subagent the matching rubric if the host does not automatically resolve the named subagent.

Give each pass the finding report contract below verbatim, so both passes return the same findings block.

## Finding report

End your reply with exactly one findings block. Everything before the block is commentary for the reader. The block is the review result.

~~~thermos-findings
protocol: thermos-findings/1
verdict: needs-changes
summary: <one line>

finding:
  priority: P1
  path: packages/core/src/render.ts
  side: new
  line: 112
  quote: const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  title: <one line>
  impact: <the trigger and the resulting impact>
~~~

Rules:

- `verdict: pass` means you have nothing to report, and the block then holds no finding records. `verdict: needs-changes` means it holds at least one.
- The block is the last thing in your reply. Put nothing after it and no commentary inside it.
- `priority` is P0, P1, P2 or P3 on the shared scale below. The rubric decides what to look for and in what order. The priority states the consequence of shipping the finding.
- `path` is relative to the repository root. `side` is `new` for a line the change added and `old` for a line it removed. `line` is the line number you believe the quote is on. The parent recomputes it, so an approximate number beats a confident wrong one.
- `quote` is one line the change added or removed, copied verbatim without the `+` or `-` marker and without its indentation. The quote is the proof that the finding points at code this change touched. A finding whose quote is not in the change cannot be verified and is dropped.
- `title` is one line. `impact` states the concrete trigger and the resulting impact in one or two sentences. No walkthrough, no call chain, no list of alternative fixes.
- One quote per finding. When the defect lives in code the change did not touch, quote the changed line that introduced it and name the surviving location in `impact`.
- The parent merges findings that resolve to the same file and line, so a finding that both passes report is counted once.

Before you send the block, re-read every quote against the diff you were given. If a quote is not there, fix it or drop the finding. That is your only repair attempt.

Priority is a claim about consequence, not about how much you dislike the code.

| Level | Meaning |
| --- | --- |
| P0 | Breaks on the normal path, corrupts data, or opens a reachable security hole. Ship blocking. |
| P1 | A user, operator or contributor hits it soon after release, or an existing feature stops working. |
| P2 | A real defect or structural regression that can wait for the next release. |
| P3 | Worth knowing. No expected breakage and no follow-up required. |
