#!/usr/bin/env node
/**
 * What saroh.tech may not say. The product has no quotes to accept, no client
 * approvals and no Stripe or PayPal connection yet, and its tax and pay links
 * work only for India (the private ledger, DEC-203). Runs over the built HTML,
 * because that's what a visitor reads, whichever file the words came from.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** Documents and tax guides may name these things; a product claim may not. */
const ABOUT_TAX =
    /^\/(templates|guides|tools\/(gst|vat|sales-tax)-calculator)(\/|$)/;

/** The free tools, templates and guides are about the document, not the product. */
const ABOUT_DOCS = /^\/(tools|templates|guides)(\/|$)/;

/** The one list of what's coming names these, marked "Not available yet". */
const NAMES_A_PROVIDER =
    /^\/(tools|templates|guides|changelog|integrations)(\/|$)/;

export const BANNED = [
    { phrase: /\b(tap|taps|tapped) accept\b/i },
    { phrase: /\baccepts? (it )?online\b/i },
    { phrase: /\b(your )?client accepts\b/i },
    { phrase: /\bapprovals? with history\b/i },
    { phrase: /\bquote approvals?\b/i },
    { phrase: /\bevery version and every\b/i },
    { phrase: /\bclient pages?\b/i },
    { phrase: /\bone page for every client\b/i },
    { phrase: /\bpay button\b/i },
    { phrase: /\bpay now\b/i, except: ABOUT_DOCS },
    { phrase: /\bno login\b/i },
    { phrase: /\bsee when (they|your client)\b/i },
    { phrase: /\byou see when\b/i },
    { phrase: /\bget a yes\b/i },
    { phrase: /\baccepted quote\b/i },
    { phrase: /\bfrom quote to paid\b/i },
    { phrase: /\bsend a quote\b/i, except: ABOUT_DOCS },
    { phrase: /\bquotes?(,| and) invoices\b/i, except: ABOUT_DOCS },
    { phrase: /\bany currency\b/i, except: ABOUT_DOCS },
    { phrase: /\bSMS\b/ },
    { phrase: /\b0% fees?\b/i },
    { phrase: /\bwe take 0%/i },
    { phrase: /\bnever touch(es)?\b/i },
    { phrase: /\btake a cut\b/i },
    { phrase: /\bmerchant of record\b/i },
    { phrase: /\b(stripe|paypal)\b/i, except: NAMES_A_PROVIDER },
    { phrase: /\byour own (stripe|paypal)\b/i },
    { phrase: /\bstripe, paypal\b/i },
    { phrase: /\bpay link\b/i },
    { phrase: /\bpayable link\b/i },
    { phrase: /\btax invoices?\b/i, except: ABOUT_TAX },
    { phrase: /\bGST invoices?\b/i, except: ABOUT_TAX },
    { phrase: /\bVAT invoices?\b/i, except: ABOUT_TAX },
    { phrase: /\bUPI\b/, except: /^\/$/ },
    { phrase: /\b(razorpay|cashfree)\b/i },
];

/** The words a visitor reads: no scripts, no markup. The India bar is the Worker's. */
export function visibleText(html) {
    return html
        .replace(/<aside[^>]*data-region-bar[\s\S]*?<\/aside>/g, " ")
        .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ");
}

export function findClaims(path, text) {
    return BANNED.filter(
        (b) => b.phrase.test(text) && !b.except?.test(path),
    ).map((b) => ({ path, phrase: text.match(b.phrase)[0] }));
}

export function checkSite(out) {
    if (!existsSync(out))
        throw new Error(`${out} is missing: build the site first`);
    return readdirSync(out, { recursive: true })
        .map(String)
        .filter((f) => f.endsWith(".html"))
        .flatMap((f) => {
            const path = `/${relative(".", f).replace(/\.html$/, "")}`.replace(
                /^\/index$/,
                "/",
            );
            return findClaims(
                path,
                visibleText(readFileSync(join(out, f), "utf8")),
            );
        });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const out = fileURLToPath(new URL("../out", import.meta.url));
    let found;
    try {
        found = checkSite(out);
    } catch (err) {
        console.error(`check-claims: ${err.message}`);
        process.exit(1);
    }
    for (const f of found) console.error(`${f.path}: "${f.phrase}"`);
    console.log(`check-claims: ${found.length} found`);
    // shortcut: reports only until U9 of the global edition plan rewrites the old pages; drop the flag then.
    if (found.length && !process.argv.includes("--report-only"))
        process.exit(1);
}
