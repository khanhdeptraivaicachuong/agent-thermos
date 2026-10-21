#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FINDINGS_FENCE = "~~~thermos-findings";
const CLOSING_FENCE = /^~{3,}$/;
const PROTOCOL = "thermos-findings/1";
const ENVELOPE_FIELDS = ["protocol", "verdict", "summary"];
const CARD_FIELDS = ["priority", "path", "side", "line", "quote", "title", "impact"];
const PRIORITIES = ["P0", "P1", "P2", "P3"];
const SIDES = ["new", "old"];
const VERDICTS = ["pass", "needs-changes"];

const REASON_MISSING_FIELD = "missing-field";
const REASON_UNKNOWN_FIELD = "unknown-field";
const REASON_INVALID_SIDE = "invalid-side";
const REASON_NOT_FOUND = "quote-not-found";
const REASON_AMBIGUOUS = "quote-ambiguous";

const USAGE =
	"node thermos-validate.mjs verify --repo <path> --scope <rev-range> --review <label>=<file> [--review <label>=<file> ...] [--json <path>]";
const BLOCKED_CLOSING =
	"The changed line index could not be built, so no card was proven and no card was dropped. The locality check did not run.";

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const FIELD_LINE = /^([ \t]*)([a-z][a-z0-9_-]*):(.*)$/;

/**
 * Parse the last `~~~thermos-findings` block of a review file.
 *
 * Returns the envelope, the finding records it holds and the notes that describe
 * anything the parser could not make sense of. A file without the fence yields
 * `found: false`, which makes the whole review unusable.
 */
export function parseFindingsBlock(text) {
	const source = typeof text === "string" ? text : "";
	const lines = source.split(/\r?\n/);
	let openIndex = -1;
	for (let index = lines.length - 1; index >= 0; index -= 1) {
		if (lines[index].trim() === FINDINGS_FENCE) {
			openIndex = index;
			break;
		}
	}
	if (openIndex === -1) {
		return { found: false, envelope: emptyEnvelope(), cards: [], notes: [] };
	}
	const body = [];
	for (let index = openIndex + 1; index < lines.length; index += 1) {
		if (CLOSING_FENCE.test(lines[index].trim())) break;
		body.push(lines[index]);
	}
	return parseFindingsBody(body);
}

function emptyEnvelope() {
	return { protocol: null, verdict: null, summary: null };
}

function parseFindingsBody(body) {
	const envelope = emptyEnvelope();
	const notes = [];
	const rawCards = [];
	let current = null;

	for (const line of body) {
		if (line.trim() === "") continue;
		const field = parseFieldLine(line);
		if (field === null) {
			if (current !== null && current.lastField !== null) {
				current.fields[current.lastField] = `${current.fields[current.lastField]} ${line.trim()}`;
			} else if (current === null) {
				notes.push(`ignored line outside a finding record: ${line.trim()}`);
			}
			continue;
		}
		if (field.name === "finding") {
			current = { fields: {}, unknown: [], lastField: null };
			rawCards.push(current);
			continue;
		}
		if (current !== null && (field.indent > 0 || CARD_FIELDS.includes(field.name))) {
			if (CARD_FIELDS.includes(field.name)) {
				current.fields[field.name] = field.value;
				current.lastField = field.name;
			} else {
				if (!current.unknown.includes(field.name)) current.unknown.push(field.name);
				current.lastField = null;
			}
			continue;
		}
		if (current !== null) current = null;
		if (ENVELOPE_FIELDS.includes(field.name)) {
			envelope[field.name] = field.value;
		} else {
			notes.push(`field outside a finding record: ${field.name}`);
		}
	}

	const cards = rawCards.map((raw, index) => finalizeCard(raw, index));
	notes.push(...envelopeNotes(envelope, cards.length));
	return { found: true, envelope, cards, notes };
}

function parseFieldLine(line) {
	const match = FIELD_LINE.exec(line);
	if (match === null) return null;
	return { indent: match[1].length, name: match[2], value: match[3].trim() };
}

function envelopeNotes(envelope, cardCount) {
	const notes = [];
	if (envelope.protocol === null) {
		notes.push("the block has no protocol line");
	} else if (envelope.protocol !== PROTOCOL) {
		notes.push(`the block protocol is ${envelope.protocol}, expected ${PROTOCOL}`);
	}
	if (envelope.verdict === null) {
		notes.push("the block has no verdict line");
	} else if (!VERDICTS.includes(envelope.verdict)) {
		notes.push(`the block verdict is ${envelope.verdict}, expected pass or needs-changes`);
	} else if (envelope.verdict === "pass" && cardCount > 0) {
		notes.push(`the block verdict is pass but it holds ${cardCount} finding record(s)`);
	} else if (envelope.verdict === "needs-changes" && cardCount === 0) {
		notes.push("the block verdict is needs-changes but it holds no finding record");
	}
	return notes;
}

function finalizeCard(raw, index) {
	const card = {
		index,
		priority: null,
		path: null,
		side: null,
		line: null,
		quote: null,
		title: null,
		impact: null,
		dropReason: null,
		dropDetail: null,
	};
	for (const name of CARD_FIELDS) {
		const value = raw.fields[name];
		if (value === undefined) continue;
		if (name === "line") {
			card.line = /^[0-9]+$/.test(value) ? Number(value) : null;
			continue;
		}
		card[name] = value;
	}
	const missing = CARD_FIELDS.filter((name) => {
		const value = card[name];
		return value === null || value === undefined || value === "";
	});
	if (raw.unknown.length > 0) {
		card.dropReason = REASON_UNKNOWN_FIELD;
		card.dropDetail = `a finding record may not carry: ${raw.unknown.join(", ")}`;
	} else if (missing.length > 0) {
		card.dropReason = REASON_MISSING_FIELD;
		card.dropDetail = `a finding record is missing: ${missing.join(", ")}`;
	} else if (!PRIORITIES.includes(card.priority)) {
		card.dropReason = REASON_MISSING_FIELD;
		card.dropDetail = `priority must be P0, P1, P2 or P3, got: ${card.priority}`;
	} else if (card.line === null || card.line < 1) {
		card.dropReason = REASON_MISSING_FIELD;
		card.dropDetail = `line must be a positive integer, got: ${raw.fields.line}`;
	} else if (!SIDES.includes(card.side)) {
		card.dropReason = REASON_INVALID_SIDE;
		card.dropDetail = `side must be new or old, got: ${card.side}`;
	}
	return card;
}

/**
 * Build the changed line index out of a unified diff.
 *
 * Every file contributes the lines the change added (new side) and the lines it
 * removed (old side), each with its line number and its text. The old path of a
 * renamed file is kept as an alias that only resolves for `side: old`.
 */
export function parseUnifiedDiff(text) {
	const source = typeof text === "string" ? text : "";
	const lines = source.split(/\r?\n/);
	const files = [];
	let current = null;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (line.startsWith("diff --git ")) {
			if (current !== null) files.push(current);
			current = { oldPath: null, newPath: null, old: new Map(), new: new Map() };
			continue;
		}
		if (current === null) continue;
		if (line.startsWith("rename from ")) {
			current.oldPath = decodeRenamePath(line.slice("rename from ".length));
			continue;
		}
		if (line.startsWith("rename to ")) {
			current.newPath = decodeRenamePath(line.slice("rename to ".length));
			continue;
		}
		if (line.startsWith("--- ")) {
			current.oldPath = decodeDiffPath(line.slice(4));
			continue;
		}
		if (line.startsWith("+++ ")) {
			current.newPath = decodeDiffPath(line.slice(4));
			continue;
		}
		const hunk = HUNK_HEADER.exec(line);
		if (hunk === null) continue;
		index = readHunk(lines, index + 1, hunk, current);
	}
	if (current !== null) files.push(current);

	const byNewPath = new Map();
	const byOldPath = new Map();
	for (const file of files) {
		if (file.newPath !== null) byNewPath.set(file.newPath, file);
		if (file.oldPath !== null) byOldPath.set(file.oldPath, file);
	}
	return { files, byNewPath, byOldPath };
}

function readHunk(lines, start, header, file) {
	const oldStart = Number(header[1]);
	const oldCount = header[2] === undefined ? 1 : Number(header[2]);
	const newStart = Number(header[3]);
	const newCount = header[4] === undefined ? 1 : Number(header[4]);
	let oldLine = oldStart;
	let newLine = newStart;
	let oldSeen = 0;
	let newSeen = 0;

	for (let index = start; index < lines.length; index += 1) {
		const body = lines[index];
		if (body.startsWith("+")) {
			file.new.set(newLine, body.slice(1));
			newLine += 1;
			newSeen += 1;
		} else if (body.startsWith("-")) {
			file.old.set(oldLine, body.slice(1));
			oldLine += 1;
			oldSeen += 1;
		} else if (body.startsWith("\\")) {
			continue;
		} else if (body.startsWith(" ") || body === "") {
			oldLine += 1;
			newLine += 1;
			oldSeen += 1;
			newSeen += 1;
		} else {
			return index - 1;
		}
		if (oldSeen >= oldCount && newSeen >= newCount) return index;
	}
	return lines.length;
}

function decodeDiffPath(raw) {
	let value = raw.trim();
	if (value === "/dev/null") return null;
	if (value.startsWith('"') && value.endsWith('"')) value = unquoteDiffPath(value);
	if (value.startsWith("a/") || value.startsWith("b/")) value = value.slice(2);
	return value === "" ? null : value;
}

function decodeRenamePath(raw) {
	const value = raw.trim();
	if (value.startsWith('"') && value.endsWith('"')) return unquoteDiffPath(value);
	return value === "" ? null : value;
}

function unquoteDiffPath(value) {
	const inner = value.slice(1, -1);
	const bytes = [];
	for (let index = 0; index < inner.length; index += 1) {
		const char = inner[index];
		if (char !== "\\") {
			bytes.push(...Buffer.from(char, "utf8"));
			continue;
		}
		const next = inner[index + 1];
		if (next === undefined) break;
		index += 1;
		if (next === "n") bytes.push(10);
		else if (next === "t") bytes.push(9);
		else if (next === "r") bytes.push(13);
		else if (next === "b") bytes.push(8);
		else if (next === "f") bytes.push(12);
		else if (next === "v") bytes.push(11);
		else if (next === '"') bytes.push(34);
		else if (next === "\\") bytes.push(92);
		else if (next >= "0" && next <= "7") {
			let octal = next;
			while (octal.length < 3 && inner[index + 1] >= "0" && inner[index + 1] <= "7") {
				octal += inner[index + 1];
				index += 1;
			}
			bytes.push(parseInt(octal, 8));
		} else {
			bytes.push(...Buffer.from(next, "utf8"));
		}
	}
	return Buffer.from(bytes).toString("utf8");
}

/**
 * Match every card against the changed line index.
 *
 * A card is proven when its quote is a line the change touched on the path and
 * the side the card names. When the quote is not there, the whole index is
 * searched once: a single hit relocates the card, several hits make it
 * ambiguous, no hit drops it.
 */
export function matchCards(index, cards) {
	const matched = [];
	for (const card of cards) {
		if (card.dropReason !== null) {
			matched.push({
				...card,
				state: "dropped",
				reason: card.dropReason,
				detail: card.dropDetail,
				relocated: false,
				claimed: { path: card.path, side: card.side, line: card.line },
			});
			continue;
		}
		const own = findOnPath(index, card.path, card.side, card.quote);
		if (own.length === 1) {
			matched.push(provenCard(card, own[0], false));
			continue;
		}
		if (own.length > 1) {
			matched.push(
				droppedCard(
					card,
					REASON_AMBIGUOUS,
					`the quote is on ${own.length} changed lines of ${card.path} (${card.side})`,
				),
			);
			continue;
		}
		const everywhere = findEverywhere(index, card.quote);
		if (everywhere.length === 1) {
			matched.push(provenCard(card, everywhere[0], true));
			continue;
		}
		if (everywhere.length > 1) {
			matched.push(
				droppedCard(card, REASON_AMBIGUOUS, `the quote is on ${everywhere.length} changed lines of the change`),
			);
			continue;
		}
		matched.push(droppedCard(card, REASON_NOT_FOUND, "the quote is not a line this change touched"));
	}
	return matched;
}

function provenCard(card, location, relocated) {
	return {
		...card,
		state: "proven",
		reason: null,
		detail: null,
		path: location.path,
		side: location.side,
		line: location.line,
		relocated,
		claimed: { path: card.path, side: card.side, line: card.line },
	};
}

function droppedCard(card, reason, detail) {
	return {
		...card,
		state: "dropped",
		reason,
		detail,
		relocated: false,
		claimed: { path: card.path, side: card.side, line: card.line },
	};
}

function findOnPath(index, path, side, quote) {
	const file = side === "old" ? index.byOldPath.get(path) : index.byNewPath.get(path);
	if (file === undefined) return [];
	const lines = side === "old" ? file.old : file.new;
	const found = [];
	for (const [line, text] of lines) {
		if (text.trim() === quote.trim()) {
			found.push({ path: side === "old" ? file.oldPath : file.newPath, side, line });
		}
	}
	return found;
}

function findEverywhere(index, quote) {
	const found = [];
	for (const file of index.files) {
		for (const [line, text] of file.new) {
			if (text.trim() === quote.trim()) found.push({ path: file.newPath, side: "new", line });
		}
		for (const [line, text] of file.old) {
			if (text.trim() === quote.trim()) found.push({ path: file.oldPath, side: "old", line });
		}
	}
	return found;
}

/**
 * Group the proven cards by path, side and line. Cards that share a group are
 * one finding, and the finding lists the passes that reported it.
 */
export function groupFindings(matched) {
	const groups = new Map();
	for (const card of matched) {
		if (card.state !== "proven") continue;
		const key = `${card.path}\u0000${card.side}\u0000${card.line}`;
		let group = groups.get(key);
		if (group === undefined) {
			group = { path: card.path, side: card.side, line: card.line, cards: [], passes: [] };
			groups.set(key, group);
		}
		group.cards.push(card);
		if (!group.passes.includes(card.pass)) group.passes.push(card.pass);
	}
	const findings = [];
	for (const group of groups.values()) {
		const best = group.cards.reduce((left, right) =>
			priorityRank(left.priority) <= priorityRank(right.priority) ? left : right,
		);
		findings.push({
			path: group.path,
			side: group.side,
			line: group.line,
			priority: best.priority,
			title: best.title,
			impact: best.impact,
			passes: group.passes,
		});
	}
	findings.sort((left, right) => {
		const byPriority = priorityRank(left.priority) - priorityRank(right.priority);
		if (byPriority !== 0) return byPriority;
		if (left.path !== right.path) return left.path < right.path ? -1 : 1;
		return left.line - right.line;
	});
	return findings;
}

function priorityRank(priority) {
	const rank = PRIORITIES.indexOf(priority);
	return rank === -1 ? PRIORITIES.length : rank;
}

/**
 * Verify the cards of every review against the diff text of the scoped change.
 *
 * This is the pure core of the program: no git, no file system. The command
 * line feeds it the diff text and the review texts and reads the result.
 */
export function verify({ diffText, reviews, repo = "", scope = "", head = "", blocked = false }) {
	const passes = [];
	const notes = [];
	const cards = [];

	for (const review of reviews) {
		const parsed = parseFindingsBlock(review.text);
		passes.push({
			pass: review.pass,
			cards: parsed.cards.length,
			envelope: parsed.envelope,
			found: parsed.found,
		});
		for (const note of parsed.notes) notes.push(`${review.pass}: ${note}`);
		if (!parsed.found) continue;
		parsed.cards.forEach((card, position) => {
			cards.push({ ...card, pass: review.pass, key: `${review.pass}#${position + 1}` });
		});
	}

	let matched;
	if (blocked) {
		matched = cards.map((card) => ({
			...card,
			state: "unverified",
			reason: null,
			detail: null,
			relocated: false,
			claimed: { path: card.path, side: card.side, line: card.line },
		}));
	} else {
		matched = matchCards(parseUnifiedDiff(diffText), cards);
	}

	const findings = blocked ? [] : groupFindings(matched);
	const produced = matched.length;
	const dropped = matched.filter((card) => card.state === "dropped").length;
	const proven = blocked ? 0 : produced - dropped;
	const status = blocked ? "blocked" : dropped > 0 ? "partial" : "verified";

	return {
		status,
		repo,
		scope,
		head,
		produced,
		proven,
		dropped,
		merged: blocked ? 0 : proven - findings.length,
		findings: findings.length,
		cards: matched,
		findingGroups: findings,
		passes,
		notes,
	};
}

/**
 * The digest a human and an agent can both read.
 */
export function renderDigest(result) {
	const lines = [];
	lines.push("thermos-validate");
	lines.push(`repo:  ${result.repo}`);
	lines.push(`scope: ${result.scope}`);
	lines.push(`head:  ${result.head === "" ? "(no commit)" : result.head}`);
	lines.push(`cards: ${result.passes.map((pass) => `${pass.pass}=${pass.cards}`).join(" ")}`);
	lines.push("");
	for (const card of result.cards) lines.push(formatCardLine(card));
	if (result.notes.length > 0) {
		lines.push("");
		lines.push("notes:");
		for (const note of result.notes) lines.push(`  ${note}`);
	}
	lines.push("");
	lines.push(
		`produced ${result.produced}  proven ${result.proven}  dropped ${result.dropped}  merged ${result.merged}  findings ${result.findings}`,
	);
	lines.push(result.status === "blocked" ? BLOCKED_CLOSING : closingSentence(result));
	return lines.join("\n");
}

function formatCardLine(card) {
	const state = card.state.padEnd(11);
	const claimed = `${card.claimed.path ?? "?"}:${card.claimed.line ?? "?"} (${card.claimed.side ?? "?"})`;
	if (card.state === "proven") {
		const proven = `${card.path}:${card.line} (${card.side})`;
		const moved = card.relocated ? `, relocated from ${claimed}` : "";
		return `${card.key.padEnd(14)}${state}${proven}${moved}  ${card.priority}  ${card.title}`;
	}
	if (card.state === "dropped") {
		return `${card.key.padEnd(14)}${state}${card.reason}  ${claimed}  ${card.priority}  ${card.title}`;
	}
	return `${card.key.padEnd(14)}${state}${claimed}  ${card.priority}  ${card.title}`;
}

function closingSentence(result) {
	const head = result.head === "" ? "an unnamed tree" : result.head;
	return `Proved against ${head}: every reported card points at a line this change touched. Not proved: who wrote a card, because the parent writes the review file, and a card proven against a tree the reviewer never saw is still proven against the tree it names.`;
}

/**
 * The machine readable result.
 */
export function toJsonPayload(result) {
	return {
		status: result.status,
		repo: result.repo,
		scope: result.scope,
		head: result.head,
		produced: result.produced,
		proven: result.proven,
		dropped: result.dropped,
		merged: result.merged,
		findings: result.findings,
		cards: result.cards.map((card) => {
			const payload = {
				key: card.key,
				pass: card.pass,
				state: card.state,
			};
			if (card.state === "dropped") {
				payload.reason = card.reason;
				payload.detail = card.detail;
			}
			payload.path = card.path;
			payload.side = card.side;
			payload.line = card.line;
			payload.priority = card.priority;
			payload.title = card.title;
			payload.impact = card.impact;
			if (card.state === "proven") payload.relocated = card.relocated;
			return payload;
		}),
		findingGroups: result.findingGroups,
	};
}

function runGit(repo, args) {
	const result = spawnSync("git", ["-C", repo, ...args], {
		encoding: "utf8",
		windowsHide: true,
		maxBuffer: 64 * 1024 * 1024,
	});
	return {
		ok: result.status === 0 && result.error === undefined,
		status: result.status,
		stdout: typeof result.stdout === "string" ? result.stdout : "",
		stderr: typeof result.stderr === "string" ? result.stderr : "",
		error: result.error ?? null,
	};
}

function resolveRepository(repo) {
	const result = runGit(repo, ["rev-parse", "--show-toplevel"]);
	if (!result.ok) return null;
	const root = result.stdout.trim();
	if (root === "") return null;
	return resolve(root);
}

function headCommit(repo) {
	const result = runGit(repo, ["rev-parse", "HEAD"]);
	if (!result.ok) return "";
	return result.stdout.trim();
}

export function parseArgs(argv) {
	if (argv.length === 0) throw new Error("a subcommand is required");
	if (argv[0] !== "verify") throw new Error(`unknown subcommand: ${argv[0]}`);
	let repo = process.cwd();
	let scope = "HEAD";
	let jsonPath = null;
	const reviews = [];
	let index = 1;
	while (index < argv.length) {
		const arg = argv[index];
		if (arg !== "--repo" && arg !== "--scope" && arg !== "--review" && arg !== "--json") {
			throw new Error(`unknown argument: ${arg}`);
		}
		const value = argv[index + 1];
		if (value === undefined || value === "" || value.startsWith("--")) {
			throw new Error(`${arg} requires a value`);
		}
		index += 2;
		if (arg === "--repo") {
			repo = value;
		} else if (arg === "--scope") {
			scope = value;
		} else if (arg === "--json") {
			jsonPath = value;
		} else {
			const split = value.indexOf("=");
			if (split <= 0 || split === value.length - 1) {
				throw new Error(`--review expects <label>=<file>, got: ${value}`);
			}
			const label = value.slice(0, split);
			const file = value.slice(split + 1);
			if (reviews.some((review) => review.label === label)) {
				throw new Error(`duplicate review label: ${label}`);
			}
			reviews.push({ label, file });
		}
	}
	if (reviews.length === 0) throw new Error("at least one --review is required");
	return { repo, scope, reviews, jsonPath };
}

function readReviewFiles(reviews) {
	return reviews.map((review) => {
		let text;
		try {
			text = readFileSync(resolve(review.file), "utf8");
		} catch (error) {
			throw new Error(`review file ${review.file} could not be read: ${error.message}`);
		}
		return { pass: review.label, text };
	});
}

export function main(argv) {
	let options;
	try {
		options = parseArgs(argv);
	} catch (error) {
		process.stderr.write(`thermos-validate: usage error: ${error.message}. Usage: ${USAGE}\n`);
		return 2;
	}

	const repoRoot = resolveRepository(options.repo);
	if (repoRoot === null) {
		process.stderr.write(`thermos-validate: blocked: ${options.repo} is not inside a git repository.\n`);
		return 3;
	}

	let reviews;
	try {
		reviews = readReviewFiles(options.reviews);
	} catch (error) {
		process.stderr.write(`thermos-validate: unusable: ${error.message}\n`);
		return 4;
	}

	const parsedReviews = reviews.map((review) => ({
		pass: review.pass,
		found: parseFindingsBlock(review.text).found,
	}));
	const unusable = parsedReviews.find((review) => !review.found);
	if (unusable !== undefined) {
		process.stderr.write(`thermos-validate: unusable: review ${unusable.pass} holds no readable findings block.\n`);
		return 4;
	}

	const scope = options.scope;
	const head = headCommit(repoRoot);
	const diff = runGit(repoRoot, ["diff", "--unified=0", "--no-color", scope]);
	const blocked = !diff.ok;
	const result = verify({
		diffText: diff.stdout,
		reviews,
		repo: repoRoot,
		scope,
		head,
		blocked,
	});
	if (blocked) {
		const reason = diff.error !== null ? diff.error.message : diff.stderr.split(/\r?\n/)[0];
		result.notes.push(`the diff command failed for scope ${scope}: ${reason}`);
	}

	process.stdout.write(`${renderDigest(result)}\n`);

	if (options.jsonPath !== null) {
		const target = resolve(options.jsonPath);
		try {
			mkdirSync(dirname(target), { recursive: true });
			writeFileSync(target, `${JSON.stringify(toJsonPayload(result), null, 2)}\n`, "utf8");
		} catch (error) {
			process.stderr.write(
				`thermos-validate: usage error: the json result could not be written to ${options.jsonPath}: ${error.message}\n`,
			);
			return 2;
		}
	}

	if (blocked) {
		process.stderr.write(`thermos-validate: blocked: the changed line index could not be built for scope ${scope}.\n`);
		return 3;
	}
	return result.dropped > 0 ? 1 : 0;
}

function isDirectRun() {
	const entry = process.argv[1];
	if (entry === undefined) return false;
	const script = fileURLToPath(import.meta.url);
	const resolved = resolve(entry);
	if (resolved === script) return true;
	return process.platform === "win32" && resolved.toLowerCase() === script.toLowerCase();
}

if (isDirectRun()) {
	process.exitCode = main(process.argv.slice(2));
}
