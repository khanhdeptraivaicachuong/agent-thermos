---
description: Run deep correctness/security and strict code-quality reviews of the current branch.
argument-hint: [base-ref | PR URL | scope]
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git show:*), Bash(git rev-parse:*), Bash(gh pr view:*), Bash(glab mr view:*)
---

# Thermos

Usage: `/thermos:run [base-ref | PR URL | scope]`

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

## Claude Notes

If no scope is provided, review the current branch against `main`. Use the plugin-scoped Claude agent names `thermos:thermo-nuclear-review-subagent` and `thermos:thermo-nuclear-code-quality-review-subagent` for the matching upstream `subagent_type` values.

Pass both agents the same labeled context sections:
- `### Git / diff output`
- `### Changed file contents`
- `### User scope / intent`

If the plugin-scoped agents are unavailable, run the same two review passes with general-purpose subagents, and give each of them the rubric and the finding report contract from the matching agent definition in this plugin.
