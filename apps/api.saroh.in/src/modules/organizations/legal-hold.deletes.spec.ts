/**
 * Nothing a job deletes escapes a legal hold — pinned (DEC-119).
 *
 * The Terms keep a held business's data "for as long as the law requires…
 * even if deletion was requested". That holds only while every job that
 * deletes asks about the hold, and a new retention sweep is exactly the
 * kind of change that forgets to. Nothing at runtime would notice: the
 * sweep would run, the rows would go, and the first sign would be a notice
 * Saroh can no longer answer.
 *
 * So this scans the source, like `job-consumers.spec.ts`: every file that
 * runs as a job and deletes (`deleteMany(`, `.delete(`, a storage
 * `deleteObject(`, a raw `DELETE FROM`) must be listed here as hold-aware,
 * or as deleting nothing of a business's, with why. A hold-aware file must
 * actually read the hold, and whatever it hands its deleting to — the
 * files it imports that delete — must be listed with how the hold reaches
 * them. A new deleting job fails the first test until it is decided.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

const MODULES = join(__dirname, "..");

/**
 * Jobs that delete a business's data, and ask about the hold first. Each
 * must import `organizations/legal-hold` (checked below).
 */
const HOLD_AWARE: Record<string, string> = {
    "admin/organization-deletion-cleanup.handler.ts":
        "Stands aside whole for a held business; every destructive step (jobs, hostnames, keys) asks again, the keys under the business's row lock.",
    "admin/security-log-retention.handler.ts":
        "Leaves out a held business's customer sessions, sign-in codes and store logs, and its members' sign-in sessions.",
    "analytics/analytics-retention.handler.ts":
        "Leaves a held business's events out of the read and of the delete.",
};

/**
 * Jobs that delete, but nothing a business keeps. Say why: a reviewer
 * reads this list to know what a hold does not cover.
 */
const NOT_TENANT_DATA: Record<string, string> = {
    "waitlist/waitlist-retention.handler.ts":
        "Saroh's own waitlist (people who asked for an invite); no business owns a row.",
    "billing/addon-charges.ts":
        "Saroh's billing state for a subscription's add-ons, cleared on a move to or from Free; the charges themselves are kept (DROPPED), and a held business's plan doesn't change.",
    "data-export/data-export.handler.ts":
        "The export's zip, deleted 7 days after it was made: a copy. Every record in it stays where it is, and no new export is made while the business is held.",
};

/**
 * Files a hold-aware job hands its deleting to (it imports them, and they
 * delete), with how the hold reaches the delete. Also read by request
 * paths, which the workspace's lifecycle gate closes for a held business
 * (a held business is never active, `AdminLifecycleService`).
 */
const REACHED_BY_HOLD_AWARE: Record<string, string> = {
    "admin/retention-erase-writes.ts":
        "Every write runs in `inEraseTx`, which reads the hold under the business's row lock (checked below).",
    "customer-workspace/privacy-removal-writes.ts":
        "`removeDetailsInTx`: the eraser calls it inside `inEraseTx`; the privacy removal refuses a held business before it and again under the row lock.",
    "media/media.service.ts":
        "`removeAllForDeletedBusiness` asks the eraser's hold check before every batch (`mayErase`).",
    "domains/domains.service.ts":
        "`releaseForDeletedBusiness` is called only by the clean-up's `domains` step, which asks about the hold first.",
    "bookings/waitlist-merge.ts":
        "`removeWaitlistInTx`, called by `removeDetailsInTx` and so inside the eraser's `inEraseTx`; the eraser empties the waitlist first, so it finds nothing to pass on.",
    "site-accounts/sign-in-codes.service.ts":
        "Imported for `destinationHashFor` only. Its own deletes spend a one-time sign-in code when a customer signs in: a request, never a job.",
};

/**
 * Listed above for one pure helper: none of their deleting is reached, so
 * the scan doesn't follow their imports.
 */
const HELPER_ONLY: readonly string[] = [
    "site-accounts/sign-in-codes.service.ts",
];

/** Deleting functions only a hold-aware job may call. */
const HOLD_GATED_CALLS: Record<string, string[]> = {
    removeAllForDeletedBusiness: [
        "admin/organization-retention-erase.handler.ts",
    ],
    releaseForDeletedBusiness: [
        "admin/organization-deletion-cleanup.handler.ts",
    ],
};

/** The eraser: it deletes only through the files above. */
const ERASER = "admin/organization-retention-erase.handler.ts";

const DELETES =
    /\bdeleteMany\(|\.delete\(|\bdeleteObject\(|\bdeleteObjects\(|DELETE\s+FROM/;

/** A job handler: a function taking the claimed `Job`, or named `handle`. */
const IS_JOB =
    /\(\s*_?job:\s*Job\s*[,)]|\bhandle\s*=\s*async|\basync\s+handle\(/;

const READS_HOLD = /organizations\/legal-hold"|from "\.\/legal-hold"/;

function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return walk(path);
        const isSource =
            entry.name.endsWith(".ts") &&
            !entry.name.endsWith(".spec.ts") &&
            !entry.name.endsWith(".d.ts");
        return isSource ? [path] : [];
    });
}

const files = walk(MODULES).map((path) => ({
    path,
    rel: relative(MODULES, path).split(sep).join("/"),
    text: readFileSync(path, "utf8"),
}));
const byRel = new Map(files.map((f) => [f.rel, f]));

/** Strip comments, so a word in prose isn't taken for a call. */
function code(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** The module files a file imports by relative path. */
function importsOf(file: { path: string; text: string }): string[] {
    const out: string[] = [];
    for (const m of file.text.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) {
        const base = join(dirname(file.path), m[1]);
        for (const candidate of [`${base}.ts`, join(base, "index.ts")]) {
            if (existsSync(candidate) && statSync(candidate).isFile()) {
                const rel = relative(MODULES, candidate).split(sep).join("/");
                if (!rel.startsWith("..")) out.push(rel);
            }
        }
    }
    return out;
}

const deletingJobs = files
    .filter((f) => IS_JOB.test(code(f.text)) && DELETES.test(code(f.text)))
    .map((f) => f.rel)
    .sort();

describe("every job that deletes is decided for a legal hold (DEC-119)", () => {
    it("finds the deleting jobs it expects to scan", () => {
        // A scan that finds nothing would pass every test below.
        expect(deletingJobs).toEqual(
            expect.arrayContaining([
                "admin/organization-deletion-cleanup.handler.ts",
                "analytics/analytics-retention.handler.ts",
                "admin/security-log-retention.handler.ts",
            ]),
        );
    });

    it("lists each one as hold-aware or as not a business's data", () => {
        const undecided = deletingJobs.filter(
            (rel) => !(rel in HOLD_AWARE) && !(rel in NOT_TENANT_DATA),
        );
        // A new job that deletes: read `organizations/legal-hold.ts`, skip a
        // held business's rows, and add the file to HOLD_AWARE — or to
        // NOT_TENANT_DATA with why no business owns what it deletes.
        expect(undecided).toEqual([]);
    });

    it("lists nothing twice, and nothing that no longer deletes", () => {
        const both = Object.keys(HOLD_AWARE).filter(
            (rel) => rel in NOT_TENANT_DATA,
        );
        expect(both).toEqual([]);
        const stale = [
            ...Object.keys(HOLD_AWARE),
            ...Object.keys(NOT_TENANT_DATA),
        ].filter((rel) => !deletingJobs.includes(rel));
        expect(stale).toEqual([]);
    });

    it.each(Object.keys(HOLD_AWARE))("%s reads the hold", (rel) => {
        const file = byRel.get(rel);
        expect(file).toBeDefined();
        expect(READS_HOLD.test(file?.text ?? "")).toBe(true);
    });

    it("gives every entry a reason", () => {
        for (const reason of [
            ...Object.values(HOLD_AWARE),
            ...Object.values(NOT_TENANT_DATA),
            ...Object.values(REACHED_BY_HOLD_AWARE),
        ]) {
            expect(reason.length).toBeGreaterThan(30);
        }
    });
});

describe("what a hold-aware job hands its deleting to", () => {
    const roots = [...Object.keys(HOLD_AWARE), ERASER];

    /** Files imported by a root (through other listed files) that delete. */
    function reached(): string[] {
        const seen = new Set<string>();
        const queue = [...roots];
        while (queue.length > 0) {
            const rel = queue.pop();
            const file = rel ? byRel.get(rel) : undefined;
            if (!file) continue;
            for (const imported of importsOf(file)) {
                const target = byRel.get(imported);
                if (!target || seen.has(imported)) continue;
                if (!DELETES.test(code(target.text))) continue;
                seen.add(imported);
                // Follow on only through files this spec has decided.
                if (
                    imported in REACHED_BY_HOLD_AWARE &&
                    !HELPER_ONLY.includes(imported)
                ) {
                    queue.push(imported);
                }
            }
        }
        return [...seen].filter((rel) => !roots.includes(rel)).sort();
    }

    it("is listed with how the hold reaches it", () => {
        const undecided = reached().filter(
            (rel) => !(rel in REACHED_BY_HOLD_AWARE),
        );
        expect(undecided).toEqual([]);
    });

    it("lists nothing that is no longer reached", () => {
        const now = reached();
        const stale = Object.keys(REACHED_BY_HOLD_AWARE).filter(
            (rel) => !now.includes(rel),
        );
        expect(stale).toEqual([]);
    });

    it("the eraser reads the hold, and deletes nothing itself", () => {
        const eraser = byRel.get(ERASER);
        expect(eraser).toBeDefined();
        expect(READS_HOLD.test(eraser?.text ?? "")).toBe(true);
        expect(DELETES.test(code(eraser?.text ?? ""))).toBe(false);
    });

    it("every write of the eraser runs under the business's row lock and its hold check", () => {
        const writes = byRel.get("admin/retention-erase-writes.ts");
        const text = code(writes?.text ?? "");
        // `inEraseTx` itself reads the hold, locked.
        expect(text).toMatch(/"legalHoldAt"[\s\S]*FOR SHARE/);
        // Each exported function that writes goes through it. Split on the
        // exports and check each body that deletes or updates.
        const bodies = text.split(/\nexport (?:async )?function /).slice(1);
        const writers = bodies.filter((body) =>
            /deleteMany\(|updateMany\(|\$executeRaw|removeDetailsInTx\(|anonymiseStoreCustomersInTx\(/.test(
                body,
            ),
        );
        expect(writers.length).toBeGreaterThanOrEqual(5);
        for (const body of writers) {
            const name = /^(\w+)/.exec(body)?.[1] ?? "?";
            if (name === "inEraseTx") continue;
            expect(`${name}: ${/inEraseTx\(/.test(body)}`).toBe(
                `${name}: true`,
            );
        }
        // And nothing in the file writes through the bare client.
        expect(text).not.toMatch(
            /prisma\.\w+\.(deleteMany|updateMany|delete|update)\(/,
        );
    });

    it.each(Object.entries(HOLD_GATED_CALLS))(
        "%s is called only by its hold-aware job",
        (name, allowed) => {
            const callers = files
                .filter((f) => new RegExp(`\\.${name}\\(`).test(code(f.text)))
                .map((f) => f.rel)
                .sort();
            expect(callers).toEqual([...allowed].sort());
        },
    );
});
