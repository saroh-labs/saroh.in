import { describe, expect, it } from "vitest";

import type { MergeAccountPreview, MergePreview, MergePreviews } from "./merge";
import {
    accountView,
    clashTarget,
    columnHeading,
    columnName,
    consentLines,
    defaultPicks,
    duplicateLine,
    isMergedRedirect,
    keptColumn,
    mergeBlock,
    mergeBody,
    mergedRedirectPath,
    mergedToast,
    mergeRows,
    mergeSubtitle,
    movesLine,
    pickable,
    sideOf,
    suggestedTarget,
} from "./merge";

/**
 * The merge dialog's rules and words (C10), over the two previews C9
 * answers: one keeping this record (Priya Raman, six orders), one keeping
 * the till's duplicate (Priya R., one order, a phone and no email).
 */

const HERE = "c_here";
const THERE = "c_there";

const NO_ACCOUNT: MergeAccountPreview = {
    action: "none",
    seesCombined: null,
    stopsReaching: null,
    confirmationRequired: false,
};

const NOT_ASKED = { status: null, from: null } as const;

function preview(
    keep: "here" | "there",
    over: Partial<MergePreview> = {},
): MergePreview {
    const hereSide = keep === "here" ? "survivor" : "other";
    const thereSide = keep === "here" ? "other" : "survivor";
    return {
        survivorId: keep === "here" ? HERE : THERE,
        otherId: keep === "here" ? THERE : HERE,
        moves:
            keep === "here"
                ? [{ key: "orders", count: 1, label: "1 order" }]
                : [
                      { key: "orders", count: 6, label: "6 orders" },
                      { key: "notes", count: 2, label: "2 notes" },
                  ],
        choices: {
            name: {
                [hereSide]: "Priya Raman",
                [thereSide]: "Priya R.",
            } as MergePreview["choices"]["name"],
            email: {
                [hereSide]: "priya@example.in",
                [thereSide]: null,
            } as MergePreview["choices"]["email"],
            phone: {
                [hereSide]: null,
                [thereSide]: "+91 98450 11223",
            } as MergePreview["choices"]["phone"],
        },
        consent: [
            {
                channel: "EMAIL",
                ifKept: { survivor: NOT_ASKED, other: NOT_ASKED },
            },
            {
                channel: "WHATSAPP",
                ifKept: { survivor: NOT_ASKED, other: NOT_ASKED },
            },
        ],
        account: { carried: NO_ACCOUNT, notCarried: NO_ACCOUNT },
        refusals: [],
        ...over,
    };
}

const both = (): MergePreviews => ({
    here: preview("here"),
    there: preview("there"),
});

describe("columns and sides", () => {
    it("knows which column a preview keeps, and each column's side", () => {
        const p = preview("there");
        expect(keptColumn(p, HERE)).toBe("there");
        expect(sideOf(p, HERE, "there")).toBe("survivor");
        expect(sideOf(p, HERE, "here")).toBe("other");
    });

    it("heads each column with what the record holds, as the design does", () => {
        const p = both();
        expect(columnHeading(p, HERE, "here")).toBe("This record · 6 orders");
        expect(columnHeading(p, HERE, "there")).toBe("Priya R. · 1 order");
    });

    it("heads a record with nothing to move by its name alone", () => {
        const p = both();
        p.here = preview("here", { moves: [] });
        expect(columnHeading(p, HERE, "there")).toBe("Priya R.");
    });

    it("names an unnamed other record by what the page knew, then a phrase", () => {
        const p = both();
        for (const x of [p.here, p.there]) {
            x.choices.name = { survivor: null, other: null };
        }
        expect(columnName(p, HERE, "there", "priya@till.in")).toBe(
            "priya@till.in",
        );
        expect(columnName(p, HERE, "there")).toBe("Their other record");
        expect(columnName(p, HERE, "here")).toBe("This record");
    });
});

describe("rows and picks", () => {
    it("lays name, email and phone out by column, whichever is kept", () => {
        for (const keep of ["here", "there"] as const) {
            const rows = mergeRows(preview(keep), HERE);
            expect(rows.map((r) => r.label)).toEqual([
                "Name",
                "Email",
                "Phone",
            ]);
            expect(rows[0].values).toEqual({
                here: "Priya Raman",
                there: "Priya R.",
            });
            expect(rows[1].values).toEqual({
                here: "priya@example.in",
                there: null,
            });
        }
    });

    it("picks the kept record's values, but never an empty one over a value", () => {
        expect(defaultPicks(preview("here"), HERE)).toEqual({
            name: "here",
            email: "here",
            // This record has no phone; the duplicate's is taken.
            phone: "there",
        });
        expect(defaultPicks(preview("there"), HERE)).toEqual({
            name: "there",
            email: "here",
            phone: "there",
        });
    });

    it("won't pick a column with nothing in it", () => {
        const [, email] = mergeRows(preview("here"), HERE);
        expect(pickable(email, "here")).toBe(true);
        expect(pickable(email, "there")).toBe(false);
    });

    it("sends the picks as the kept record's sides", () => {
        const p = preview("here");
        expect(
            mergeBody(
                p,
                HERE,
                { name: "there", email: "here", phone: "there" },
                true,
                false,
            ),
        ).toEqual({
            survivorId: HERE,
            name: "other",
            email: "survivor",
            phone: "other",
            carryAccount: true,
            accountConfirmed: false,
        });
        // Keeping the other record turns the same columns round.
        expect(
            mergeBody(
                preview("there"),
                HERE,
                { name: "there", email: "here", phone: "there" },
                false,
                true,
            ),
        ).toMatchObject({
            survivorId: THERE,
            name: "survivor",
            email: "other",
            phone: "survivor",
            carryAccount: false,
            accountConfirmed: true,
        });
    });
});

describe("what it says", () => {
    it("says what moves to the record kept, and that the other goes", () => {
        expect(movesLine(preview("here"), "Priya Raman")).toBe(
            "1 order moves to Priya Raman, and the other record goes away.",
        );
        expect(movesLine(preview("there"), "Priya R.")).toBe(
            "6 orders and 2 notes move to Priya R., and the other record goes away.",
        );
        expect(movesLine(preview("here", { moves: [] }), "Priya Raman")).toBe(
            "The other record has nothing to move, and it goes away. Priya Raman stays.",
        );
    });

    it("words the title's line by where the merge was opened", () => {
        expect(mergeSubtitle("suggestion", "Priya R.")).toBe(
            "We found one record that looks like the same person.",
        );
        expect(mergeSubtitle("clash", "Asha Rao")).toMatch(
            /^Asha Rao already has that email/,
        );
        expect(mergeSubtitle("search", "Asha Rao")).toBe(
            "Merging this record with Asha Rao.",
        );
    });

    it("toasts the merged record's name", () => {
        expect(mergedToast("Priya R.")).toBe(
            "Merged. All of Priya R.'s orders, bookings and notes are here now.",
        );
    });

    it("describes a suggested duplicate by what matched", () => {
        expect(
            duplicateLine({
                name: "Priya R.",
                email: null,
                matchedOn: ["phone"],
                signsIn: false,
            }),
        ).toBe("Priya R. has the same phone.");
        expect(
            duplicateLine({
                name: "Asha",
                email: "asha@x.in",
                matchedOn: ["email", "phone"],
                signsIn: true,
            }),
        ).toBe(
            "Asha (asha@x.in) has the same email and phone. They sign in on your website.",
        );
        expect(
            duplicateLine({
                name: null,
                email: null,
                matchedOn: ["email"],
                signsIn: false,
            }),
        ).toBe("Another record has the same email.");
    });
});

describe("offers per channel (default 24)", () => {
    const names = { here: "Priya Raman", there: "Priya R." };

    it("follows the email pick for email and the phone pick for WhatsApp", () => {
        const p = preview("here", {
            consent: [
                {
                    channel: "EMAIL",
                    ifKept: {
                        survivor: { status: "REVOKED", from: "survivor" },
                        other: { status: "GRANTED", from: "other" },
                    },
                },
                {
                    channel: "WHATSAPP",
                    ifKept: {
                        survivor: NOT_ASKED,
                        other: { status: "GRANTED", from: "other" },
                    },
                },
            ],
        });
        expect(
            consentLines(
                p,
                HERE,
                { name: "here", email: "here", phone: "here" },
                names,
            ),
        ).toEqual([
            "Offers by email: No — from this record",
            "Offers on WhatsApp: not asked — they'll need to say yes again",
        ]);
        expect(
            consentLines(
                p,
                HERE,
                { name: "here", email: "there", phone: "there" },
                names,
            ),
        ).toEqual([
            "Offers by email: Yes — from Priya R.'s record",
            "Offers on WhatsApp: Yes — from Priya R.'s record",
        ]);
    });

    it("leaves out a channel neither record answered", () => {
        expect(
            consentLines(
                preview("here"),
                HERE,
                defaultPicks(preview("here"), HERE),
                names,
            ),
        ).toEqual([]);
    });
});

describe("the site account (ADR-011)", () => {
    const moving: MergePreview["account"] = {
        carried: {
            action: "move",
            seesCombined:
                "p•••@gmail.com signs in on your website and will see everything here",
            stopsReaching: null,
            confirmationRequired: true,
        },
        notCarried: {
            action: "retire",
            seesCombined: null,
            stopsReaching:
                "p•••@gmail.com will no longer sign in to this record",
            confirmationRequired: false,
        },
    };

    it("names who will see the record, and waits for the tick", () => {
        const p = preview("here", { account: moving });
        expect(accountView(p, true)).toEqual({
            lines: [moving.carried.seesCombined],
            canLeaveBehind: true,
            needsConfirm: true,
        });
        expect(mergeBlock(p, true, false)).toBe(
            "Tick that you've checked the email first.",
        );
        expect(mergeBlock(p, true, true)).toBeNull();
    });

    it("needs no tick when the sign-in isn't carried over", () => {
        const p = preview("here", { account: moving });
        expect(accountView(p, false)).toEqual({
            lines: [moving.notCarried.stopsReaching],
            canLeaveBehind: true,
            needsConfirm: false,
        });
        expect(mergeBlock(p, false, false)).toBeNull();
    });

    it("says both lines when both sign in", () => {
        const p = preview("here", {
            account: {
                carried: {
                    action: "retire",
                    seesCombined:
                        "a•••@x.in signs in on your website and will see everything here",
                    stopsReaching:
                        "b•••@y.in will be asked to sign in with a•••@x.in instead",
                    confirmationRequired: true,
                },
                notCarried: {
                    action: "retire",
                    seesCombined:
                        "a•••@x.in signs in on your website and will see everything here",
                    stopsReaching:
                        "b•••@y.in will be asked to sign in with a•••@x.in instead",
                    confirmationRequired: true,
                },
            },
        });
        const view = accountView(p, true);
        expect(view.lines).toHaveLength(2);
        expect(view.canLeaveBehind).toBe(false);
    });
});

describe("refusals", () => {
    it("says the refusal and keeps Merge off, whatever is ticked", () => {
        const p = preview("here", {
            refusals: [
                {
                    reason: "same-plan",
                    message: "Cancel one of their Monthly subscriptions first",
                },
            ],
        });
        expect(mergeBlock(p, true, true)).toBe(
            "Cancel one of their Monthly subscriptions first",
        );
    });
});

describe("where the merge is opened from", () => {
    it("takes a suggestion's name, else its email", () => {
        expect(
            suggestedTarget({
                contactId: "c_2",
                name: null,
                email: "p@x.in",
            }),
        ).toEqual({ contactId: "c_2", name: "p@x.in", from: "suggestion" });
    });

    it("takes the edit sheet's clash as it came", () => {
        expect(clashTarget({ contactId: "c_3", name: "Asha Rao" })).toEqual({
            contactId: "c_3",
            name: "Asha Rao",
            from: "clash",
        });
    });
});

describe("the old address", () => {
    it("goes to the record kept, on the same tab", () => {
        expect(mergedRedirectPath("c_1")).toBe("/customers/c_1");
        expect(mergedRedirectPath("c_1", "ord")).toBe("/customers/c_1?tab=ord");
    });

    it("tells a merged answer from a customer", () => {
        expect(isMergedRedirect({ mergedInto: "c_1" })).toBe(true);
        expect(isMergedRedirect({ contact: { id: "c_1" } })).toBe(false);
        expect(isMergedRedirect(null)).toBe(false);
    });
});
