// The words a merchant reads in the workspace (docs/patterns/saroh-product.md
// → One word each; docs/patterns/frontend-error-feedback.md → Toasts). This
// reads `apps/app.saroh.in` with TypeScript's own parser and fails on:
//
// - an em dash in any string or JSX text. A sentence is two sentences, a
//   comma, a colon or "and". The one dash a merchant sees is the mark for a
//   value that isn't there, and it is written in one file only,
//   `packages/ui/src/lib/absent.ts`: a cell draws it with `AbsentValue`
//   (`@saroh/ui/absent-value`, which says "None", "Not set" or "Not known"
//   to a screen reader) and a plain string takes `absentText()`. That file
//   is read here too and is on the allow-list, so a dash typed anywhere
//   else still fails;
// - an en dash between two figures or two words: a range says "to";
// - a semicolon in what is read;
// - a word the product never says: organization, workspace, storefront,
//   store, capability, inventory, log in, slot, reservation, appointment,
//   Retry, "Save changes", successfully, simply, please, oops, easy, invalid,
//   or an exclamation mark.
//
// "What is read" is JSX text, a string handed to a prop or helper that draws
// it (`title`, `label`, `description`, `placeholder`, `aria-label`,
// `showSuccess`, …), and any other string that reads as words: two or more
// of them with a space between. Comments, class names, identifiers, stored
// values ("inventory:write"), routes and import paths are not read by
// anyone, and are left alone. Tests may spell out what they expect.
//
// `scripts/check-words.mjs` is the wider net for three of these words across
// merchant sites, emails and Help; this one is the workspace's own, and is
// stricter.
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const APP = "apps/app.saroh.in";
const SOURCES = ["app", "components", "lib"];
/**
 * Read as well, from the repository root: the one file outside the app
 * whose string the app draws. It is named by its full path below.
 */
const SHARED = ["packages/ui/src/lib/absent.ts"];
// The app's own TypeScript: this script has no dependencies of its own.
const ts = createRequire(join(root, APP, "package.json"))("typescript");

/**
 * What may break a rule anyway: a file, the rule, and why. A reason is
 * required. Keep it short: nearly every hit is a sentence to rewrite.
 */
const ALLOWED = [
    {
        file: "packages/ui/src/lib/absent.ts",
        rule: "em dash",
        why: "the mark for a value that isn't there (owner, 11 Oct): the only place the dash is written. Everything else draws it through AbsentValue or absentText()",
    },
    {
        file: "lib/services/service-editor.ts",
        rule: "em dash",
        why: "the API's own refusal, compared with === to tell it apart. Reword both sides together",
    },
    {
        file: "lib/invoices/paper-title.ts",
        rule: "em dash",
        why: "the invoice paper's titles, which the API draws identically on the PDF. Reword both sides together",
    },
    {
        file: "lib/settings/search.ts",
        rule: "workspace",
        why: '"Workspace address" is a word Settings search still finds the web address by. A synonym is matched, never shown',
    },
    {
        file: "lib/organizations/storefront-team.ts",
        rule: "storefront",
        why: "a stored role label, matched so it can be shown as Location team",
    },
    {
        file: "components/sites/section-fields/contact.tsx",
        rule: "en dash",
        why: "an example of hours a merchant types on their own page, in their words",
    },
];
for (const a of ALLOWED) {
    if (!a.why?.trim()) throw new Error(`ALLOWED ${a.file} needs a reason`);
}

/** A prop or key whose string is drawn on the screen or read aloud. */
const SINK_NAMES = new Set([
    "title",
    "label",
    "description",
    "placeholder",
    "aria-label",
    "aria-description",
    "aria-roledescription",
    "alt",
    "hint",
    "note",
    "body",
    "heading",
    "subtitle",
    "message",
    "tooltip",
    "caption",
    "error",
    "reason",
    "so",
    "why",
    "things",
    "confirmLabel",
    "cancelLabel",
    "actionLabel",
    "emptyTitle",
    "emptyDescription",
]);

/** A helper whose arguments are sentences. */
const SINK_CALLS = new Set([
    "showSuccess",
    "showError",
    "showWarning",
    "showInfo",
    "showRefusal",
    "showUndo",
    "toFailure",
]);

/** Where a string is class names, never words. */
const CLASS_CALLS = new Set(["cn", "cva", "clsx", "twMerge", "tv"]);
const CLASS_NAME = /class(Name|Names)?$/i;

/** The words, as whole words, and what to say instead. */
const BANNED = [
    [/\borgani[sz]ations?\b/i, "organization", 'say "business"'],
    [/\bworkspaces?\b/i, "workspace", 'say "business"'],
    [/\bstorefronts?\b/i, "storefront", 'say "location"'],
    [/\bstores?\b/i, "store", 'say "location"'],
    [/\bcapabilit(?:y|ies)\b/i, "capability", 'say "module"'],
    [/\binventory\b/i, "inventory", 'say "Stock"'],
    [
        /\blog[ -]?(?:in|out)\b|\blogged (?:in|out)\b/i,
        "log in",
        'say "Sign in" or "sign-in"',
    ],
    [/\bslots?\b/i, "slot", 'say "time"'],
    [/\breservations?\b/i, "reservation", 'say "booking"'],
    [/\bappointments?\b/i, "appointment", 'say "booking"'],
    [/\bretr(?:y|ies|ying)\b/i, "retry", 'say "Try again"'],
    [/\bsave changes\b/i, "Save changes", 'say "Save"'],
    [/\bsuccessfully\b/i, "successfully", "say what happened"],
    [/\bsimply\b/i, "simply", "leave the word out"],
    [
        /\bplease\b/i,
        "please",
        "leave the word out, or allow it where it asks a favour",
    ],
    [/\b(?:oops|whoops)\b/i, "oops", "say what happened"],
    [/\beas(?:y|ily)\b/i, "easy", "leave the word out"],
    [/\binvalid\b/i, "invalid", "say what to do"],
    [/[A-Za-z]!(?:\s|$)/, "exclamation mark", "end with a full stop"],
];

const isTest = (f) =>
    /\.(test|spec)\.[cm]?[jt]sx?$|__snapshots__|\.test-kit\.tsx?$|\.fixture\.ts$/.test(
        f,
    );

function walk(dir) {
    return readdirSync(join(root, APP, dir), { recursive: true })
        .map(String)
        .filter((f) => /\.tsx?$/.test(f))
        .filter((f) => !f.split("/").includes("node_modules"))
        .map((f) => join(dir, f))
        .filter((f) => !isTest(f));
}

/** `&apos;` is a letter on the page, not a semicolon. */
const plain = (s) => s.replace(/&#?\w+;/g, "'");

/** A token that is code inside a string: `aria-[invalid=true]:border`. */
const codeToken = (t) => /[[\]=_{}<>]|:.|^[./@#]|\/\w/.test(t);

/** The words of a string, without the tokens that are code. */
function wordsOf(s) {
    return plain(s)
        .split(/\s+/)
        .filter((t) => t && !codeToken(t));
}

/**
 * Reads as words: at least two of them, with letters, and a space between;
 * or one word written as a label ("Inventory", never "INVENTORY" or
 * "inventory", which are a key and a value).
 */
function readsAsWords(s) {
    if (/^[A-Z][a-z]+$/.test(s.trim())) return true;
    const tokens = plain(s).split(/\s+/).filter(Boolean);
    const words = tokens.filter((t) => !codeToken(t) && /[A-Za-z]{2}/.test(t));
    // Class names are words to the parser and to nobody else.
    const classy = tokens.filter((t) => /\w-\w|\w:\w|\[/.test(t)).length;
    return words.length >= 2 && classy * 2 <= tokens.length;
}

function problemsIn(text, { read }) {
    const out = [];
    // The character, or the same thing spelt as an entity in JSX text.
    if (/—|&mdash;|&#8212;|&#x2014;/i.test(text))
        out.push([
            "em dash",
            "write two sentences, a comma or a colon. A value that isn't there is AbsentValue or absentText() from @saroh/ui",
        ]);
    if (!read) return out;
    const said = plain(text);
    if (/[0-9A-Za-z] ?– ?[0-9A-Za-z₹$]/.test(said))
        out.push(["en dash", 'say "to"']);
    if (/;(?:\s|$)/.test(said) && !/=/.test(said)) {
        out.push(["semicolon", "write two sentences, a comma or and"]);
    }
    const words = wordsOf(text).join(" ");
    for (const [re, name, say] of BANNED) {
        if (re.test(words)) out.push([name, say]);
    }
    return out;
}

/** The node a literal's value flows to, past the expressions that pass it on. */
function holder(node) {
    let p = node.parent;
    while (
        p &&
        (ts.isJsxExpression(p) ||
            ts.isConditionalExpression(p) ||
            ts.isParenthesizedExpression(p) ||
            ts.isTemplateSpan(p) ||
            ts.isTemplateExpression(p) ||
            ts.isArrayLiteralExpression(p) ||
            ts.isAsExpression(p) ||
            ts.isSatisfiesExpression(p) ||
            (ts.isBinaryExpression(p) &&
                [
                    ts.SyntaxKind.PlusToken,
                    ts.SyntaxKind.BarBarToken,
                    ts.SyntaxKind.QuestionQuestionToken,
                    ts.SyntaxKind.AmpersandAmpersandToken,
                ].includes(p.operatorToken.kind)))
    ) {
        p = p.parent;
    }
    return p;
}

const nameOf = (n, sf) =>
    ts.isStringLiteral(n) ? n.text : n.getText(sf).replace(/^["']|["']$/g, "");

/** "sink": drawn for sure. "class": never words. "skip": not a value. */
function placeOf(node, sf) {
    const p = holder(node);
    if (!p) return "other";
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return "skip";
    if (ts.isLiteralTypeNode(p) || ts.isCaseClause(p)) return "skip";
    if (ts.isExternalModuleReference(p)) return "skip";
    if (ts.isJsxElement(p) || ts.isJsxFragment(p)) return "sink";
    if (ts.isJsxAttribute(p)) {
        const name = p.name.getText(sf);
        if (CLASS_NAME.test(name)) return "class";
        return SINK_NAMES.has(name) ? "sink" : "other";
    }
    if (ts.isPropertyAssignment(p)) {
        // The key itself is a name, not a value.
        if (p.name === node) return "skip";
        const name = nameOf(p.name, sf);
        if (CLASS_NAME.test(name)) return "class";
        return SINK_NAMES.has(name) ? "sink" : "other";
    }
    if (ts.isVariableDeclaration(p) && CLASS_NAME.test(p.name.getText(sf))) {
        return "class";
    }
    if (ts.isCallExpression(p)) {
        const callee = p.expression.getText(sf).split(".").at(-1) ?? "";
        if (CLASS_CALLS.has(callee)) return "class";
        if (SINK_CALLS.has(callee)) return "sink";
    }
    // A comparison or a lookup tests a value; it doesn't say one.
    if (ts.isBinaryExpression(p) || ts.isElementAccessExpression(p))
        return "skip";
    return "other";
}

const allowed = (file, rule) =>
    ALLOWED.some(
        (a) => a.file === file && (a.rule === rule || rule.startsWith(a.rule)),
    );

const found = [];
const usedAllowance = new Set();
let scanned = 0;

/** Where a file is, from the repository root. */
const pathOf = (file) => (SHARED.includes(file) ? file : `${APP}/${file}`);

for (const file of [...SOURCES.flatMap(walk), ...SHARED]) {
    scanned += 1;
    const text = readFileSync(join(root, pathOf(file)), "utf8");
    const sf = ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const report = (node, value, read) => {
        for (const [rule, say] of problemsIn(value, { read })) {
            if (allowed(file, rule)) {
                usedAllowance.add(`${file}|${rule}`);
                continue;
            }
            const { line } = sf.getLineAndCharacterOfPosition(
                node.getStart(sf),
            );
            found.push([file, line + 1, rule, say, value]);
        }
    };
    const visit = (node) => {
        if (ts.isJsxText(node)) {
            const value = node.getText(sf);
            if (value.trim()) report(node, value, true);
        } else if (
            ts.isStringLiteral(node) ||
            ts.isNoSubstitutionTemplateLiteral(node)
        ) {
            const place = placeOf(node, sf);
            if (
                place !== "skip" &&
                place !== "class" &&
                node.text !== "use client"
            ) {
                report(
                    node,
                    node.text,
                    place === "sink" || readsAsWords(node.text),
                );
            }
        } else if (ts.isTemplateExpression(node)) {
            const place = placeOf(node, sf);
            if (place !== "skip" && place !== "class") {
                // Each `${…}` stands for a word, so the pieces read as one.
                const value =
                    node.head.text +
                    node.templateSpans
                        .map((s) => `x${s.literal.text}`)
                        .join("");
                // A path or a query built from parts is not a sentence.
                const code = /^[/.?#]|^\w+:\/\/|^\$?x?\//.test(value.trim());
                if (!code) {
                    report(
                        node,
                        value,
                        place === "sink" || readsAsWords(value),
                    );
                }
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
}

const seen = new Set();
for (const [file, line, rule, say, value] of found) {
    const key = `${file}:${line}:${rule}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const shown = value.replace(/\s+/g, " ").trim().slice(0, 90);
    console.error(
        `${pathOf(file)}:${line}: ${rule} in "${shown}": ${say} (docs/patterns/saroh-product.md, One word each)`,
    );
}
for (const a of ALLOWED) {
    if (!usedAllowance.has(`${a.file}|${a.rule}`)) {
        console.error(
            `scripts/check-app-copy.mjs: ALLOWED ${a.file} (${a.rule}) no longer applies. Remove it.`,
        );
        process.exitCode = 1;
    }
}
if (seen.size > 0) {
    process.exitCode = 1;
} else if (!process.exitCode) {
    console.log(
        `copy: ${scanned} files, no em dash, semicolon or banned word in what a merchant reads`,
    );
}
