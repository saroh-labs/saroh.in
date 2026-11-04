#!/usr/bin/env node
/**
 * What saroh.tech may not say. The product has no quotes to accept, no client
 * approvals, and no online payment or plan on sale yet (the private ledger,
 * DEC-203). Runs over the built HTML as `postbuild`, because that's what a
 * visitor reads, whichever file the words came from, so a hit fails the build.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// The allow-list. Nothing else may say these; each says why it may.

/** A template or tax tool tells people what a tax invoice is in their country. */
const ABOUT_TAX =
    /^\/(templates|guides|tools\/(gst|vat|sales-tax)-calculator)(\/|$)/;

/** The free tools and guides make the paper itself: a quote is a document there. */
const ABOUT_DOCS = /^\/(tools|templates|guides)(\/|$)/;

/** A receipt says how it was paid; the one list of what's coming says "Not available yet". */
const NAMES_A_PROVIDER =
    /^\/(tools\/receipt-maker|changelog|integrations)(\/|$)/;

/** Advice and paper for anyone's trade, or the law's words: not what the product does for you. */
const NOT_THE_PRODUCT =
    /^\/(tools|templates|guides|legal|customers|contact)(\/|$)/;

/**
 * Until plans are on sale here, the pages speak to one person running their
 * business, so nothing about the product may need several people: not a second
 * login, and not a second person on the diary, who with no login still takes a
 * seat (DEC-155, DEC-203).
 */
export const ONE_PERSON = [
    /\bby stylist\b/i,
    /\bstylists?\b/i,
    /\beach (person|trainer|barber|dentist|teacher|therapist|helper|artist)\b/i,
    /\byour (team|staff|trainers?|barbers?|teachers?|helpers?)\b/i,
    /\bthe (whole )?team\b/i,
    /\bthe trainers\b/i,
    /\bmy team\b/i,
    /\bsmall team\b/i,
    /\bwith (your )?staff\b/i,
    /\bwith (whom|which)\b/i,
    /\bwho does what\b/i,
    /\bright (people|roles?)\b/i,
    /\beach role\b/i,
    /\bgets? a role\b/i,
    /\bwhose role\b/i,
    /\bpermissions?\b/i,
    /\bwho can (edit|change|see|count)\b/i,
    /\banyone you allow\b/i,
];

export const BANNED = [
    { phrase: /\b(tap|taps|tapped) accept\b/i },
    { phrase: /\baccepts? (it )?online\b/i },
    { phrase: /\b(your )?client accepts\b/i },
    { phrase: /\bapprovals? with history\b/i },
    { phrase: /\bquote approvals?\b/i },
    { phrase: /\bevery version and every\b/i },
    { phrase: /\bclient pages?\b/i },
    { phrase: /\b(one |a )page for every client\b/i },
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
    { phrase: /\bany currency\b/i },
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
    { phrase: /\byour own (payment )?link\b/i },
    { phrase: /\bcustomer accepts\b/i },
    { phrase: /\bapprove it online\b/i },
    { phrase: /\bwhen they opened\b/i },
    { phrase: /\bin one tap\b/i },
    { phrase: /\bclass packs?\b/i },
    { phrase: /\btax invoices?\b/i, except: ABOUT_TAX },
    { phrase: /\bGST invoices?\b/i, except: ABOUT_TAX },
    { phrase: /\bVAT invoices?\b/i, except: ABOUT_TAX },
    { phrase: /\bUPI\b/ },
    { phrase: /\b(razorpay|cashfree)\b/i },
    ...ONE_PERSON.map((phrase) => ({ phrase, except: NOT_THE_PRODUCT })),
];

/** The words a visitor, a screen reader or a search engine reads. The India bar is the Worker's. */
export function visibleText(html) {
    const description =
        /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? "";
    const page = html.replace(
        /<aside[^>]*data-region-bar[\s\S]*?<\/aside>/g,
        " ",
    );
    const attributes = [
        ...page.matchAll(/\b(?:alt|aria-label)="([^"]*)"/g),
    ].map((m) => m[1]);
    const jsonLd = [
        ...page.matchAll(
            /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g,
        ),
    ].map((m) => m[1]);
    return `${description} ${attributes.join(" ")} ${jsonLd.join(" ")} ${page}`
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
    if (found.length) process.exit(1);
}
