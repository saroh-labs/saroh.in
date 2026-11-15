import assert from "node:assert/strict";
import { test } from "node:test";

import {
    checkRelease,
    featureShots,
    parseJsonc,
    releaseSwitches,
    switchesOn,
} from "./check-feature-release.mjs";

const SWITCHES = `export const RELEASE_SWITCHES = {
    templates: "NEXT_PUBLIC_TEMPLATES",
    "ai-apps": "NEXT_PUBLIC_AI_APPS",
    "ask-ai": "NEXT_PUBLIC_ASK_AI",
    social: "NEXT_PUBLIC_SOCIAL",
    developers: "NEXT_PUBLIC_DEVELOPERS",
    /** docs.saroh.in answers. */
    docs: "NEXT_PUBLIC_DOCS",
} as const;`;

const FEATURES = `export const features = {
    "ai-apps": {
        slug: "ai-apps",
        hero: { shot: "ai-hero" },
        heroChat: {
            ask: "Add a section.",
        },
        steps: [
            {
                title: "Add Saroh",
                shot: "ai-connect",
            },
            {
                title: "Ask",
                shot: "ai-ask",
                chat: {
                    ask: "Move it.",
                },
            },
        ],
        points: [],
    },
    "ask-ai": {
        slug: "ask-ai",
        hero: { shot: "ask-hero" },
        steps: [
            {
                title: "Open",
                shot: "ask-start",
            },
        ],
    },
    social: {
        slug: "social",
        hero: { shot: "sh-sheet" },
        steps: [],
    },
};`;

const captured = (...keys) =>
    `export const CAPTURED = {\n${keys.map((k) => `    "${k}": {\n        src: "/x.webp",\n    },\n`).join("")}};`;

const CHANGELOG = (entries, waiting = "") => `export const CHANGELOG_ENTRIES = [
${entries}];

export const WAITING_ENTRIES = [
${waiting}];`;

const entry = (slug, waitsFor, publishOn) => `    {
        slug: "${slug}",
${publishOn ? `        publishOn: "${publishOn}",\n` : ""}        kind: "New",
        waitsFor: "${waitsFor}",
        sections: [
            {
                name: "x",
            },
        ],
    },
`;

const RESOURCES = `export const RESOURCE_PAGES = [
    {
        id: "developers",
        publishOn: "2026-11-14",
    },
];

export const LEGAL_PAGES = [
    {
        id: "privacy",
        publishOn: "2099-01-01",
    },
];`;

const INTEGRATIONS = (live = "false") => `export const liveIntegrations = [
    {
        slug: "claude",
        category: "AI apps",
        href: "/integrations/claude",
        liveOnDev: true,
    },
    {
        slug: "zapier",
        category: "AI apps",
        href: "/help/connect-other-ai-apps#zapier",
        liveOnDev: ${live},
    },
    {
        slug: "razorpay",
        category: "Payments",
        href: "/integrations/razorpay",
    },
];`;

const APP_AI = (zapier = false) => `export const AI_APPS = [
    {
        key: "claude",
        name: "Claude",
        liveOnDev: true,
    },
    { key: "zapier", name: "Zapier", liveOnDev: ${zapier} },
];`;

const help = (slug, feature, shots, extra = "") =>
    `---\ntitle: T\nslug: ${slug}\nfeature: ${feature}\n${extra}steps:\n${shots.map((s) => `    - title: S\n      shot: ${s}\n`).join("")}---\n\nBody.`;

const LEDGER = (aiStatus = "Backed") => `# Ledger

## 17. Release visibility

### 17.1 AI apps (\`ai-apps\`)

| ID  | Claim | Backed by | Status | What's missing |
| --- | ----- | --------- | ------ | -------------- |
| AA1 | Connect it | mcp | ${aiStatus} | — |
| AA2 | NOT on any page: Gemini | — | Not backed | Later |

### 17.2 Ask AI (\`ask-ai\`)

| ID  | Claim | Backed by | Status | What's missing |
| --- | ----- | --------- | ------ | -------------- |
| AK1 | Ask | plan | Backed | — |

### 17.3 Share (\`social\`)

| ID  | Claim | Backed by | Status | What's missing |
| --- | ----- | --------- | ------ | -------------- |
| SH1 | Share | share | Backed | — |

### 17.4 Developers (\`developers\`)

| ID  | Claim | Backed by | Status | What's missing |
| --- | ----- | --------- | ------ | -------------- |
| DV1 | Keys | api | Backed | — |

### 17.5 Templates (\`templates\`)

| ID  | Claim | Backed by | Status | What's missing |
| --- | ----- | --------- | ------ | -------------- |
| WT1 | Pick one | DEC-216 | Backed | — |

## Keeping this current
`;

/** Every piece ready for every switch. */
function ready(over = {}) {
    return {
        switches: releaseSwitches(SWITCHES),
        features: FEATURES,
        captured: captured(
            "ai-connect",
            "ask-hero",
            "ask-start",
            "sh-sheet",
            "help-a-1",
            "help-b-1",
        ),
        changelog: CHANGELOG(
            entry("ai", "ai-apps", "2026-11-10") +
                entry("ask", "ask-ai", "2026-11-10") +
                entry("share", "social", "2026-11-10") +
                entry("api", "developers", "2026-11-10"),
        ),
        resources: RESOURCES,
        integrations: INTEGRATIONS(),
        ledger: LEDGER(),
        appHelp: `export const HELP_ARTICLES = [\n    { slug: "orders", title: "Orders" },\n] as const;`,
        appAiApps: APP_AI(),
        readme: "### From your AI assistant\nAdd https://mcp.saroh.in/mcp\n### Ask AI\n### Share and posts\n## Build on Saroh\n",
        help: [
            help("connect-claude", "ai-apps", ["help-a-1"]),
            help(
                "connect-other-ai-apps",
                "ai-apps",
                [],
                "apps:\n    - id: zapier\n",
            ),
            help("ask-ai", "ask-ai", ["help-b-1"]),
            help("share-a-post", "social", []),
            help("api-keys", "developers", []),
        ],
        exists: () => true,
        ...over,
    };
}

const TODAY = "2026-11-14";
const ALL = ["templates", "ai-apps", "ask-ai", "social", "developers", "docs"];

test("everything ready passes for every switch, and with none on", () => {
    assert.deepEqual(checkRelease(ready(), ALL, TODAY), []);
    assert.deepEqual(checkRelease(ready(), [], TODAY), []);
});

test("a placeholder feature shot fails, naming the key; drawn chats need none", () => {
    assert.deepEqual(featureShots(FEATURES, "ai-apps"), ["ai-connect"]);
    assert.deepEqual(featureShots(FEATURES, "ask-ai"), [
        "ask-hero",
        "ask-start",
    ]);
    const errors = checkRelease(
        ready({
            captured: captured(
                "ai-connect",
                "ask-hero",
                "help-a-1",
                "help-b-1",
            ),
        }),
        ["ask-ai"],
        TODAY,
    );
    assert.deepEqual(errors, [
        "ask-ai: feature shot ask-start is a placeholder (not captured)",
    ]);
});

test("a placeholder help shot fails", () => {
    const errors = checkRelease(
        ready({ captured: captured("ai-connect") }),
        ["ai-apps"],
        TODAY,
    );
    assert.deepEqual(errors, [
        "ai-apps: help connect-claude shot help-a-1 is a placeholder (not captured)",
    ]);
});

test("a missing page, help article or changelog entry fails", () => {
    const src = ready({
        features: FEATURES.replace(/ {4}social: \{[\s\S]*?\n {4}\},\n/, ""),
        help: ready().help.filter((h) => !h.includes("feature: social")),
        changelog: CHANGELOG(entry("ai", "ai-apps", "2026-11-10")),
        exists: (p) => !p.endsWith("chatgpt.mdx"),
    });
    const errors = checkRelease(src, ["social", "ai-apps"], TODAY);
    assert.ok(
        errors.some((e) => /^social: no feature page/.test(e)),
        errors.join("\n"),
    );
    assert.ok(errors.includes("social: no help article has feature: social"));
    assert.ok(errors.includes("social: no changelog entry waitsFor social"));
    assert.ok(
        errors.includes(
            "ai-apps: apps/saroh.in/content/integrations/chatgpt.mdx is missing",
        ),
    );
});

test("an entry still waiting for an on switch fails; off, it is fine", () => {
    const src = ready({
        changelog: CHANGELOG(
            entry("ai", "ai-apps", "2026-11-10") +
                entry("ask", "ask-ai", "2026-11-10") +
                entry("api", "developers", "2026-11-10"),
            entry("share", "social"),
        ),
    });
    assert.deepEqual(checkRelease(src, ["social"], TODAY), [
        "social: changelog share is still in WAITING_ENTRIES: move it to CHANGELOG_ENTRIES with the release day",
    ]);
    assert.deepEqual(checkRelease(src, [], TODAY), []);
});

test("a future publishOn behind an off switch fails; legal pages are exempt", () => {
    const src = ready({
        changelog: CHANGELOG(entry("ask", "ask-ai", "2026-12-01")),
        help: [
            help("connect-claude", "ai-apps", []),
            help("ask-ai", "ask-ai", [], 'publishOn: "2026-12-01"\n'),
        ],
        resources: RESOURCES.replace('"2026-11-14"', '"2026-12-01"'),
    });
    assert.deepEqual(checkRelease(src, [], TODAY), [
        "changelog ask: publishOn 2026-12-01 is ahead while ask-ai is off",
        "help ask-ai: publishOn 2026-12-01 is ahead while ask-ai is off",
        "resources developers: publishOn 2026-12-01 is ahead while it is off",
    ]);
});

test("developers on while docs is off fails", () => {
    assert.deepEqual(checkRelease(ready(), ["developers"], TODAY), [
        "developers: on while docs is off: deploy docs.saroh.in and turn NEXT_PUBLIC_DOCS on first",
    ]);
    assert.deepEqual(checkRelease(ready(), ["developers", "docs"], TODAY), []);
});

test("claims: a missing section fails, a Not backed row fails, a NOT on row doesn't", () => {
    assert.deepEqual(
        checkRelease(
            ready({ ledger: LEDGER("Not backed") }),
            ["ai-apps"],
            TODAY,
        ),
        ["ai-apps: claims row AA1 is Not backed"],
    );
    assert.deepEqual(
        checkRelease(ready({ ledger: "# Ledger\n" }), ["social"], TODAY),
        ['social: the claims ledger has no rows under a "(`social`)" heading'],
    );
});

test("the app's help entries still waiting for an on switch fail", () => {
    const src = ready({
        appHelp: `export const HELP_ARTICLES = [\n    {\n        slug: "share-a-post",\n        title: "Share a post",\n        waitsFor: "social",\n    },\n] as const;`,
    });
    assert.deepEqual(checkRelease(src, ["social"], TODAY), [
        "social: app HELP_ARTICLES share-a-post still waitsFor social: drop it in the release commit",
    ]);
    assert.deepEqual(checkRelease(src, [], TODAY), []);
});

test("an offered AI app needs its help anchor, and both lists must agree", () => {
    const noAnchor = ready({
        integrations: INTEGRATIONS("true"),
        appAiApps: APP_AI(true),
        help: ready().help.map((h) => h.replace("- id: zapier", "- id: make")),
    });
    assert.deepEqual(checkRelease(noAnchor, [], TODAY), [
        "integrations zapier: offered (liveOnDev) but /help/connect-other-ai-apps#zapier has no such anchor",
    ]);
    const differ = ready({ integrations: INTEGRATIONS("true") });
    assert.deepEqual(checkRelease(differ, [], TODAY), [
        "AI app zapier: liveOnDev differs between apps/saroh.in/content/integrations.ts and apps/app.saroh.in/lib/ai-connections/mcp-address.ts",
    ]);
});

test("switches come from wrangler's JSONC vars", () => {
    const jsonc = `{
        // top level is dev
        "vars": { "NEXT_PUBLIC_AI_APPS": "on", "URL": "https://x.saroh.io/a", },
        /* production */
        "env": { "production": { "vars": { "NEXT_PUBLIC_DOCS": "on", "NEXT_PUBLIC_ASK_AI": "off" } } },
    }`;
    const w = parseJsonc(jsonc);
    assert.equal(w.vars.URL, "https://x.saroh.io/a");
    const sw = releaseSwitches(SWITCHES);
    assert.deepEqual(switchesOn(w.vars, sw), ["ai-apps"]);
    assert.deepEqual(switchesOn(w.env.production.vars, sw), ["docs"]);
});

test("an on switch needs its README section; templates and docs need none", () => {
    const errors = checkRelease(ready({ readme: "# Saroh\n" }), ALL, TODAY);
    for (const key of ["ai-apps", "ask-ai", "social", "developers"]) {
        assert.ok(
            errors.some(
                (e) =>
                    e.startsWith(`${key}:`) &&
                    /README\.md has no section/.test(e),
            ),
            key,
        );
    }
    assert.ok(!errors.some((e) => /^(templates|docs):.*README/.test(e)));
    assert.deepEqual(
        checkRelease(ready({ readme: "# Saroh\n" }), [], TODAY),
        [],
    );
});
