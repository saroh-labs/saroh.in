/**
 * A business's customers are emailed only through the business's own
 * provider, never from Saroh's address (DEC-086 reversed on 7 Oct 2026, its
 * code removed in #1134; DEC-174). Pinned as a source fact: a flag check
 * would only guard a flag, and not stop new notice code reaching for one of
 * Saroh's own senders.
 *
 * The modules that tell a business's customers about their bookings,
 * orders, memberships, packs, courses, enquiries and stock may import from
 * `common/email` (Saroh's own sender) only:
 *   - types (`import type …`), which send nothing;
 *   - the team's alerts (`sendTeamAlertEmail`): Saroh tells the business's
 *     own staff, DEC-011 amended;
 *   - a site account's own sign-in mail: its code, its email changed, and
 *     the notices about the account itself (`site-accounts/`, ADR-011).
 * And none of them may import a Saroh business-email sender, or open its
 * own SMTP transport (`nodemailer`).
 *
 * Imports are read from the TypeScript syntax tree, not a regex, so line
 * breaks and `export … from` don't hide one; `require` and `import()` are
 * read too.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import * as ts from "typescript";

const MODULES = join(__dirname, "..");

/** Where customer notices are made and sent from. */
const CUSTOMER_NOTICE_DIRS = [
    "site-accounts",
    "bookings",
    "orders",
    "subscriptions",
    "class-packs",
    "courses",
    "enquiry",
    "stock",
] as const;

/** What these modules may take from Saroh's own sender. */
const ALLOWED_SAROH_SENDERS = new Set([
    // The business's own team, never its customers.
    "sendTeamAlertEmail",
    // A site account's own sign-in mail (ADR-011).
    "sendSiteSignInCodeEmail",
    "sendSiteEmailChangedEmail",
    "sendSiteAccountNoticeEmail",
]);

/** Saroh's own sender. */
const SAROH_SENDER = /(^|\/)common\/email$/;

/**
 * A path no customer-notice module may import at all: a Saroh business
 * sender (DEC-086's were `providers/saroh-email.sender`, `saroh-send`,
 * `saroh-queue`, `saroh-may-send`, `saroh-delivery` and
 * `site-accounts/saroh-notice`), or an SMTP transport of its own.
 */
const FORBIDDEN_PATH =
    /(^nodemailer$)|(\/saroh-(email|send|queue|may-send|delivery|notice)[^/]*$)|(\/providers\/saroh[^/]*$)/;

interface Offence {
    from: string;
    what: string;
}

/** The value names an import or re-export takes, or null for `*`/default. */
function valueNames(node: ts.ImportDeclaration | ts.ExportDeclaration) {
    if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        if (!clause) return [];
        if (clause.isTypeOnly) return [];
        const names: string[] = [];
        if (clause.name) names.push("default");
        const bindings = clause.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) names.push("*");
        if (bindings && ts.isNamedImports(bindings)) {
            for (const el of bindings.elements) {
                if (el.isTypeOnly) continue;
                names.push((el.propertyName ?? el.name).text);
            }
        }
        return names;
    }
    if (node.isTypeOnly) return [];
    const clause = node.exportClause;
    if (!clause || ts.isNamespaceExport(clause)) return ["*"];
    return clause.elements
        .filter((el) => !el.isTypeOnly)
        .map((el) => (el.propertyName ?? el.name).text);
}

/** Every Saroh-sender reach in one file's source. */
function sarohMailOffences(source: string): Offence[] {
    const file = ts.createSourceFile(
        "scanned.ts",
        source,
        ts.ScriptTarget.Latest,
        true,
    );
    const out: Offence[] = [];
    const check = (from: string, names: string[] | null) => {
        if (FORBIDDEN_PATH.test(from)) {
            out.push({ from, what: names?.join(", ") || "(import)" });
            return;
        }
        if (!SAROH_SENDER.test(from)) return;
        // `require`/`import()` take the whole module: nothing is allowed.
        if (names === null) {
            out.push({ from, what: "(whole module)" });
            return;
        }
        for (const name of names) {
            if (!ALLOWED_SAROH_SENDERS.has(name))
                out.push({ from, what: name });
        }
    };
    const visit = (node: ts.Node) => {
        if (
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
        ) {
            check(node.moduleSpecifier.text, valueNames(node));
        } else if (
            ts.isCallExpression(node) &&
            (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                (ts.isIdentifier(node.expression) &&
                    node.expression.text === "require")) &&
            node.arguments[0] &&
            ts.isStringLiteralLike(node.arguments[0])
        ) {
            check(node.arguments[0].text, null);
        }
        ts.forEachChild(node, visit);
    };
    visit(file);
    return out;
}

/** The non-spec TypeScript under a directory, recursively. */
function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        return name.endsWith(".ts") && !name.endsWith(".spec.ts") ? [path] : [];
    });
}

describe("no customer notice is sent from Saroh's address (DEC-086 removed, #1134)", () => {
    it.each(CUSTOMER_NOTICE_DIRS)(
        "modules/%s reaches for no Saroh sender",
        (dir) => {
            const files = sourceFiles(join(MODULES, dir));
            expect(files.length).toBeGreaterThan(0);
            const offences = files.flatMap((path) =>
                sarohMailOffences(readFileSync(path, "utf8")).map(
                    (o) =>
                        `${relative(MODULES, path)}: ${o.what} from ${o.from}`,
                ),
            );
            expect(offences).toEqual([]);
        },
    );

    describe("the scan itself", () => {
        it("fails on a planted import of DEC-086's Saroh sender", () => {
            const planted = `
                import { Injectable } from "@nestjs/common";
                import {
                    sendSarohBusinessEmail,
                } from "../communications/providers/saroh-email.sender";
            `;
            expect(sarohMailOffences(planted)).toEqual([
                {
                    from: "../communications/providers/saroh-email.sender",
                    what: "sendSarohBusinessEmail",
                },
            ]);
            expect(
                sarohMailOffences(
                    `import { queueSarohInTx } from "../communications/saroh-queue";`,
                ),
            ).toHaveLength(1);
            expect(
                sarohMailOffences(
                    `export { renderSarohNotice } from "./saroh-notice";`,
                ),
            ).toHaveLength(1);
        });

        it("fails on any other of Saroh's own senders, however it is reached", () => {
            for (const src of [
                `import { sendEnquiryNotificationEmail } from "../../common/email";`,
                `import { sendTeamAlertEmail, sendWelcomeEmail as w } from "../../common/email";`,
                `import * as email from "../../common/email";`,
                `export { sendSelfTestEmail } from "../../common/email";`,
                `const m = require("../../common/email");`,
                `const m = await import("../../common/email");`,
                `import nodemailer from "nodemailer";`,
            ]) {
                expect([src, sarohMailOffences(src).length]).toEqual([src, 1]);
            }
        });

        it("lets types, the team's alerts and a site account's sign-in mail through", () => {
            for (const src of [
                `import type { EmailOutcome } from "../../common/email";`,
                `import { type EmailOutcome, sendTeamAlertEmail } from "../../common/email";`,
                `import { sendSiteSignInCodeEmail } from "../../common/email";`,
                `import { sendSiteEmailChangedEmail } from "../../common/email";`,
                `import { sendSiteAccountNoticeEmail } from "../../common/email";`,
                `import { emailRoute } from "../communications/email-route";`,
                `import { CommunicationsService } from "../communications/communications.service";`,
            ]) {
                expect([src, sarohMailOffences(src)]).toEqual([src, []]);
            }
        });
    });
});
