#!/usr/bin/env node
/**
 * The motion rule for merchant sites (DEC-172, plan U17, KD5): fade or
 * rise, 200 ms or less, no bounce and no loops, nothing tied to the scroll.
 * The boards drew 500 to 700 ms moments, springs and parallax; this stops
 * them coming back one class at a time.
 *
 * Reads `packages/site-blocks/src` (every `.ts`, `.tsx` and `.css` but the
 * tests) and the looks' motion scale in `packages/block-contract`. Fails:
 *
 *   duration  a motion duration over 200 ms: `duration-300`,
 *             `duration-[600ms]`, `animation-duration`, `transition-duration`,
 *             the first time in an `animation`/`transition` shorthand, a
 *             `--site-*` motion token's value, or the looks' `MOTION` scale.
 *             A DELAY IS NOT A DURATION: `animation-delay`, `delay-*` and the
 *             second time in a shorthand are a wait, not a motion (U15 holds
 *             a loading shape back 300 ms with one; it then appears at once).
 *   loop      `infinite`, `iterations: Infinity`, or Tailwind's looping
 *             `animate-spin|ping|pulse|bounce`.
 *   overshoot a `cubic-bezier()` whose y leaves 0 to 1, a `linear()` stop
 *             outside 0 to 1, a back/elastic/bounce easing, or a spring.
 *   scroll    a scroll-linked animation: `animation-timeline`,
 *             `scroll-timeline`, `view-timeline`, a fixed background
 *             (parallax), `useScroll`, or a scroll listener in a file that
 *             writes a transform from script.
 *
 * Comments are skipped, so a note explaining the rule never trips it.
 *
 * Run from the repo root: `pnpm run check:site-motion`. Its test,
 * `check-site-motion.test.mjs`, proves it fails a 600 ms animation.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** The ceiling, in ms (KD5's slow step). */
export const MAX_MS = 200;

const BLOCKS = "packages/site-blocks/src";
const LOOKS_FILE = "packages/block-contract/src/looks.ts";

/**
 * What predates the looks and stays as it is (DEC-172: Classic keeps
 * working as it did; look code is inert for it). Each entry is one file,
 * one rule and the text it allows, with why. An entry nothing matches any
 * more fails too, so this list only shrinks.
 */
export const ALLOWED = [
    {
        file: "packages/site-blocks/src/site-craft.ts",
        rule: "scroll",
        text: /^animation-timeline$/,
        why: "Classic's sections rise as they scroll in (`motion()`), pinned by classic-pin.test.tsx; under a look `lookMotion()` replaces it and nothing moves on scroll.",
    },
    {
        file: "packages/site-blocks/src/account/parts.tsx",
        rule: "loop",
        text: /^animate-pulse$/,
        why: "Classic's account loading cards breathe; under a look `look-theme.ts` stops every `.animate-pulse` (U15: still shapes, no pulse).",
    },
];

/** Every time value in `text`, in ms. `${…}ms` is not one. */
function times(text) {
    return [...text.matchAll(/(?<![\w.$-])(\d*\.?\d+)(ms|s)\b/g)].map((m) =>
        m[2] === "s" ? Number(m[1]) * 1000 : Number(m[1]),
    );
}

/** Split on top-level commas, so `var(--a, 1ms)` stays whole. */
function splitTop(value) {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < value.length; i++) {
        const c = value[i];
        if (c === "(") depth++;
        else if (c === ")") depth--;
        else if (c === "," && depth === 0) {
            parts.push(value.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(value.slice(start));
    return parts;
}

/**
 * Source with comments blanked, newlines kept so line numbers hold. A `//`
 * after a `:` (an address) is not a comment.
 */
export function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
        .replace(/(^|[^:\\"'`])\/\/.*$/gm, "$1");
}

/** A CSS value: up to the end of the declaration, a class or a string. */
const VALUE = String.raw`([^;}\n\`"'\]]+)`;

/**
 * The motion problems in one file's source, as
 * `{ line, rule, text, message }`. `file` is only for the messages.
 */
export function motionProblems(source) {
    const code = stripComments(source);
    const found = [];
    const at = (index) => code.slice(0, index).split("\n").length;
    const add = (index, rule, text, message) =>
        found.push({ line: at(index), rule, text: text.trim(), message });

    // ---- duration ---------------------------------------------------------
    const tooLong = (index, text, ms) =>
        add(
            index,
            "duration",
            text,
            `${ms}ms is longer than ${MAX_MS}ms (KD5: fade or rise, 200ms or less).`,
        );
    for (const m of code.matchAll(
        new RegExp(
            String.raw`(?<![\w-])(?:animation|transition)-duration\s*:\s*${VALUE}`,
            "g",
        ),
    )) {
        const ms = Math.max(0, ...times(m[1]));
        if (ms > MAX_MS) tooLong(m.index, m[0], ms);
    }
    for (const m of code.matchAll(
        new RegExp(
            String.raw`(?<![\w-])(?:animation|transition)\s*:\s*${VALUE}`,
            "g",
        ),
    )) {
        // Per layer, the first time is the duration; the second, a delay.
        for (const layer of splitTop(m[1])) {
            const ms = times(layer)[0] ?? 0;
            if (ms > MAX_MS) tooLong(m.index, m[0], ms);
        }
    }
    // Tailwind: `duration-300`, `duration-[600ms]`, `duration-[var(--x,140ms)]`.
    for (const m of code.matchAll(/(?<![\w-])duration-(\d+)(?![\w-])/g)) {
        const ms = Number(m[1]);
        if (ms > MAX_MS) tooLong(m.index, m[0], ms);
    }
    for (const m of code.matchAll(/(?<![\w-])duration-\[([^\]\s]+)\]/g)) {
        const ms = Math.max(0, ...times(m[1]));
        if (ms > MAX_MS) tooLong(m.index, m[0], ms);
    }
    // Tailwind's arbitrary animation: `animate-[rise_600ms_ease-out]`.
    for (const m of code.matchAll(/(?<![\w-])animate-\[([^\]\s]+)\]/g)) {
        const ms = times(m[1].replace(/_/g, " "))[0] ?? 0;
        if (ms > MAX_MS) tooLong(m.index, m[0], ms);
    }
    // A `--site-*` motion token set in CSS or as a [name, value] pair.
    for (const m of code.matchAll(
        new RegExp(
            String.raw`(--site-[\w-]*(?:motion|duration)[\w-]*)\s*:\s*${VALUE}`,
            "g",
        ),
    )) {
        const ms = Math.max(0, ...times(m[2]));
        if (ms > MAX_MS) tooLong(m.index, m[0], ms);
    }
    for (const m of code.matchAll(
        /["'`](--site-[\w-]*(?:motion|duration)[\w-]*)["'`]\s*,\s*["'`]([^"'`]*)["'`]/g,
    )) {
        const ms = Math.max(0, ...times(m[2]));
        if (ms > MAX_MS) tooLong(m.index, m[0], ms);
    }

    // ---- loop ---------------------------------------------------------------
    const loop = (index, text) =>
        add(index, "loop", text, "loops forever (DEC-172: no loops).");
    for (const m of code.matchAll(/\binfinite\b/g)) loop(m.index, m[0]);
    for (const m of code.matchAll(/\biterations\s*:\s*Infinity\b/g))
        loop(m.index, m[0]);
    // Not `.animate-pulse` (a selector, as look-theme.ts stops it with).
    for (const m of code.matchAll(
        /(?<![\w.-])animate-(?:spin|ping|pulse|bounce)(?![\w-])/g,
    ))
        loop(m.index, m[0]);

    // ---- overshoot ----------------------------------------------------------
    const overshoot = (index, text) =>
        add(
            index,
            "overshoot",
            text,
            "passes its mark (DEC-172: no bounce; one curve that never goes past 1).",
        );
    for (const m of code.matchAll(/cubic-bezier\(([^)]*)\)/g)) {
        const n = m[1]
            .split(/[\s,_]+/)
            .filter(Boolean)
            .map(Number);
        if (n.length !== 4 || n.some(Number.isNaN)) continue;
        const [, y1, , y2] = n;
        if (y1 < 0 || y1 > 1 || y2 < 0 || y2 > 1) overshoot(m.index, m[0]);
    }
    for (const m of code.matchAll(/(?<![\w-])linear\(([^)]*)\)/g)) {
        const outputs = splitTop(m[1].replace(/_/g, " "))
            .map((stop) => stop.trim().split(/\s+/)[0])
            .map(Number)
            .filter((v) => !Number.isNaN(v));
        if (outputs.some((v) => v < 0 || v > 1)) overshoot(m.index, m[0]);
    }
    for (const m of code.matchAll(
        /\b(?:ease(?:In|Out|InOut)?(?:Back|Elastic|Bounce)|(?:back|elastic|bounce)(?:In|Out|InOut))\b|\btype\s*:\s*["']spring["']/g,
    ))
        overshoot(m.index, m[0]);

    // ---- scroll ---------------------------------------------------------------
    const scroll = (index, text) =>
        add(
            index,
            "scroll",
            text,
            "is tied to the scroll (DEC-172, WV2Motion: nothing moves on scroll, no parallax).",
        );
    for (const m of code.matchAll(
        /\b(?:animation-timeline|scroll-timeline|view-timeline|timeline-scope)\b|background-attachment\s*:\s*fixed|(?<![\w-])bg-fixed(?![\w-])|\buseScroll\s*\(|\bScrollTrigger\b/g,
    ))
        scroll(m.index, m[0]);
    const writesTransform =
        /\.style\.(?:transform|translate|scale|rotate)\b|setProperty\(\s*["'](?:transform|translate|scale|rotate)["']/.test(
            code,
        );
    if (writesTransform) {
        for (const m of code.matchAll(
            /addEventListener\(\s*["']scroll["']|\bonScroll\s*=/g,
        ))
            scroll(m.index, `${m[0]} with a transform written from script`);
    }

    return found;
}

/**
 * The looks' motion scale (`MOTION` in block-contract's looks.ts), which
 * `look-theme.ts` writes as `--site-motion-fast|base|slow`.
 */
export function scaleProblems(source) {
    const block = /const MOTION\b[^=]*=\s*\{([^}]*)\}/.exec(
        stripComments(source),
    );
    if (!block)
        return [
            "no `const MOTION = { … }` found: the looks' motion scale moved, so this check can't read it.",
        ];
    const problems = [];
    for (const m of block[1].matchAll(
        /\b(fast|base|slow|ceiling)\s*:\s*(\d+)/g,
    )) {
        if (Number(m[2]) > MAX_MS)
            problems.push(
                `MOTION.${m[1]} is ${m[2]}ms, over ${MAX_MS}ms: it becomes --site-motion-${m[1]}.`,
            );
    }
    return problems;
}

async function* walk(dir) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (
                ["node_modules", "dist", ".turbo", "__snapshots__"].includes(
                    entry.name,
                )
            )
                continue;
            yield* walk(full);
        } else if (
            /\.(?:tsx?|css)$/.test(entry.name) &&
            !/\.test\.tsx?$/.test(entry.name)
        ) {
            yield full;
        }
    }
}

/** Every failure under `root`, as printable lines. */
export async function checkSiteMotion(root) {
    const failures = [];
    const used = new Set();
    for await (const file of walk(join(root, BLOCKS))) {
        const rel = relative(root, file);
        const source = await readFile(file, "utf8");
        for (const p of motionProblems(source)) {
            const allow = ALLOWED.find(
                (a) =>
                    a.file === rel && a.rule === p.rule && a.text.test(p.text),
            );
            if (allow) {
                used.add(allow);
                continue;
            }
            failures.push(
                `${p.rule.padEnd(9)} ${rel}:${p.line}  "${p.text}" ${p.message}`,
            );
        }
    }
    let looks = null;
    try {
        looks = await readFile(join(root, LOOKS_FILE), "utf8");
    } catch {
        // A tree without block-contract (the test's fixtures) has no scale.
    }
    if (looks !== null)
        for (const p of scaleProblems(looks))
            failures.push(`duration  ${LOOKS_FILE}  ${p}`);
    for (const a of ALLOWED) {
        if (used.has(a) || !(await exists(join(root, a.file)))) continue;
        failures.push(
            `allowed   ${a.file}  nothing matches its ${a.rule} entry any more: take it out of ALLOWED.`,
        );
    }
    return failures;
}

async function exists(path) {
    try {
        await readFile(path);
        return true;
    } catch {
        return false;
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const failures = await checkSiteMotion(process.cwd());
    if (failures.length > 0) {
        console.error(`check-site-motion: ${failures.length} problem(s)\n`);
        for (const f of failures) console.error(`  ${f}`);
        process.exit(1);
    }
    console.log(
        `check-site-motion: site-blocks moves for ${MAX_MS}ms or less, with no loop, no overshoot and nothing on scroll; ${ALLOWED.length} Classic exception(s).`,
    );
}
