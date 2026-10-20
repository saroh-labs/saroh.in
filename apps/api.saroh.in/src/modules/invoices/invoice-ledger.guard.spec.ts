import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Nothing pays an invoice outside the ledger (DEC-173, U3 #1115).
 *
 * Every invoice that isn't an order's is paid through
 * `invoice-ledger.ts` (`recordLedgerPaymentInTx`, `settleFromLedger`,
 * `recordOnlinePaymentInTx`), which writes the payment row and works the
 * status out from the rows. A write elsewhere that sets an invoice PAID, or
 * writes `paidCents`, leaves a paid invoice with no payment behind it: the
 * owed figures, the pay link and the history would all disagree.
 *
 * This reads the API's sources and finds every invoice write
 * (`.invoice.create|createMany|update|updateMany|upsert(`), then looks at
 * what it writes (`data`, `create`, `update`), following a spread of a
 * constant declared in the same file. Only the files below may set PAID:
 * an order's paper, whose ledger is the order (ADR-008).
 */

const SRC = join(__dirname, "..", "..");

/** Where an invoice may be written PAID, and why. */
const ALLOWED: Record<string, string> = {
    "modules/invoices/invoice-ledger.ts":
        "the ledger itself, and an order's paper stamped paid",
    "modules/invoices/order-invoicing.ts":
        "an order's invoice and its corrections: the order is their ledger (ADR-008)",
};

const WRITE = /\.invoice\.(create|createMany|update|updateMany|upsert)\(/g;

function sources(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
            if (name === "node_modules") continue;
            out.push(...sources(path));
        } else if (
            name.endsWith(".ts") &&
            !name.endsWith(".spec.ts") &&
            !name.endsWith(".d.ts")
        ) {
            out.push(path);
        }
    }
    return out;
}

/** The text from `open` (a bracket) to its match, brackets included. */
function balanced(text: string, open: number): string {
    const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
    const stack: string[] = [];
    let quote: string | null = null;
    for (let i = open; i < text.length; i += 1) {
        const c = text[i];
        if (quote) {
            if (c === "\\") i += 1;
            else if (c === quote) quote = null;
            continue;
        }
        if (c === '"' || c === "'" || c === "`") quote = c;
        else if (pairs[c]) stack.push(pairs[c]);
        else if (c === stack[stack.length - 1]) {
            stack.pop();
            if (stack.length === 0) return text.slice(open, i + 1);
        }
    }
    return text.slice(open);
}

/** The objects a write call writes: its `data`, `create` and `update`. */
function written(call: string): string[] {
    const out: string[] = [];
    const key = /\b(data|create|update)\s*:\s*/g;
    let m: RegExpExecArray | null;
    while ((m = key.exec(call)) !== null) {
        const at = m.index + m[0].length;
        if (call[at] === "{" || call[at] === "[") {
            out.push(balanced(call, at));
        } else {
            // `data: paid` — a name, followed below like a spread.
            const name = /^[A-Za-z_$][\w$]*/.exec(call.slice(at));
            if (name) out.push(`...${name[0]}`);
        }
    }
    return out;
}

/** A constant object this file declares, by name: `const paid = {…}`. */
function declared(file: string, name: string): string | null {
    const m = new RegExp(`\\bconst\\s+${name}\\b[^=]*=\\s*`).exec(file);
    if (!m) return null;
    const at = m.index + m[0].length;
    return file[at] === "{" ? balanced(file, at) : null;
}

function paysInvoice(file: string, block: string, seen = new Set<string>()) {
    if (/["']PAID["']/.test(block) || /\bpaidCents\s*:/.test(block)) {
        return true;
    }
    for (const spread of block.matchAll(/\.\.\.([A-Za-z_$][\w$]*)/g)) {
        const name = spread[1];
        if (seen.has(name)) continue;
        seen.add(name);
        const body = declared(file, name);
        if (body && paysInvoice(file, body, seen)) return true;
    }
    return false;
}

/** Each invoice write in the API that sets PAID or `paidCents`. */
function payingWrites(): { file: string; line: number }[] {
    const found: { file: string; line: number }[] = [];
    for (const path of sources(SRC)) {
        const file = readFileSync(path, "utf8");
        for (const m of file.matchAll(WRITE)) {
            const open = (m.index ?? 0) + m[0].length - 1;
            const call = balanced(file, open);
            if (written(call).some((block) => paysInvoice(file, block))) {
                found.push({
                    file: relative(SRC, path).split("\\").join("/"),
                    line: file.slice(0, m.index).split("\n").length,
                });
            }
        }
    }
    return found;
}

describe("invoice ledger guard (DEC-173)", () => {
    it("sets an invoice PAID, or writes paidCents, only in the ledger and on an order's paper", () => {
        const outside = payingWrites().filter((w) => !(w.file in ALLOWED));
        expect(outside).toEqual([]);
    });

    it("still finds the writes it allows, so a rename can't blind it", () => {
        const files = new Set(payingWrites().map((w) => w.file));
        for (const allowed of Object.keys(ALLOWED)) {
            expect(files).toContain(allowed);
        }
    });

    it("catches a PAID written directly, by a spread, or through paidCents", () => {
        const file = [
            'const paid = { status: "PAID", paidAt: now } as const;',
            "await tx.invoice.update({ where: { id }, data: { ...paid } });",
            'await tx.invoice.updateMany({ where: { status: "PAID" }, data: { note } });',
            "await tx.invoice.update({ where: { id }, data: { paidCents: 5 } });",
        ].join("\n");
        const calls = [...file.matchAll(WRITE)].map((m) =>
            balanced(file, (m.index ?? 0) + m[0].length - 1),
        );
        const pays = calls.map((call) =>
            written(call).some((block) => paysInvoice(file, block)),
        );
        // The where's PAID is a read, not a write.
        expect(pays).toEqual([true, false, true]);
    });
});
