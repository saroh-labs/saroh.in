import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { ALERT_NOTIFICATION_TYPES } from "./alert-preferences";
import type { NoticeType } from "./notice-target";
import {
    isNoticeType,
    NOTICE_KINDS,
    noticeHeadOf,
    noticeOf,
    noticeTargetOf,
} from "./notice-target";

/**
 * Every notice opens the thing it is about (10 Oct 2026). A "New order"
 * and a "New booking" used to be written with a type, a title and a body
 * only, so their inbox rows led nowhere. These tests are what keeps a new
 * writer from doing that again: they read the source.
 */

const SRC = join(__dirname, "..", "..");
const DATABASE_SRC = join(
    __dirname,
    "..",
    "..",
    "..",
    "..",
    "..",
    "packages",
    "database",
    "src",
);

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
            return name === "node_modules" || name === "generated"
                ? []
                : sourceFiles(path);
        }
        return /\.ts$/.test(name) && !/\.(spec|test)\.ts$/.test(name)
            ? [path]
            : [];
    });
}

const WRITE = /\bnotification\s*\.\s*(create|createMany|upsert)\s*\(/g;

/** Each place a notice is written, with the call's own text. */
function writers(root: string): { file: string; call: string }[] {
    return sourceFiles(root).flatMap((file) => {
        const text = readFileSync(file, "utf8");
        return [...text.matchAll(WRITE)].map((m) => {
            // The call, to its closing parenthesis.
            let depth = 0;
            let end = m.index;
            for (let i = m.index + m[0].length - 1; i < text.length; i++) {
                if (text[i] === "(") depth++;
                if (text[i] === ")") depth--;
                if (depth === 0) {
                    end = i;
                    break;
                }
            }
            return {
                file: relative(SRC, file),
                call: text.slice(m.index, end + 1),
            };
        });
    });
}

describe("every notice has something to open", () => {
    const api = writers(SRC);

    it("finds the writers (or this test checks nothing)", () => {
        expect(api.length).toBeGreaterThanOrEqual(11);
    });

    it.each(api)(
        "$file writes its notice through noticeOf, so its target is required",
        ({ call }) => {
            expect(call).toMatch(/\.\.\.notice(Head)?Of\(/);
            // And never names a bare type beside it.
            expect(call).not.toMatch(/^\s*type:/m);
        },
    );

    it("the catalogue backfill's notice is listed, and opens a page", () => {
        // `@saroh/database` can't import the API, so its one notice is
        // checked here: nothing else there writes one.
        const found = writers(DATABASE_SRC).filter(
            (w) => !w.file.includes("seed"),
        );
        expect(found.map((w) => w.file.split("/").pop())).toEqual([
            "merge-same-products.ts",
        ]);
        const text = readFileSync(
            join(DATABASE_SRC, "backfill", "merge-same-products.ts"),
            "utf8",
        );
        const type = /MERGE_REPORT_NOTICE = "([^"]+)"/.exec(text)?.[1] ?? "";
        expect(isNoticeType(type)).toBe(true);
        expect(NOTICE_KINDS[type as NoticeType]).toBe("products");
    });

    it("every notice type a module declares is listed with what it opens", () => {
        const declared = sourceFiles(SRC).flatMap((file) =>
            [
                ...readFileSync(file, "utf8").matchAll(
                    /(?:_NOTIFICATION_TYPE|REVIEW_NOTICE_TYPE)\s*=\s*"([^"]+)"/g,
                ),
            ].map((m) => m[1] ?? ""),
        );
        expect(declared.length).toBeGreaterThanOrEqual(15);
        expect(declared.filter((type) => !isNoticeType(type))).toEqual([]);
    });

    it("every type the alert rows cover is listed too", () => {
        const covered = Object.values(ALERT_NOTIFICATION_TYPES).flat();
        expect(covered.filter((type) => !isNoticeType(type))).toEqual([]);
    });
});

describe("noticeOf", () => {
    it("gives the type and the column its kind requires", () => {
        expect(noticeOf("order.new", { orderId: "ord_1" })).toEqual({
            type: "order.new",
            orderId: "ord_1",
        });
        expect(noticeOf("booking.moved", { bookingId: "bk_1" })).toEqual({
            type: "booking.moved",
            bookingId: "bk_1",
        });
        expect(noticeOf("team.joined", {})).toEqual({ type: "team.joined" });
    });

    it("doesn't compile without the target, or with another kind's", () => {
        // @ts-expect-error a new order's notice must name the order
        noticeOf("order.new", {});
        // @ts-expect-error a booking's notice opens a booking, not an order
        noticeOf("booking.new", { orderId: "ord_1" });
        // @ts-expect-error not a notice type: add it to NOTICE_KINDS
        noticeOf("order.shipped", {});
        expect(true).toBe(true);
    });
});

describe("noticeHeadOf (the team alerts' one writer)", () => {
    it("keeps the target a worded alert carries", () => {
        expect(
            noticeHeadOf({
                type: "payment.failed",
                invoiceId: "inv_1",
                // Not columns: an alert carries more than its notice.
                ...({ title: "x", path: "/y" } as object),
            }),
        ).toEqual({ type: "payment.failed", invoiceId: "inv_1" });
    });

    it("refuses a notice that would open nothing", () => {
        expect(() => noticeHeadOf({ type: "order.new" })).toThrow(
            /must set orderId/,
        );
        expect(() => noticeHeadOf({ type: "site.live" })).toThrow(
            /must set siteId/,
        );
    });

    it("refuses a type nobody listed", () => {
        expect(() => noticeHeadOf({ type: "order.shipped" })).toThrow(
            /NOTICE_KINDS/,
        );
    });

    it("lets a page's notice, and a domain that lost its site, through", () => {
        expect(noticeHeadOf({ type: "provider.attention" })).toEqual({
            type: "provider.attention",
        });
        expect(noticeHeadOf({ type: "domain.down", siteId: null })).toEqual({
            type: "domain.down",
        });
    });
});

describe("noticeTargetOf (what the inbox is told)", () => {
    it("has an answer for every listed type", () => {
        for (const type of Object.keys(NOTICE_KINDS)) {
            expect(noticeTargetOf({ type })).toEqual({
                kind: NOTICE_KINDS[type as NoticeType],
                id: null,
            });
        }
    });

    it("reads the record from the kind's own column", () => {
        expect(
            noticeTargetOf({ type: "message.new", contactId: "c_1" }),
        ).toEqual({ kind: "contact", id: "c_1" });
        expect(
            noticeTargetOf({ type: "domain.back", siteId: "site_1" }),
        ).toEqual({ kind: "domain", id: "site_1" });
    });

    it("opens what an unlisted type's columns say, else nothing known", () => {
        expect(
            noticeTargetOf({ type: "order.shipped", orderId: "ord_1" }),
        ).toEqual({ kind: "order", id: "ord_1" });
        expect(noticeTargetOf({ type: "something.new" })).toBeNull();
    });
});
