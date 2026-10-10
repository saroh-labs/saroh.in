/**
 * Who reads a business's kind (DEC-070, KTD-3), pinned as a source fact.
 *
 * The kind changes words and defaults only. No guard, module gate,
 * entitlement or refusal may read it (R3), and "may not" is only true if
 * something fails when one does. So this scans the API's source, as
 * `capabilities/module-annotations.spec.ts` does for module gates, and
 * fails when the kind is read anywhere off the allow-list below, or on a
 * path that decides access whatever the allow-list says.
 *
 * What counts as a read:
 *   - a call to `organizationKind(` or `kindRead(`
 *     (`organization-kind.ts`), or
 *   - `kind` inside a Prisma call on `organization` (`db.organization.
 *     findUnique({ … })`) or an `organization: { … }` relation block — a
 *     select, a where or a write.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = join(__dirname, "..", "..");

/**
 * The only files that may read the kind, each with the reason. A directory
 * ends in "/". Relative to `src/`.
 */
const ALLOWED: Record<string, string> = {
    "modules/organizations/organization-kind.ts": "the one reader",
    "modules/organizations/organization-onboarding.service.ts":
        "setup stores what the merchant chose",
    "modules/organizations/organization-settings.service.ts":
        "Settings reads and changes it",
    "modules/organizations/settings-audit.ts":
        "the audit row says what it was and became",
    "modules/organizations/organization-context.service.ts":
        "the summary and the list carry it for the app's words",
    "modules/capabilities/setup/":
        "the Turn on sheet's prefill follows it (K8)",
    "modules/sites/site-create.ts":
        "a new site starts from the kind's template (K15)",
    "modules/analytics/product-milestones.ts":
        "a milestone says what kind of business reached it (DEC-125); nothing is decided from it",
};

/**
 * Paths that decide access. The kind may never be read here, even if a
 * later change adds one to {@link ALLOWED}.
 */
const NEVER = [
    "common/guards/",
    "modules/capabilities/module-",
    "modules/billing/entitlement",
];

export interface SourceFile {
    /** Relative to `src/`, with forward slashes. */
    path: string;
    source: string;
}

const CALL = /\b(organizationKind|kindRead)\s*\(/g;
const ORG_BLOCK = /\borganization\s*(?:\.\s*\w+\s*\(\s*(?=\{)|:\s*(?=\{))/g;
const KIND_KEY = /\bkind\b/;

/** The text of the balanced `{ … }` that starts at `open`. */
function block(source: string, open: number): string {
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        const ch = source[i];
        if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth === 0) return source.slice(open, i + 1);
        }
    }
    return source.slice(open);
}

/** The name of the function a position sits in, near enough for a scan. */
function enclosing(source: string, at: number): string | null {
    const before = source.slice(0, at);
    const names = [
        ...before.matchAll(
            /(?:function\s+(\w+)|^\s*(?:(?:private|public|protected|static|async)\s+)*(\w+)\s*\([^)]*\)\s*(?::[^{]*)?\{)/gm,
        ),
    ];
    const last = names.at(-1);
    return last ? (last[1] ?? last[2] ?? null) : null;
}

/** Every place a file reads the kind, as "line: what". */
export function kindReads(source: string): { index: number; what: string }[] {
    const found: { index: number; what: string }[] = [];
    for (const m of source.matchAll(CALL)) {
        // The definitions themselves are not reads.
        const head = source.slice(Math.max(0, m.index - 20), m.index);
        if (/function\s+$/.test(head)) continue;
        found.push({ index: m.index, what: `${m[1]}(` });
    }
    for (const m of source.matchAll(ORG_BLOCK)) {
        const open = m.index + m[0].length;
        if (KIND_KEY.test(block(source, open))) {
            found.push({ index: m.index, what: "kind on organization" });
        }
    }
    return found;
}

const isAllowed = (path: string) =>
    Object.keys(ALLOWED).some((a) =>
        a.endsWith("/") ? path.startsWith(a) : path === a,
    );

/** Reads off the allow-list, on a path that decides access, or in an assert. */
export function strayReaders(files: readonly SourceFile[]): string[] {
    const stray: string[] = [];
    for (const { path, source } of files) {
        for (const read of kindReads(source)) {
            const line = source.slice(0, read.index).split("\n").length;
            const where = `${path}:${line} ${read.what}`;
            if (NEVER.some((n) => path.startsWith(n))) {
                stray.push(`${where} — decides access`);
            } else if (!isAllowed(path)) {
                stray.push(`${where} — not on the allow-list`);
            } else if (/^assert/.test(enclosing(source, read.index) ?? "")) {
                stray.push(`${where} — inside an assert`);
            }
        }
    }
    return stray;
}

/** Every non-spec TypeScript file under `src/`. */
function sources(dir = SRC): SourceFile[] {
    const out: SourceFile[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...sources(full));
        } else if (
            entry.name.endsWith(".ts") &&
            !entry.name.endsWith(".spec.ts")
        ) {
            out.push({
                path: relative(SRC, full).split(sep).join("/"),
                source: readFileSync(full, "utf8"),
            });
        }
    }
    return out;
}

describe("who reads Organization.kind (DEC-070, KTD-3)", () => {
    const all = sources();

    it("is read only on the allow-list, and never where access is decided", () => {
        expect(strayReaders(all)).toEqual([]);
    });

    it("is actually read where the allow-list says, so the scan sees it", () => {
        const readers = new Set(
            all
                .filter((f) => kindReads(f.source).length > 0)
                .map((f) => f.path),
        );
        for (const path of [
            "modules/organizations/organization-kind.ts",
            "modules/organizations/organization-onboarding.service.ts",
            "modules/organizations/organization-settings.service.ts",
            "modules/organizations/organization-context.service.ts",
            "modules/capabilities/setup/module-setup.service.ts",
        ]) {
            expect(readers).toContain(path);
        }
    });

    it("keeps every allow-listed file real", () => {
        const paths = all.map((f) => f.path);
        for (const allowed of Object.keys(ALLOWED)) {
            expect(
                paths.some((p) =>
                    allowed.endsWith("/")
                        ? p.startsWith(allowed)
                        : p === allowed,
                ),
            ).toBe(true);
        }
    });

    it("fails a stray organizationKind( in a guard", () => {
        const guard = {
            path: "common/guards/kind.guard.ts",
            source: [
                "export class KindGuard {",
                "    async canActivate() {",
                "        return (await organizationKind(prisma, id)) === 'BUSINESS';",
                "    }",
                "}",
            ].join("\n"),
        };
        expect(strayReaders([guard])).toEqual([
            "common/guards/kind.guard.ts:3 organizationKind( — decides access",
        ]);
    });

    it("fails a kind select in a module gate, and one off the allow-list", () => {
        const gate = {
            path: "modules/capabilities/module-availability.service.ts",
            source: "const o = await prisma.organization.findUnique({ where: { id }, select: { kind: true } });",
        };
        const invoices = {
            path: "modules/invoices/invoices.service.ts",
            source: [
                "const org = await tx.invoice.findFirst({",
                "    select: { kind: true, organization: { select: { kind: true } } },",
                "});",
            ].join("\n"),
        };
        expect(strayReaders([gate, invoices])).toEqual([
            "modules/capabilities/module-availability.service.ts:1 kind on organization — decides access",
            "modules/invoices/invoices.service.ts:2 kind on organization — not on the allow-list",
        ]);
    });

    it("fails a read inside an assert, even on the allow-list", () => {
        const setup = {
            path: "modules/capabilities/setup/module-setup.service.ts",
            source: [
                "export async function assertSetupAllowed(db, id) {",
                "    if ((await organizationKind(db, id)) === 'WORK') throw new Error();",
                "}",
            ].join("\n"),
        };
        expect(strayReaders([setup])).toEqual([
            "modules/capabilities/setup/module-setup.service.ts:2 organizationKind( — inside an assert",
        ]);
    });

    it("leaves another model's kind alone", () => {
        const invoices = {
            path: "modules/invoices/invoices.service.ts",
            source: "await tx.invoice.findMany({ where: { kind: 'INVOICE', organizationId } });",
        };
        expect(strayReaders([invoices])).toEqual([]);
    });
});
