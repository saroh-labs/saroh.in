// The motion check (plan U17, DEC-172): what it fails, what it lets
// through, and that the CLI exits non-zero on a tree holding a 600 ms
// animation. Run by `pnpm run check:site-motion`.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    checkSiteMotion,
    motionProblems,
    scaleProblems,
    stripComments,
} from "./check-site-motion.mjs";

const SCRIPT = join(import.meta.dirname, "check-site-motion.mjs");
const rules = (source) => motionProblems(source).map((p) => p.rule);

/** A tree with one site-blocks file, for the CLI and `checkSiteMotion`. */
function fixtureTree(name, source) {
    const root = mkdtempSync(join(tmpdir(), "site-motion-"));
    const dir = join(root, "packages/site-blocks/src");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), source);
    return root;
}

test("the CLI fails a fixture containing animation-duration: 600ms", () => {
    const root = fixtureTree(
        "slow.css",
        ".site-hero { animation-name: unmask; animation-duration: 600ms; }\n",
    );
    try {
        const run = spawnSync(process.execPath, [SCRIPT], {
            cwd: root,
            encoding: "utf8",
        });
        assert.equal(run.status, 1);
        assert.match(run.stderr, /slow\.css:1/);
        assert.match(run.stderr, /600ms is longer than 200ms/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("the CLI passes the same tree at 200ms", async () => {
    const root = fixtureTree(
        "ok.css",
        ".site-hero { animation-duration: 200ms; }\n",
    );
    try {
        assert.deepEqual(await checkSiteMotion(root), []);
        execFileSync(process.execPath, [SCRIPT], { cwd: root });
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("durations over 200ms, however they are written", () => {
    for (const source of [
        "animation-duration: 600ms;",
        "transition-duration: 0.3s;",
        "animation: site-rise 600ms var(--site-ease) both;",
        "transition: color 140ms ease, opacity 400ms ease;",
        'cn("transition-opacity duration-300")',
        'cn("duration-[600ms]")',
        'cn("duration-[var(--site-motion-slow,500ms)]")',
        'cn("animate-[rise_700ms_ease-out]")',
        "--site-motion-slow: 600ms;",
        '["--site-motion-slow", "250ms"]',
    ])
        assert.deepEqual(rules(source), ["duration"], source);
});

test("200ms or less, and an interpolated value, pass", () => {
    for (const source of [
        "animation-duration: 1ms;",
        "animation: site-menu-in 180ms var(--site-ease) both;",
        "animation: site-rise ${m.slow}ms var(--site-ease) backwards;",
        'cn("transition-colors duration-150")',
        'cn("duration-[var(--site-motion-base,140ms)]")',
        '["--site-motion-slow", `${motion.slow}ms`]',
    ])
        assert.deepEqual(rules(source), [], source);
});

test("a delay is a wait, not a motion (U15's 300ms loading hold)", () => {
    for (const source of [
        "animation-name: site-held; animation-duration: 1ms; animation-delay: 300ms;",
        "transition-delay: 500ms;",
        "animation: site-fade-in 120ms ease 400ms both;",
        'cn("transition-opacity duration-150 delay-500")',
    ])
        assert.deepEqual(rules(source), [], source);
});

test("loops", () => {
    for (const source of [
        "animation: spin 150ms linear infinite;",
        "animation-iteration-count: infinite;",
        'cn("animate-spin")',
        'cn("grid animate-pulse gap-3")',
        "el.animate(frames, { duration: 150, iterations: Infinity });",
    ])
        assert.ok(rules(source).includes("loop"), source);
    // A selector that stops the pulse is not one.
    assert.deepEqual(rules("${at} .animate-pulse { animation: none; }"), []);
    assert.deepEqual(rules('cn("motion-reduce:animate-none")'), []);
});

test("overshooting easing", () => {
    for (const source of [
        "transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);",
        'cn("[transition-timing-function:cubic-bezier(0.5,-0.4,0.5,1)]")',
        "animation-timing-function: linear(0, 1.2 60%, 1);",
        "transition: { ease: easeOutBack }",
        'transition: { type: "spring" }',
    ])
        assert.ok(rules(source).includes("overshoot"), source);
    for (const source of [
        "--site-ease: cubic-bezier(0.2, 0.8, 0.2, 1);",
        'cn("[transition-timing-function:cubic-bezier(0.22,1,0.36,1)]")',
        "background: linear-gradient(0deg, red, blue);",
        "animation-timing-function: linear(0, 0.4 30%, 1);",
    ])
        assert.deepEqual(rules(source), [], source);
});

test("scroll-linked motion", () => {
    for (const source of [
        "animation-timeline: view();",
        "animation-timeline: scroll(root);",
        "background-attachment: fixed;",
        'cn("bg-fixed bg-cover")',
        "const { scrollY } = useScroll();",
        'window.addEventListener("scroll", () => { el.style.transform = `translateY(${window.scrollY / 3}px)`; });',
    ])
        assert.ok(rules(source).includes("scroll"), source);
    // Reading the scroll to dock a banner or mark an edge moves nothing.
    assert.deepEqual(
        rules(
            'window.addEventListener("scroll", soon, { passive: true }); root.style.setProperty("--site-consent-offset", "0px");',
        ),
        [],
    );
});

test("comments never trip it, and lines still count", () => {
    const source = [
        "/**",
        " * The boards drew a 600ms unmask on an infinite loop; cut (KD5).",
        " * animation-timeline: view() is Classic's.",
        " */",
        "// duration-700 was the old hover",
        'const a = "https://example.com/a"; // animate-spin here is a note',
        "animation-duration: 900ms;",
    ].join("\n");
    assert.equal(stripComments(source).split("\n").length, 7);
    const found = motionProblems(source);
    assert.deepEqual(
        found.map((p) => [p.rule, p.line]),
        [["duration", 7]],
    );
});

test("the looks' MOTION scale stays at 200ms or less", () => {
    const ok =
        "const MOTION: LookMotion = { fast: 100, base: 140, slow: 200, ceiling: 200, rise: 8 };";
    assert.deepEqual(scaleProblems(ok), []);
    const slow = ok.replace("slow: 200", "slow: 600");
    assert.equal(scaleProblems(slow).length, 1);
    assert.match(scaleProblems(slow)[0], /MOTION\.slow is 600ms/);
    assert.equal(scaleProblems("export const LOOKS = {};").length, 1);
});

test("the repository passes, with every Classic exception still in use", async () => {
    const root = join(import.meta.dirname, "..");
    assert.deepEqual(await checkSiteMotion(root), []);
});
