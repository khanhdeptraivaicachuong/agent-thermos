---
name: thermos
description: Launch both thermo-nuclear review subagents in parallel, verify the findings they return against the change, then synthesize them. Use for thermos, double thermo review, or combined bug/security and code-quality branch audits.
disable-model-invocation: true
---

Run the two thermo review passes as two parallel `subagent` delegations, verify the findings they return against the change, then synthesize their results.

## Workflow

1. Determine the review scope from the user request, PR, current branch, or relevant changed files.
2. Gather the diff and any file/context excerpts needed for reviewers to evaluate the change without guessing. Use one scope expression for the diff you paste to the reviewers and for the scope you hand the validator, so both describe the same change. The scope has to be a revision range the validator can reproduce, such as `main...HEAD` for a branch or `HEAD` for the uncommitted changes, and the diff you paste has to be `git diff` of that same range.
3. Prepare each reviewer's prompt before you launch it. Read the payload file for the pass with your read tool, replace its three evidence sections with the scoped diff, the changed file contents and the user's scope, and change nothing else. The relaying rules below say how to check that you pasted it correctly.

4. Launch both reviewers in the same assistant message with two `subagent` calls. The tool is concurrency safe, so two calls in one message run in parallel. Each call takes a `description` of three to five words and a `prompt`:
   - one call for the deep review, with that pass's prepared prompt
   - one call for the code-quality review, with that pass's prepared prompt
   Leave every other parameter unset so each reviewer inherits the current working directory and route.
5. Write each reviewer's findings block to `.thermos/reviews/<pass>.md` under the working directory, then run the validator:
   node <skill base>/scripts/thermos-validate.mjs verify --repo <the repository you reviewed> --scope <the same scope expression you used for the diff> --review deep=.thermos/reviews/deep.md --review quality=.thermos/reviews/quality.md

The validator builds the changed line index from git itself, proves or drops every card, and prints what it found. Report the surviving findings from its output, never from your own reading of the diff. When the validator cannot run, say that the locality check did not run, report every card as unverified, and drop nothing.
6. Synthesize the surviving findings from the validator's output, findings first. Merge the findings that both passes reported at the same line and say so. Weight overlapping findings more heavily, resolve disagreements with your own judgment, and keep summaries brief. State how many cards were reported, merged and dropped, and name the dropped ones.

If individual background summaries are already visible to the user, do not restate them wholesale. Surface the unified verdict, the highest-signal findings, and any remaining uncertainty.

## Relaying the reviewer instructions

DSH has no named subagent types, so each reviewer gets its instructions inside the prompt you pass. Build that prompt from the payload file of the pass:

- deep review pass: `references/deep-review-payload.md`
- code-quality pass: `references/code-quality-payload.md`

Read the payload file with your read tool, replace its three evidence sections with the scoped diff, the changed file contents and the user's scope, and change nothing else.

Before you send a prompt, check that the text you pasted still contains the heading of that pass, `# Thermo Nuclear Review` for the deep pass and `# Thermo-Nuclear Code Quality Review` for the code-quality pass, and that it still contains a `~~~thermos-findings` block template. If either one is missing, you altered the text. Paste it again.

If a payload file is missing or unreadable, stop and tell the user to reinstall the Thermos skill. Do not review from memory.

Each prompt carries exactly one rubric. Never put the other pass's rubric, the other pass's name, or any conclusion of your own into a reviewer's prompt. The two passes have to stay independent.

If this DSH profile has no `subagent` tool, stop and say that the profile cannot run Thermos. Do not run both passes in the same context, because the second pass would see the first pass's findings.

## Finding report

End your reply with exactly one findings block. Everything before the block is commentary for the reader. The block is the review result.

~~~thermos-findings
protocol: thermos-findings/1
verdict: needs-changes
summary: <one line>

finding:
  priority: P1
  path: <the repo-relative path of the file the change touched>
  side: new
  line: <the line number the quote is on>
  quote: <one changed line, copied verbatim, without its leading + or - marker>
  title: <one line>
  impact: <the trigger and the resulting impact>
~~~

Every value in that card is a placeholder. A card that still holds a placeholder is not a finding.

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
