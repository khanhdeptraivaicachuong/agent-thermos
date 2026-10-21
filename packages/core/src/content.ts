export const commandDescription =
	"Run deep correctness/security and strict code-quality reviews of the current branch.";

export const usageArgumentHint = "[base-ref | PR URL | scope]";

export const contextSectionLabels = [
	"### Git / diff output",
	"### Changed file contents",
	"### User scope / intent",
] as const;

export const reviewerTaskHead = `Run Thermos against this scope. Return a findings block as described in the finding report contract in your instructions, and put nothing after it.

The parent session should populate the evidence sections before launching this agent. Review only the scoped diff and changed-file context. If placeholders remain, collect the missing context when tools allow; otherwise report that the review lacks enough evidence instead of guessing.`;

export const findingReportContract = `## Finding report

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

- \`verdict: pass\` means you have nothing to report, and the block then holds no finding records. \`verdict: needs-changes\` means it holds at least one.
- The block is the last thing in your reply. Put nothing after it and no commentary inside it.
- \`priority\` is P0, P1, P2 or P3 on the shared scale below. The rubric decides what to look for and in what order. The priority states the consequence of shipping the finding.
- \`path\` is relative to the repository root. \`side\` is \`new\` for a line the change added and \`old\` for a line it removed. \`line\` is the line number you believe the quote is on. The parent recomputes it, so an approximate number beats a confident wrong one.
- \`quote\` is one line the change added or removed, copied verbatim without the \`+\` or \`-\` marker and without its indentation. The quote is the proof that the finding points at code this change touched. A finding whose quote is not in the change cannot be verified and is dropped.
- \`title\` is one line. \`impact\` states the concrete trigger and the resulting impact in one or two sentences. No walkthrough, no call chain, no list of alternative fixes.
- One quote per finding. When the defect lives in code the change did not touch, quote the changed line that introduced it and name the surviving location in \`impact\`.
- The parent merges findings that resolve to the same file and line, so a finding that both passes report is counted once.

Before you send the block, re-read every quote against the diff you were given. If a quote is not there, fix it or drop the finding. That is your only repair attempt.

Priority is a claim about consequence, not about how much you dislike the code.

| Level | Meaning |
| --- | --- |
| P0 | Breaks on the normal path, corrupts data, or opens a reachable security hole. Ship blocking. |
| P1 | A user, operator or contributor hits it soon after release, or an existing feature stops working. |
| P2 | A real defect or structural regression that can wait for the next release. |
| P3 | Worth knowing. No expected breakage and no follow-up required. |`;

export const findingVerificationContract = `## Finding verification

The parent verifies every card before it reaches the report. A card that cannot be verified is not reported as a finding.

1. Build the changed line index. Run \`git diff --unified=0\` with the same scope expression you used for the diff you pasted to the reviewers, and read the hunk bodies. For every file, the \`+\` lines are the lines the change added and the \`-\` lines are the lines it removed. Keep the text of those lines with their line numbers, separated by side. The index stays with you. Do not paste it to the reviewers.
2. Verify each card. Look for the card's \`quote\` among the changed lines of the card's \`path\`, on the side the card names, comparing the text with leading and trailing whitespace removed.
   - Found. The finding is verified. Report the line number you found, not the number the card guessed. Two cards that resolve to the same file and line are one finding. Merge them and say that both passes found it.
   - Not found on that path. Look for the quote in the rest of the index. When it is there once, relocate the card to that file, side and line, and verify it there. That is the one repair you get. When it is not there, drop the card.
3. Drop the cards that do not verify. A dropped card is not approval. Never report a clean review when a card was dropped.
4. Count. The report states how many cards the two passes produced, how many were reported, how many were merged and how many were dropped.
5. When the index cannot be built, because git is unavailable or the scope has no diff, drop nothing. Report every card, label the findings unverified, and say in the report that the locality check did not run.

Report shape. When a card survived, the report opens with the biggest risk and then the findings. When no card survived and none was dropped, the report says the review found nothing. When every card was dropped, the report says that no finding could be verified and it names the dropped cards. Name every dropped P0 and P1 with what it claimed and why it could not be verified, and group the dropped P2 and P3 cards into one line.`;

export const contextSectionPlaceholders = [
	"<paste git status, base ref, changed-file list, and relevant diff here>",
	"<paste changed file contents or focused excerpts needed to verify findings here>",
	"<the user's scope and intent>",
] as const;

export const reviewerEvidenceEnvelope = `${reviewerTaskHead}

${contextSectionLabels[0]}
${contextSectionPlaceholders[0]}

${contextSectionLabels[1]}
${contextSectionPlaceholders[1]}

${contextSectionLabels[2]}`;

export const thermosWorkflowIntro =
	"Run the two thermo review passes as async background subagents in parallel, then synthesize their results.";

export const reviewScopeStep =
	"1. Determine the review scope from the user request, PR, current branch, or relevant changed files.";

export const reviewEvidenceStep =
	"2. Gather the diff and any file/context excerpts needed for reviewers to evaluate the change without guessing. Keep the diff you paste to the reviewers separate from the changed line index you build for verification.";

export const reviewLaunchStep = `3. Launch both subagents in the same message with \`run_in_background: true\`:
   - \`subagent_type: "thermo-nuclear-review-subagent"\` for bugs, breakages, security, devex regressions, feature-flag leaks, and other branch-audit risks.
   - \`subagent_type: "thermo-nuclear-code-quality-review-subagent"\` for maintainability, structure, file-size growth, spaghetti, abstractions, and codebase-health risks.`;

export const reviewBriefStep =
	"4. Pass each subagent the same scoped diff/file context and ask it to return a findings block, with the finding report contract in its instructions.";

export const reviewSynthesisStep =
	"5. Verify every card against the changed line index, then synthesize the surviving findings with findings first. Merge the findings that both passes reported at the same line and say so. Weight overlapping findings more heavily, resolve disagreements with your own judgment, and keep summaries brief. State how many cards were reported, merged and dropped, and name the dropped ones.";

export const reviewSummaryNote =
	"If individual background summaries are already visible to the user, do not restate them wholesale. Surface the unified verdict, the highest-signal findings, and any remaining uncertainty.";

export const thermosWorkflow = `${thermosWorkflowIntro}

## Workflow

${reviewScopeStep}
${reviewEvidenceStep}
${reviewLaunchStep}
${reviewBriefStep}
${reviewSynthesisStep}

${reviewSummaryNote}

${findingVerificationContract}`;

export const deepseekHarnessSkillDescription =
	"Launch both thermo-nuclear review subagents in parallel, verify the findings they return against the change, then synthesize them. Use for thermos, double thermo review, or combined bug/security and code-quality branch audits.";

export const deepseekHarnessWorkflowIntro =
	"Run the two thermo review passes as two parallel `subagent` delegations, verify the findings they return against the change, then synthesize their results.";

export const deepseekHarnessScopeStep = reviewScopeStep;

export const deepseekHarnessEvidenceStep =
	"2. Gather the diff and any file/context excerpts needed for reviewers to evaluate the change without guessing. Use one scope expression for the diff you paste to the reviewers and for the scope you hand the validator, so both describe the same change. The scope has to be a revision range the validator can reproduce, such as `main...HEAD` for a branch or `HEAD` for the uncommitted changes, and the diff you paste has to be `git diff` of that same range.";

export const deepseekHarnessLaunchStep = `3. Prepare each reviewer's prompt before you launch it. Read the payload file for the pass with your read tool, replace its three evidence sections with the scoped diff, the changed file contents and the user's scope, and change nothing else. The relaying rules below say how to check that you pasted it correctly.

4. Launch both reviewers in the same assistant message with two \`subagent\` calls. The tool is concurrency safe, so two calls in one message run in parallel. Each call takes a \`description\` of three to five words and a \`prompt\`:
   - one call for the deep review, with that pass's prepared prompt
   - one call for the code-quality review, with that pass's prepared prompt
   Leave every other parameter unset so each reviewer inherits the current working directory and route.`;

export const deepseekHarnessBriefStep =
	"5. Write each reviewer's findings block to `.thermos/reviews/<pass>.md` under the working directory, then run the validator:";

export const deepseekHarnessSynthesisStep = `6. Synthesize the surviving findings from the validator's output, findings first. Merge the findings that both passes reported at the same line and say so. Weight overlapping findings more heavily, resolve disagreements with your own judgment, and keep summaries brief. State how many cards were reported, merged and dropped, and name the dropped ones.`;

export const deepseekHarnessRelayRules = `## Relaying the reviewer instructions

DSH has no named subagent types, so each reviewer gets its instructions inside the prompt you pass. Build that prompt from the payload file of the pass:

- deep review pass: \`references/deep-review-payload.md\`
- code-quality pass: \`references/code-quality-payload.md\`

Read the payload file with your read tool, replace its three evidence sections with the scoped diff, the changed file contents and the user's scope, and change nothing else.

Before you send a prompt, check that the text you pasted still contains the heading of that pass, \`# Thermo Nuclear Review\` for the deep pass and \`# Thermo-Nuclear Code Quality Review\` for the code-quality pass, and that it still contains a \`~~~thermos-findings\` block template. If either one is missing, you altered the text. Paste it again.

If a payload file is missing or unreadable, stop and tell the user to reinstall the Thermos skill. Do not review from memory.

Each prompt carries exactly one rubric. Never put the other pass's rubric, the other pass's name, or any conclusion of your own into a reviewer's prompt. The two passes have to stay independent.`;

export const deepseekHarnessVerificationStep = `   node <skill base>/scripts/thermos-validate.mjs verify --repo <the repository you reviewed> --scope <the same scope expression you used for the diff> --review deep=.thermos/reviews/deep.md --review quality=.thermos/reviews/quality.md

The validator builds the changed line index from git itself, proves or drops every card, and prints what it found. Report the surviving findings from its output, never from your own reading of the diff. When the validator cannot run, say that the locality check did not run, report every card as unverified, and drop nothing.

The validator exits 0 when every card was proven, 1 when a card was dropped, 3 when the scope could not be resolved so the locality check did not run, and 4 when a pass returned a report with no readable findings block. On exit 4, name the pass whose report could not be read, report every card the other pass returned as unverified, and never describe the review as clean.`;

export const deepseekHarnessNoSubagentNote =
	"If this DSH profile has no `subagent` tool, stop and say that the profile cannot run Thermos. Do not run both passes in the same context, because the second pass would see the first pass's findings.";

export const deepseekHarnessParentReportingNote =
	"The reviewers receive the findings block format inside their own payload files, and you report only what the validator proves.";

export const deepseekHarnessEvidenceEnvelope = `${reviewerEvidenceEnvelope}
${contextSectionPlaceholders[2]}`;

export const deepseekHarnessThermosWorkflow = `${deepseekHarnessWorkflowIntro}

## Workflow

${deepseekHarnessScopeStep}
${deepseekHarnessEvidenceStep}
${deepseekHarnessLaunchStep}
${deepseekHarnessBriefStep}
${deepseekHarnessVerificationStep}
${deepseekHarnessSynthesisStep}

${reviewSummaryNote}

${deepseekHarnessRelayRules}

${deepseekHarnessNoSubagentNote}`;

export const thermoNuclearReviewRubric = `# Thermo Nuclear Review

Use this rubric for a comprehensive security and correctness audit of a checked-out branch.

## Prompt

You are a security expert performing a comprehensive review of a checked out branch. Audit this branch and its changes extremely thoroughly for bugs, changes that break existing features/functionality, and security vulnerabilities. Be extremely thorough, rigorous, careful, ambitious, and attentive.

## Scope

Only report issues related to code that is being added or modified in this PR. Focus on changes in the diff. Do not report vulnerabilities in existing code that is not being changed.

## Breaking Functionality Guidelines

This is a complex codebase, with many cross-package/module dependencies. Often simple code changes in one place have subtle interactions that break functionality elsewhere. Be extremely thorough in tracing through possible side effects of the changes.

## Breaking Devex Guidelines

Catch changes that impact developers' ability to run or build locally. Examples include changing how secrets are read, updating environment variable names, remapping ports, or adding scripts that must be run for existing functionality to keep working.

## Feature Leak Guidelines

The codebase may carefully gate features behind feature flags or internal-only checks. Do not allow intended-gated features to leak.

## Intended Breakage Guidelines

If you identify a high-risk finding but the branch intentionally introduces that behavior and the scope is well constrained, do not waste the author's time. If the implications are likely under-weighted, unclear, or suspicious, report it.

## Over-reporting Guidelines

Never misreport priority or importance. Trace issues end-to-end before reporting. Do not present issues with unfinished research when you can inspect the related code yourself.

## Final Response

If you have P1 or higher findings and there is a PR for this branch, check PR/MR discussion with gh or glab after your independent audit. Incorporate, validate, dedupe, and attribute BugBot or human findings when relevant.

## Critical Rules

- Never present issues with unfinished research.
- Check PR/MR discussion only after your own audit.
- Calibrate severity honestly.
- Structure findings with priority and file:line evidence.`;

export const thermoNuclearCodeQualityRubric = `# Thermo-Nuclear Code Quality Review

Use this rubric for an unusually strict review focused on implementation quality, maintainability, abstraction quality, and codebase health.

Above all, be ambitious about code structure. Do not merely identify local cleanup opportunities. Search for "code judo" moves: restructurings that preserve behavior while making the implementation dramatically simpler, smaller, more direct, and more elegant.

## Core Prompt

Perform a deep code quality audit of the current branch's changes. Rethink how to structure or implement the changes to meaningfully improve code quality without impacting behavior. Work to improve abstractions, modularity, reduce spaghetti code, improve succinctness and legibility. Be ambitious when there is a clear path to improving the implementation.

## Non-Negotiable Standards

0. Be ambitious about structural simplification.
1. Do not let a PR push a file from under 1k lines to over 1k lines without a very strong reason.
2. Do not allow random spaghetti growth in existing code.
3. Bias toward cleaning the design, not just accepting working code.
4. Prefer direct, boring, maintainable code over hacky or magical code.
5. Push hard on type and boundary cleanliness when they affect maintainability.
6. Keep logic in the canonical layer and reuse existing helpers.
7. Treat unnecessary sequential orchestration and non-atomic updates as design smells when the cleaner structure is obvious.

## Primary Review Questions

- Is there a code-judo move that would make this dramatically simpler?
- Can this change be reframed so fewer concepts, branches, or helper layers are needed?
- Does this improve or worsen the local architecture?
- Did the diff add branching complexity where a better abstraction should exist?
- Is this logic living in the right file and layer?
- Did this change enlarge a file or component past a healthy size boundary?
- Is this abstraction actually earning its keep, or is it just a wrapper?
- Did the diff introduce casts, optionality, or ad-hoc object shapes that obscure the real invariant?

## What To Flag Aggressively

Flag complicated implementations where a cleaner reframing could delete complexity, refactors that move code around without reducing concepts, files crossing 1000 lines due to the PR, new conditionals bolted onto unrelated paths, feature checks scattered across shared code, unnecessary wrappers, cast-heavy contracts, bespoke helpers where a canonical one exists, and logic in the wrong layer.

## Preferred Remedies

Prefer deleting indirection, reframing the state model, changing ownership boundaries, turning special cases into simpler defaults, extracting pure helpers, splitting large files, replacing condition chains with typed models, separating orchestration from business logic, reusing canonical helpers, and making type boundaries explicit.

## Output Expectations

Prioritize findings in this order:

1. Structural code-quality regressions.
2. Missed opportunities for dramatic simplification.
3. Spaghetti or branching complexity increases.
4. Boundary, abstraction, or type-contract problems.
5. File-size and decomposition concerns.
6. Modularity and abstraction issues.
7. Legibility and maintainability concerns.

Prefer a smaller number of high-conviction comments over cosmetic notes. Do not approve merely because behavior seems correct.`;

export const deepReviewAgentPrompt = `# Thermo Nuclear Review (Deep review)

You are a task subagent. The parent agent already collected git output and changed-file contents; your prompt contains the labeled context sections the parent filled in.

## Rubric

Follow the thermo-nuclear-review rubric exactly: scope only added/modified code, breaking functionality and devex, feature leaks, intended breakage, over-reporting, final response and PR discussion rules, and critical rules.

## Work

1. Perform the full audit against only the changed code in the diff. Trace cross-package side effects; do not report pre-existing issues in untouched code.
2. Finish your independent audit first.
3. After the audit, if there is a PR for this branch and you have P1 or higher findings, use gh or glab to read PR/MR discussion. Incorporate BugBot or human threads by validating, deduping, and attributing sourced items.
4. Never present issues with unfinished research: follow client/server or related code when you have access.

Calibrate severity honestly. Return the findings block described in the finding report contract, and put nothing after it. Do not spawn nested subagents unless the parent explicitly asks.`;

export const codeQualityAgentPrompt = `# Thermo-Nuclear Code Quality Review

You are a task subagent. The parent agent already collected git output and changed-file contents; your prompt contains the labeled context sections the parent filled in.

## Rubric

Follow the thermo-nuclear-code-quality-review rubric as the complete rubric: output ordering, code-judo, 1k-line, spaghetti, abstraction, boundary, and type-contract rules.

## Work

- Apply the rubric only to what the diff and contents show.
- Trace cross-file impact when the change touches module boundaries.
- Output in the priority order the rubric specifies.
- Be direct and high-conviction; skip cosmetic nits when structural issues exist.
- Return the findings block described in the finding report contract, and put nothing after it.
- Do not spawn nested subagents unless the parent explicitly asks.`;
