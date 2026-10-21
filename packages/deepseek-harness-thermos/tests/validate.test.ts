import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
// @ts-expect-error the validator ships as plain ESM JavaScript, so it carries no declaration file
import * as validator from "../skill/thermos/scripts/thermos-validate.mjs";

const { matchCards, parseFindingsBlock, parseUnifiedDiff, renderDigest, toJsonPayload, verify } = validator;

const scriptPath = resolve(import.meta.dir, "../skill/thermos/scripts/thermos-validate.mjs");

const wellFormedBlock = `~~~thermos-findings
protocol: thermos-findings/1
verdict: needs-changes
summary: one line

finding:
  priority: P1
  path: src/app.ts
  side: new
  line: 3
  quote: export const risky = true;
  title: The new export is unguarded
  impact: a caller that imports it trips the missing guard
~~~`;

const passBlock = `~~~thermos-findings
protocol: thermos-findings/1
verdict: pass
summary: nothing worth reporting
~~~`;

const unprovableBlock = `~~~thermos-findings
protocol: thermos-findings/1
verdict: needs-changes
summary: one line

finding:
  priority: P2
  path: src/app.ts
  side: new
  line: 1
  quote: export const neverChanged = false;
  title: A title
  impact: the impact
~~~`;

const diffWithOneAddedLine = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -2,0 +3 @@
+export const risky = true;
`;

const diffWithTwoFiles = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -2,0 +3 @@
+export const risky = true;
diff --git a/src/other.ts b/src/other.ts
index 3333333..4444444 100644
--- a/src/other.ts
+++ b/src/other.ts
@@ -1,0 +2 @@
+export const other = 3;
`;

const diffWithDuplicateQuote = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -2,0 +3 @@
+export const risky = true;
diff --git a/src/other.ts b/src/other.ts
index 3333333..4444444 100644
--- a/src/other.ts
+++ b/src/other.ts
@@ -1,0 +2 @@
+export const risky = true;
`;

const diffWithDuplicateQuoteInOneFile = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -2,0 +3,2 @@
+export const risky = true;
+export const risky = true;
`;

describe("thermos-validate findings block parser", () => {
	test("reads a well formed block", () => {
		const parsed = parseFindingsBlock(`Some commentary.\n\n${wellFormedBlock}\n`);

		expect(parsed.found).toBe(true);
		expect(parsed.envelope.protocol).toBe("thermos-findings/1");
		expect(parsed.envelope.verdict).toBe("needs-changes");
		expect(parsed.envelope.summary).toBe("one line");
		expect(parsed.cards).toHaveLength(1);
		expect(parsed.cards[0]?.priority).toBe("P1");
		expect(parsed.cards[0]?.path).toBe("src/app.ts");
		expect(parsed.cards[0]?.side).toBe("new");
		expect(parsed.cards[0]?.line).toBe(3);
		expect(parsed.cards[0]?.quote).toBe("export const risky = true;");
		expect(parsed.cards[0]?.title).toBe("The new export is unguarded");
		expect(parsed.cards[0]?.impact).toBe("a caller that imports it trips the missing guard");
		expect(parsed.cards[0]?.dropReason).toBeNull();
	});

	test("reads a pass verdict that holds no record", () => {
		const parsed = parseFindingsBlock(passBlock);

		expect(parsed.found).toBe(true);
		expect(parsed.envelope.verdict).toBe("pass");
		expect(parsed.cards).toHaveLength(0);
	});

	test("drops a record that misses a field", () => {
		const parsed = parseFindingsBlock(`~~~thermos-findings
protocol: thermos-findings/1
verdict: needs-changes
summary: one line

finding:
  priority: P2
  path: src/app.ts
  side: new
  line: 3
  title: No quote at all
  impact: the impact
~~~`);

		expect(parsed.cards).toHaveLength(1);
		expect(parsed.cards[0]?.dropReason).toBe("missing-field");
		expect(parsed.cards[0]?.dropDetail).toContain("quote");
	});

	test("drops a record that carries a field it may not carry", () => {
		const parsed = parseFindingsBlock(`~~~thermos-findings
protocol: thermos-findings/1
verdict: needs-changes
summary: one line

finding:
  priority: P2
  path: src/app.ts
  side: new
  line: 3
  quote: export const risky = true;
  title: A title
  impact: the impact
  verdict: pass
~~~`);

		expect(parsed.cards).toHaveLength(1);
		expect(parsed.cards[0]?.dropReason).toBe("unknown-field");
		expect(parsed.cards[0]?.dropDetail).toContain("verdict");
	});

	test("drops a record whose side is neither new nor old", () => {
		const parsed = parseFindingsBlock(`~~~thermos-findings
protocol: thermos-findings/1
verdict: needs-changes
summary: one line

finding:
  priority: P2
  path: src/app.ts
  side: middle
  line: 3
  quote: export const risky = true;
  title: A title
  impact: the impact
~~~`);

		expect(parsed.cards).toHaveLength(1);
		expect(parsed.cards[0]?.dropReason).toBe("invalid-side");
	});

	test("takes the last block of a file that holds two", () => {
		const parsed = parseFindingsBlock(`${passBlock}

~~~thermos-findings
protocol: thermos-findings/1
verdict: needs-changes
summary: the real one

finding:
  priority: P0
  path: src/app.ts
  side: new
  line: 7
  quote: the last quote
  title: The last title
  impact: the last impact
~~~`);

		expect(parsed.found).toBe(true);
		expect(parsed.envelope.verdict).toBe("needs-changes");
		expect(parsed.envelope.summary).toBe("the real one");
		expect(parsed.cards).toHaveLength(1);
		expect(parsed.cards[0]?.priority).toBe("P0");
		expect(parsed.cards[0]?.line).toBe(7);
	});

	test("reports a file without any block", () => {
		const parsed = parseFindingsBlock("# Review\n\nI found nothing that matters.\n");

		expect(parsed.found).toBe(false);
		expect(parsed.cards).toHaveLength(0);
	});
});

describe("thermos-validate diff parser", () => {
	test("reads an added line", () => {
		const index = parseUnifiedDiff(diffWithOneAddedLine);
		const file = index.byNewPath.get("src/app.ts");

		expect(file).toBeDefined();
		expect(file?.new.get(3)).toBe("export const risky = true;");
		expect(file?.old.size).toBe(0);
	});

	test("reads a removed line", () => {
		const index = parseUnifiedDiff(`diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -2 +1,0 @@
-export const gone = true;
`);
		const file = index.byNewPath.get("src/app.ts");

		expect(file?.old.get(2)).toBe("export const gone = true;");
		expect(file?.new.size).toBe(0);
	});

	test("reads a file that was added whole", () => {
		const index = parseUnifiedDiff(`diff --git a/src/fresh.ts b/src/fresh.ts
new file mode 100644
index 0000000..2222222
--- /dev/null
+++ b/src/fresh.ts
@@ -0,0 +1,2 @@
+export const one = 1;
+export const two = 2;
`);
		const file = index.byNewPath.get("src/fresh.ts");

		expect(file?.new.get(1)).toBe("export const one = 1;");
		expect(file?.new.get(2)).toBe("export const two = 2;");
		expect(file?.old.size).toBe(0);
		expect(index.byOldPath.has("src/fresh.ts")).toBe(false);
	});

	test("reads a file that was deleted whole", () => {
		const index = parseUnifiedDiff(`diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index 2222222..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const one = 1;
-export const two = 2;
`);
		const file = index.byOldPath.get("src/old.ts");

		expect(file?.old.get(1)).toBe("export const one = 1;");
		expect(file?.old.get(2)).toBe("export const two = 2;");
		expect(file?.new.size).toBe(0);
		expect(index.byNewPath.has("src/old.ts")).toBe(false);
	});

	test("keeps the old path of a renamed file as an alias for the old side", () => {
		const index = parseUnifiedDiff(`diff --git a/src/before.ts b/src/after.ts
similarity index 90%
rename from src/before.ts
rename to src/after.ts
index 1111111..2222222 100644
--- a/src/before.ts
+++ b/src/after.ts
@@ -1 +1,2 @@
-const kept = 1;
+const kept = 2;
+const added = 3;
`);
		const renamed = index.byNewPath.get("src/after.ts");

		expect(renamed?.new.get(2)).toBe("const added = 3;");
		expect(renamed?.old.get(1)).toBe("const kept = 1;");
		expect(index.byOldPath.get("src/before.ts")).toBe(renamed);
		expect(index.byOldPath.has("src/after.ts")).toBe(false);
	});

	test("reads a hunk header that omits the counts", () => {
		const index = parseUnifiedDiff(`diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -5 +5 @@
-const before = 1;
+const after = 1;
`);
		const file = index.byNewPath.get("src/app.ts");

		expect(file?.new.get(5)).toBe("const after = 1;");
		expect(file?.old.get(5)).toBe("const before = 1;");
	});
});

describe("thermos-validate card matcher", () => {
	const cardFor = (fields: Record<string, string>) => {
		const parsed = parseFindingsBlock(`~~~thermos-findings
protocol: thermos-findings/1
verdict: needs-changes
summary: one line

finding:
  priority: P1
  path: ${fields.path ?? "src/app.ts"}
  side: ${fields.side ?? "new"}
  line: ${fields.line ?? "3"}
  quote: ${fields.quote ?? "export const risky = true;"}
  title: ${fields.title ?? "A title"}
  impact: ${fields.impact ?? "the impact"}
~~~`);
		return parsed.cards[0];
	};

	test("proves a card whose quote is an added line and reports the line it found", () => {
		const index = parseUnifiedDiff(diffWithOneAddedLine);
		const card = cardFor({ line: "99" });
		const matched = matchCards(index, [card]);

		expect(matched[0]?.state).toBe("proven");
		expect(matched[0]?.line).toBe(3);
		expect(matched[0]?.relocated).toBe(false);
		expect(matched[0]?.claimed.line).toBe(99);
	});

	test("drops a card whose quote is nowhere", () => {
		const index = parseUnifiedDiff(diffWithOneAddedLine);
		const card = cardFor({ quote: "export const untouched = false;" });
		const matched = matchCards(index, [card]);

		expect(matched[0]?.state).toBe("dropped");
		expect(matched[0]?.reason).toBe("quote-not-found");
	});

	test("relocates a card whose quote lives in another file", () => {
		const index = parseUnifiedDiff(diffWithTwoFiles);
		const card = cardFor({ path: "src/other.ts", line: "2" });
		const matched = matchCards(index, [card]);

		expect(matched[0]?.state).toBe("proven");
		expect(matched[0]?.path).toBe("src/app.ts");
		expect(matched[0]?.side).toBe("new");
		expect(matched[0]?.line).toBe(3);
		expect(matched[0]?.relocated).toBe(true);
		expect(matched[0]?.claimed.path).toBe("src/other.ts");
	});

	test("drops a card whose quote appears twice", () => {
		const index = parseUnifiedDiff(diffWithDuplicateQuote);
		const card = cardFor({ path: "src/missing.ts" });
		const matched = matchCards(index, [card]);

		expect(matched[0]?.state).toBe("dropped");
		expect(matched[0]?.reason).toBe("quote-ambiguous");
	});

	test("drops a card whose quote appears twice in the file it names", () => {
		const index = parseUnifiedDiff(diffWithDuplicateQuoteInOneFile);
		const card = cardFor({});
		const matched = matchCards(index, [card]);

		expect(matched[0]?.state).toBe("dropped");
		expect(matched[0]?.reason).toBe("quote-ambiguous");
	});

	test("drops a card that points at a line the change did not touch", () => {
		const index = parseUnifiedDiff(diffWithOneAddedLine);
		const card = cardFor({ quote: "export const a = 1;" });
		const matched = matchCards(index, [card]);

		expect(matched[0]?.state).toBe("dropped");
		expect(matched[0]?.reason).toBe("quote-not-found");
	});
});

describe("thermos-validate counts", () => {
	test("merges two passes that report the same location", () => {
		const result = verify({
			diffText: diffWithOneAddedLine,
			reviews: [
				{ pass: "deep", text: wellFormedBlock },
				{ pass: "quality", text: wellFormedBlock },
			],
		});

		expect(result.produced).toBe(2);
		expect(result.proven).toBe(2);
		expect(result.dropped).toBe(0);
		expect(result.findings).toBe(1);
		expect(result.merged).toBe(1);
		expect(result.status).toBe("verified");
		expect(result.findingGroups[0]?.passes).toEqual(["deep", "quality"]);
		expect(result.cards[0]?.key).toBe("deep#1");
		expect(result.cards[1]?.key).toBe("quality#1");
	});

	test("counts a card that could not be proved as dropped", () => {
		const result = verify({
			diffText: diffWithOneAddedLine,
			reviews: [
				{ pass: "deep", text: wellFormedBlock },
				{ pass: "quality", text: unprovableBlock },
			],
		});

		expect(result.produced).toBe(2);
		expect(result.proven).toBe(1);
		expect(result.dropped).toBe(1);
		expect(result.findings).toBe(1);
		expect(result.merged).toBe(0);
		expect(result.status).toBe("partial");
		expect(result.cards[1]?.key).toBe("quality#1");
		expect(result.cards[1]?.state).toBe("dropped");
		expect(result.cards[1]?.reason).toBe("quote-not-found");
	});

	test("the digest states what the program proves and what it does not", () => {
		const result = verify({
			diffText: diffWithOneAddedLine,
			reviews: [{ pass: "deep", text: wellFormedBlock }],
			repo: "E:\\repo",
			scope: "main...HEAD",
			head: "0123456789abcdef",
		});
		const digest = renderDigest(result);

		expect(digest).toContain("repo:  E:\\repo");
		expect(digest).toContain("scope: main...HEAD");
		expect(digest).toContain("head:  0123456789abcdef");
		expect(digest).toContain("cards: deep=1");
		expect(digest).toContain("deep#1");
		expect(digest).toContain("src/app.ts:3 (new)");
		expect(digest).toContain("produced 1  proven 1  dropped 0  merged 0  findings 1");
		expect(digest).toContain("points at a line this change touched");
		expect(digest).toContain("Not proved: who wrote a card");
		expect(digest).not.toContain("—");

		const payload = toJsonPayload(result);
		expect(payload.status).toBe("verified");
		expect(payload.findings).toBe(1);
		expect(payload.findingGroups[0]?.path).toBe("src/app.ts");
		expect(payload.findingGroups[0]?.passes).toEqual(["deep"]);
	});
});

function createRepository(): string {
	const dir = mkdtempSync(join(tmpdir(), "thermos-validate-"));
	const git = (...args: string[]) => {
		const result = Bun.spawnSync({ cmd: ["git", "-C", dir, ...args], stdout: "pipe", stderr: "pipe" });
		if (result.exitCode !== 0) {
			throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`);
		}
		return result.stdout.toString();
	};
	git("init");
	mkdirSync(join(dir, "src"));
	writeFileSync(join(dir, "src/app.ts"), "export const a = 1;\nexport const b = 2;\n");
	git("add", ".");
	git("-c", "user.email=thermos@example.test", "-c", "user.name=Thermos Test", "commit", "-m", "initial");
	writeFileSync(join(dir, "src/app.ts"), "export const a = 1;\nexport const b = 2;\nexport const risky = true;\n");
	return dir;
}

function writeReview(dir: string, name: string, text: string): string {
	const path = join(dir, name);
	writeFileSync(path, text, "utf8");
	return path;
}

function runValidator(args: string[]) {
	return Bun.spawnSync({ cmd: ["node", scriptPath, ...args], stdout: "pipe", stderr: "pipe" });
}

describe("thermos-validate command line", () => {
	test("proves every card of a review and writes the json result", () => {
		const dir = createRepository();
		try {
			const review = writeReview(dir, "deep.md", wellFormedBlock);
			const jsonPath = join(dir, "result.json");
			const result = runValidator([
				"verify",
				"--repo",
				dir,
				"--scope",
				"HEAD",
				"--review",
				`deep=${review}`,
				"--json",
				jsonPath,
			]);

			expect(result.exitCode).toBe(0);
			const stdout = result.stdout.toString();
			expect(stdout).toContain("thermos-validate");
			expect(stdout).toContain("scope: HEAD");
			expect(stdout).toContain("cards: deep=1");
			expect(stdout).toContain("deep#1");
			expect(stdout).toContain("src/app.ts:3 (new)");
			expect(stdout).toContain("produced 1  proven 1  dropped 0  merged 0  findings 1");
			expect(stdout).toContain("Proved against");
			expect(result.stderr.toString()).toBe("");

			const payload = JSON.parse(readFileSync(jsonPath, "utf8")) as {
				status: string;
				produced: number;
				proven: number;
				dropped: number;
				merged: number;
				findings: number;
				cards: Array<{ key: string; state: string; path: string; line: number; relocated: boolean }>;
				findingGroups: Array<{ path: string; line: number; passes: string[] }>;
			};
			expect(payload.status).toBe("verified");
			expect(payload.produced).toBe(1);
			expect(payload.proven).toBe(1);
			expect(payload.dropped).toBe(0);
			expect(payload.merged).toBe(0);
			expect(payload.findings).toBe(1);
			expect(payload.cards[0]?.key).toBe("deep#1");
			expect(payload.cards[0]?.state).toBe("proven");
			expect(payload.cards[0]?.path).toBe("src/app.ts");
			expect(payload.cards[0]?.line).toBe(3);
			expect(payload.cards[0]?.relocated).toBe(false);
			expect(payload.findingGroups[0]?.passes).toEqual(["deep"]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("exits with 1 and names the drop reason when a card cannot be proved", () => {
		const dir = createRepository();
		try {
			const review = writeReview(
				dir,
				"deep.md",
				`~~~thermos-findings
protocol: thermos-findings/1
verdict: needs-changes
summary: one line

finding:
  priority: P1
  path: src/app.ts
  side: new
  line: 3
  quote: export const neverChanged = false;
  title: A title
  impact: the impact
~~~`,
			);
			const jsonPath = join(dir, "result.json");
			const result = runValidator([
				"verify",
				"--repo",
				dir,
				"--scope",
				"HEAD",
				"--review",
				`deep=${review}`,
				"--json",
				jsonPath,
			]);

			expect(result.exitCode).toBe(1);
			const stdout = result.stdout.toString();
			expect(stdout).toContain("dropped");
			expect(stdout).toContain("quote-not-found");
			expect(stdout).toContain("produced 1  proven 0  dropped 1  merged 0  findings 0");

			const payload = JSON.parse(readFileSync(jsonPath, "utf8")) as {
				status: string;
				dropped: number;
				cards: Array<{ state: string; reason: string }>;
			};
			expect(payload.status).toBe("partial");
			expect(payload.dropped).toBe(1);
			expect(payload.cards[0]?.state).toBe("dropped");
			expect(payload.cards[0]?.reason).toBe("quote-not-found");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("exits with 3 when the scope cannot be resolved", () => {
		const dir = createRepository();
		try {
			const review = writeReview(dir, "deep.md", wellFormedBlock);
			const result = runValidator([
				"verify",
				"--repo",
				dir,
				"--scope",
				"no-such-ref-xyz",
				"--review",
				`deep=${review}`,
			]);

			expect(result.exitCode).toBe(3);
			expect(result.stderr.toString()).toContain("blocked");
			const stdout = result.stdout.toString();
			expect(stdout).toContain("unverified");
			expect(stdout).toContain("produced 1  proven 0  dropped 0  merged 0  findings 0");
			expect(stdout).toContain("The locality check did not run.");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("exits with 4 when a review file holds no findings block", () => {
		const dir = createRepository();
		try {
			const review = writeReview(dir, "deep.md", "# Review\n\nNothing to report here.\n");
			const result = runValidator(["verify", "--repo", dir, "--scope", "HEAD", "--review", `deep=${review}`]);

			expect(result.exitCode).toBe(4);
			expect(result.stderr.toString()).toContain("unusable");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("exits with 2 on a usage error", () => {
		const dir = createRepository();
		try {
			const review = writeReview(dir, "deep.md", wellFormedBlock);
			expect(runValidator(["verify", "--repo", dir, "--scope", "HEAD"]).exitCode).toBe(2);
			expect(runValidator(["verify", "--repo", dir, "--review", `deep=${review}`, "--nope"]).exitCode).toBe(2);
			expect(runValidator(["verify", "--repo", dir, "--review", `deep=${review}`, "--scope"]).exitCode).toBe(2);
			expect(runValidator(["verify", "--repo", dir, "--review", "deep"]).exitCode).toBe(2);
			expect(runValidator(["check", "--review", `deep=${review}`]).exitCode).toBe(2);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
