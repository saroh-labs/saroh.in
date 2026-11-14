// The release check (plan 2026-11-13-002, U15). For each saroh.in release
// switch an environment turns on, everything gated on it must be ready:
//
// - its feature page (`content/features.ts`), its other pages (/developers,
//   the Claude and ChatGPT integration pages), its help articles (`feature:`)
//   and its changelog entry (`waitsFor`, moved out of WAITING_ENTRIES with
//   its day) exist;
// - none of its shots is a pending placeholder: the feature page's hero and
//   step shots (a drawn chat needs none) and its help steps' `shot`s must be
//   in `shots.captured.ts`;
// - the claims ledger has its section (`(`key`)` in a `###` heading under
//   "Release visibility") with rows, and none of them is Not backed;
// - the app's HELP_ARTICLES has no entry still `waitsFor` it;
// - `developers` is never on while `docs` is off.
//
// Always, whatever is on: no changelog entry, help article or Resources page
// behind an off switch carries a future `publishOn` (legal pages publish by
// date and are exempt), and every AI-app card offered (`liveOnDev: true`)
// has its help, with the app's list agreeing on which apps are offered.
//
// Reads repo files only, never the network.
//
//   node scripts/check-feature-release.mjs                  production's switches
//   node scripts/check-feature-release.mjs --env dev        the dev environment's
//   node scripts/check-feature-release.mjs --feature ask-ai as if ask-ai were on
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = "apps/saroh.in";
export const FILES = {
    switches: "packages/marketing/src/content/feature-switches.ts",
    wrangler: `${SITE}/wrangler.jsonc`,
    features: `${SITE}/content/features.ts`,
    captured: `${SITE}/content/shots.captured.ts`,
    changelog: `${SITE}/content/changelog.ts`,
    resources: `${SITE}/content/resources.ts`,
    integrations: `${SITE}/content/integrations.ts`,
    help: `${SITE}/content/help`,
    ledger: "docs/architecture/MARKETING_CLAIMS.md",
    appHelp: "apps/app.saroh.in/lib/help/links.ts",
    appAiApps: "apps/app.saroh.in/lib/ai-connections/mcp-address.ts",
};

/** Pages besides a feature page that a switch builds. */
const PAGES = {
    "ai-apps": [
        `${SITE}/content/integrations/claude.mdx`,
        `${SITE}/content/integrations/chatgpt.mdx`,
    ],
    developers: [`${SITE}/app/(site)/developers/page.tsx`],
    templates: [`${SITE}/app/(site)/templates/page.tsx`],
};
/** The switches that must ship with help articles and a changelog entry. */
const ANNOUNCED = ["ai-apps", "ask-ai", "social", "developers"];

/** JSON with comments: drops `//` and block comments outside strings, and trailing commas. */
export function parseJsonc(text) {
    let out = "";
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            let j = i + 1;
            while (j < text.length && text[j] !== '"')
                j += text[j] === "\\" ? 2 : 1;
            out += text.slice(i, j + 1);
            i = j;
        } else if (c === "/" && text[i + 1] === "/") {
            while (i < text.length && text[i] !== "\n") i++;
            out += "\n";
        } else if (c === "/" && text[i + 1] === "*") {
            i = text.indexOf("*/", i + 2) + 1;
        } else out += c;
    }
    return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

/** `RELEASE_SWITCHES`: key → variable. */
export function releaseSwitches(source) {
    const block =
        source.match(/RELEASE_SWITCHES = \{([\s\S]*?)\} as const/)?.[1] ?? "";
    return Object.fromEntries(
        [...block.matchAll(/^\s*"?([\w-]+)"?: "(NEXT_PUBLIC_\w+)"/gm)].map(
            (m) => [m[1], m[2]],
        ),
    );
}

/** The switch keys a vars object turns on. */
export function switchesOn(vars, switches) {
    return Object.keys(switches).filter(
        (key) => vars?.[switches[key]] === "on",
    );
}

/** The text of an object entry `key: {` at `indent` spaces, to the next sibling. */
function entryBlock(source, key, indent) {
    const pad = " ".repeat(indent);
    const start = source.search(new RegExp(`^${pad}"?${key}"?: \\{$`, "m"));
    if (start < 0) return null;
    const rest = source.slice(start + 1);
    const end = rest.search(
        new RegExp(`^${pad}(?:"?[\\w-]+"?: \\{$|\\};?$)`, "m"),
    );
    return end < 0 ? rest : rest.slice(0, end);
}

/** A feature page's shots that are drawn as images: the hero unless `heroChat`, each step's unless `chat`. */
export function featureShots(featuresSource, slug) {
    const block = entryBlock(featuresSource, slug, 4);
    if (block === null) return null;
    const shots = [];
    const hero = block.match(/^ {8}hero: \{ shot: "([^"]+)"/m)?.[1];
    if (hero && !/^ {8}heroChat: \{/m.test(block)) shots.push(hero);
    const steps = block.match(/^ {8}steps: \[\n([\s\S]*?)^ {8}\],/m)?.[1] ?? "";
    for (const step of steps.split(/^ {12}\{$/m)) {
        const shot = step.match(/^ {16}shot: "([^"]+)"/m)?.[1];
        if (shot && !/^ {16}chat: \{/m.test(step)) shots.push(shot);
    }
    return shots;
}

/** The captured shot keys. */
export function capturedKeys(source) {
    return new Set(
        [...source.matchAll(/^ {4}"([^"]+)": \{/gm)].map((m) => m[1]),
    );
}

/** Help articles' frontmatter fields the check reads, by slug. */
export function helpArticle(text) {
    const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    const field = (name) =>
        fm.match(new RegExp(`^${name}:\\s*"?([^"\\s#]+)"?`, "m"))?.[1];
    return {
        slug: field("slug"),
        feature: field("feature"),
        publishOn: field("publishOn"),
        shots: [...fm.matchAll(/^\s+shot:\s*"?([\w-]+)"?/gm)].map((m) => m[1]),
        anchors: new Set(
            [...fm.matchAll(/^\s+(?:- )?(?:id|anchor):\s*"?([\w-]+)"?/gm)].map(
                (m) => m[1],
            ),
        ),
    };
}

/** The `{ … }` items of the array after `marker`, at `indent` spaces. */
function arrayItems(source, marker, indent) {
    const at = source.indexOf(marker);
    if (at < 0) return [];
    const rest = source.slice(at);
    const body = rest.slice(0, rest.search(/^\];/m));
    return body.split(new RegExp(`^ {${indent}}\\{$`, "m")).slice(1);
}

/** Changelog entries: `{slug, publishOn?, waitsFor?, waiting}`. */
export function changelogEntries(source) {
    const read = (marker, waiting) =>
        arrayItems(source, marker, 4).map((item) => ({
            slug: item.match(/^ {8}slug: "([^"]+)"/m)?.[1],
            publishOn: item.match(/^ {8}publishOn: "([^"]+)"/m)?.[1],
            waitsFor: item.match(/^ {8}waitsFor: "([^"]+)"/m)?.[1],
            waiting,
        }));
    return [
        ...read("export const CHANGELOG_ENTRIES", false),
        ...read("export const WAITING_ENTRIES", true),
    ];
}

/** `RESOURCE_PAGES`' ids and days (not LEGAL_PAGES). */
export function resourcePages(source) {
    return arrayItems(source, "export const RESOURCE_PAGES", 4).map((item) => ({
        id: item.match(/^ {8}id: "([^"]+)"/m)?.[1],
        publishOn: item.match(/^ {8}publishOn: "([^"]+)"/m)?.[1],
    }));
}

/** The AI-app cards: `{slug, href, liveOnDev}`. */
export function aiAppCards(source) {
    return arrayItems(source, "export const liveIntegrations", 4)
        .filter((item) => /^ {8}category: "AI apps"/m.test(item))
        .map((item) => ({
            slug: item.match(/^ {8}slug: "([^"]+)"/m)?.[1],
            href: item.match(/^ {8}href: "([^"]+)"/m)?.[1],
            liveOnDev: /^ {8}liveOnDev: true/m.test(item),
        }));
}

/** The app's offered AI apps (`AI_APPS` with `liveOnDev: true`). */
export function appLiveAiApps(source) {
    const live = [
        ...source.matchAll(/key: "([\w-]+)",[^}]*?liveOnDev: true/gs),
    ].map((m) => m[1]);
    return new Set(live);
}

/** The app's help entries still waiting: slug → switch. */
export function appWaitingHelp(source) {
    return [
        ...source.matchAll(/\{\s*slug: "([^"]+)",[^}]*?waitsFor: "([^"]+)"/gs),
    ].map((m) => ({
        slug: m[1],
        waitsFor: m[2],
    }));
}

/** The ledger's release-visibility rows for a switch: `{id, claim, status}`, or null without a section. */
export function ledgerRows(ledger, key) {
    const heading = new RegExp(`^### .*\\(\`${key}\`\\)\\s*$`, "m");
    const at = ledger.search(heading);
    if (at < 0) return null;
    const rest = ledger.slice(at).split("\n").slice(1);
    const end = rest.findIndex((l) => /^#{2,3} /.test(l));
    return (end < 0 ? rest : rest.slice(0, end))
        .filter((l) => /^\| [A-Z]+\d+ /.test(l))
        .map((l) => {
            const cells = l.split("|").map((c) => c.trim());
            return { id: cells[1], claim: cells[2], status: cells[4] };
        });
}

/**
 * Every problem for the switches `on`, given the repo's sources (see
 * `readSources`), and today's day in India.
 */
export function checkRelease(src, on, today) {
    const errors = [];
    const off = Object.keys(src.switches).filter((k) => !on.includes(k));
    const captured = capturedKeys(src.captured);
    const changelog = changelogEntries(src.changelog);
    const articles = src.help.map(helpArticle);

    for (const key of on) {
        const at = `${key}:`;
        // Pages.
        const shots = featureShots(src.features, key);
        if (shots === null && /^(ai-apps|ask-ai|social)$/.test(key)) {
            errors.push(`${at} no feature page in ${FILES.features}`);
        }
        for (const page of PAGES[key] ?? []) {
            if (!src.exists(page)) errors.push(`${at} ${page} is missing`);
        }
        // Help and shots.
        const help = articles.filter((a) => a.feature === key);
        if (ANNOUNCED.includes(key) && help.length === 0) {
            errors.push(`${at} no help article has feature: ${key}`);
        }
        for (const shot of shots ?? []) {
            if (!captured.has(shot))
                errors.push(
                    `${at} feature shot ${shot} is a placeholder (not captured)`,
                );
        }
        for (const a of help) {
            for (const shot of a.shots) {
                if (!captured.has(shot))
                    errors.push(
                        `${at} help ${a.slug} shot ${shot} is a placeholder (not captured)`,
                    );
            }
        }
        // Changelog.
        const entries = changelog.filter((e) => e.waitsFor === key);
        if (ANNOUNCED.includes(key) && entries.length === 0) {
            errors.push(`${at} no changelog entry waitsFor ${key}`);
        }
        for (const e of entries.filter((e) => e.waiting)) {
            errors.push(
                `${at} changelog ${e.slug} is still in WAITING_ENTRIES: move it to CHANGELOG_ENTRIES with the release day`,
            );
        }
        // Claims: every switch but docs, which only says docs.saroh.in answers.
        const rows = key === "docs" ? [] : ledgerRows(src.ledger, key);
        if (key !== "docs" && (!rows || rows.length === 0)) {
            errors.push(
                `${at} the claims ledger has no rows under a "(\`${key}\`)" heading`,
            );
        } else {
            for (const r of rows) {
                if (
                    r.status === "Not backed" &&
                    !r.claim.startsWith("NOT on")
                ) {
                    errors.push(`${at} claims row ${r.id} is Not backed`);
                }
            }
        }
        // The app's help links.
        for (const h of appWaitingHelp(src.appHelp).filter(
            (h) => h.waitsFor === key,
        )) {
            errors.push(
                `${at} app HELP_ARTICLES ${h.slug} still waitsFor ${key}: drop it in the release commit`,
            );
        }
    }
    if (on.includes("developers") && !on.includes("docs")) {
        errors.push(
            "developers: on while docs is off: deploy docs.saroh.in and turn NEXT_PUBLIC_DOCS on first",
        );
    }

    // Always: nothing dated ahead behind an off switch.
    const ahead = (day) => day !== undefined && day > today;
    for (const e of changelog) {
        if (
            !e.waiting &&
            e.waitsFor &&
            off.includes(e.waitsFor) &&
            ahead(e.publishOn)
        ) {
            errors.push(
                `changelog ${e.slug}: publishOn ${e.publishOn} is ahead while ${e.waitsFor} is off`,
            );
        }
    }
    for (const a of articles) {
        if (a.feature && off.includes(a.feature) && ahead(a.publishOn)) {
            errors.push(
                `help ${a.slug}: publishOn ${a.publishOn} is ahead while ${a.feature} is off`,
            );
        }
    }
    for (const p of resourcePages(src.resources)) {
        if (off.includes(p.id) && ahead(p.publishOn)) {
            errors.push(
                `resources ${p.id}: publishOn ${p.publishOn} is ahead while it is off`,
            );
        }
    }

    // Always: an offered AI app has its help, and both lists offer the same apps.
    const bySlug = new Map(articles.map((a) => [a.slug, a]));
    const cards = aiAppCards(src.integrations);
    for (const card of cards.filter((c) => c.liveOnDev)) {
        const m = card.href?.match(/^\/help\/([\w-]+)#([\w-]+)$/);
        const ok = m
            ? bySlug.get(m[1])?.anchors.has(m[2])
            : bySlug.has(`connect-${card.slug}`);
        if (!ok) {
            errors.push(
                `integrations ${card.slug}: offered (liveOnDev) but ${m ? `${card.href} has no such anchor` : `no help article connect-${card.slug}`}`,
            );
        }
    }
    const appLive = appLiveAiApps(src.appAiApps);
    const siteLive = new Set(
        cards.filter((c) => c.liveOnDev).map((c) => c.slug),
    );
    for (const slug of new Set([...appLive, ...siteLive])) {
        if (appLive.has(slug) !== siteLive.has(slug)) {
            errors.push(
                `AI app ${slug}: liveOnDev differs between ${FILES.integrations} and ${FILES.appAiApps}`,
            );
        }
    }
    return errors;
}

/** The sources `checkRelease` reads, from a checkout at `root`. */
export function readSources(root) {
    const read = (p) => readFileSync(join(root, p), "utf8");
    const helpDir = join(root, FILES.help);
    return {
        switches: releaseSwitches(read(FILES.switches)),
        wrangler: parseJsonc(read(FILES.wrangler)),
        features: read(FILES.features),
        captured: read(FILES.captured),
        changelog: read(FILES.changelog),
        resources: read(FILES.resources),
        integrations: read(FILES.integrations),
        ledger: read(FILES.ledger),
        appHelp: read(FILES.appHelp),
        appAiApps: read(FILES.appAiApps),
        help: readdirSync(helpDir)
            .filter((f) => f.endsWith(".mdx"))
            .map((f) => readFileSync(join(helpDir, f), "utf8")),
        exists: (p) => existsSync(join(root, p)),
    };
}

function main(argv) {
    const arg = (name) => {
        const i = argv.indexOf(name);
        return i < 0 ? undefined : argv[i + 1];
    };
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const src = readSources(root);
    const envName = arg("--env") ?? "production";
    const vars =
        envName === "dev"
            ? src.wrangler.vars
            : src.wrangler.env?.[envName]?.vars;
    if (!vars) {
        console.error(
            `feature-release: no vars for env ${envName} in ${FILES.wrangler}`,
        );
        return 2;
    }
    const on = switchesOn(vars, src.switches);
    const feature = arg("--feature");
    if (feature !== undefined) {
        if (!(feature in src.switches)) {
            console.error(
                `feature-release: unknown --feature ${feature} (${Object.keys(src.switches).join(", ")})`,
            );
            return 2;
        }
        if (!on.includes(feature)) on.push(feature);
    }
    const today = new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
    });
    const errors = checkRelease(src, on, today);
    const what = `${envName}${feature ? ` + ${feature}` : ""} (on: ${on.join(", ") || "none"})`;
    if (errors.length > 0) {
        console.error(
            `feature-release: ${errors.length} problem(s) for ${what}:\n${errors.map((e) => `  ${e}`).join("\n")}`,
        );
        return 1;
    }
    console.log(`feature-release: ready for ${what}`);
    return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2));
}
