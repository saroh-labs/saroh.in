import type { LookId } from "@saroh/block-contract";

/**
 * The account's cards, rows, tags, buttons, fields and sheets in each
 * look (DEC-172, plan U12), as one stylesheet scoped to the look's account
 * (`[data-account-look=…]`, drawn only under a look).
 *
 * Every screen of the account is built from the same few parts
 * (`parts.tsx`, the sheets and their fields). Classic draws them exactly
 * as before (`classic-account-pin.test.tsx`), so a look restyles them here
 * by the classes they already carry, the way U7's `cardCorners` restyles
 * the blocks drawn by tokens alone, rather than by a second copy of every
 * screen. Which part each selector finds is held by
 * `looks-account.test.tsx`: a part that changes its classes fails it.
 *
 * THE RADIUS RULE (U4 "Corners"): a look's `--site-radius` is its buttons
 * and inputs (a pill under Quiet, square under Folio). The account's
 * parts round themselves from that radius plus a little, so here every
 * such corner becomes the look's small radius (cards, rows, fields,
 * sheets), and only the buttons keep the look's own: never a capsule card
 * under Quiet, never a rounded box under Folio.
 *
 * Colours and faces are the business's (`--site-*` only, gate G2).
 */

/** The parts, by the classes they carry. */
export const ACCOUNT_PARTS = {
    /** `AccountCard` and the held card standing in for it. */
    card: 'section[class*="rounded-[calc(var(--site-radius)+12px)]"]',
    /** A card the customer is waited on for (`needsYou`). */
    cardNeedsYou:
        'section[class*="shadow-[inset_3px_0_0_hsl(var(--site-accent))]"]',
    /** A card's title (an `h2`). */
    cardTitle:
        'section[class*="rounded-[calc(var(--site-radius)+12px)]"] > div:first-child > h2',
    /** `AccountRow`'s title. */
    rowTitle: 'span[class*="text-[15px] font-semibold leading-snug"]',
    /** `Tag`. */
    tag: 'span[class*="rounded-full px-2.5 py-[3px]"]',
    /** Every corner the account rounds from the button's radius. */
    rounded: '[class*="rounded-[calc(var(--site-radius)+"]',
    /** The buttons among them: `buttonClasses`, the row's and a sheet's. */
    button: [
        'a[class*="rounded-[calc(var(--site-radius)+6px)]"]',
        'button[class*="rounded-[calc(var(--site-radius)+6px)]"]',
        'a[class*="rounded-[calc(var(--site-radius)+8px)]"]',
        'button[class*="rounded-[calc(var(--site-radius)+8px)]"]',
        'button[class*="rounded-[calc(var(--site-radius)+10px)]"]',
    ].join(", "),
    /** A page's column of cards (Home, Orders, Plan, Your details…). */
    stack: '[data-account-body] [class~="gap-3.5"]',
    /** A sheet rising from the foot (the account's and sign-in's). */
    sheet: '[class*="rounded-t-[calc(var(--site-radius)+18px)]"]',
} as const;

/** `ACCOUNT_PARTS[part]` under the look's scope, for each comma part. */
function within(scope: string, selector: string): string {
    return selector
        .split(/,\s*(?=[a-z[])/)
        .map((s) => `${scope} ${s.trim()}`)
        .join(",\n");
}

/** The eyebrow a card's title reads as under Folio and Quiet. */
const EYEBROW = `
                font-family: var(--site-font-body);
                font-size: 12px;
                font-weight: 600;
                line-height: 1.4;
                letter-spacing: 0.16em;
                text-transform: uppercase;
                color: hsl(var(--site-muted));`;

/** Each look's card, card title, row title and tag. */
const LOOK_PARTS: Record<
    LookId,
    {
        card: string;
        needsYou: string;
        title: string;
        row: string;
        tag: string;
        /** The air between a page's cards. */
        gap: string;
    }
> = {
    // VA19–24: a printed page. Each card is a section under an ink rule;
    // one waiting on her is boxed in a double rule, as the ticket is.
    folio: {
        card: `
                background: transparent;
                border: 0;
                border-top: 1px solid hsl(var(--site-fg));
                border-radius: 0;
                box-shadow: none;
                padding: 20px 0 0;`,
        needsYou: `
                border: 1px solid hsl(var(--site-fg));
                outline: 1px solid hsl(var(--site-fg));
                outline-offset: 3px;
                margin: 4px;
                padding: 20px;`,
        title: EYEBROW,
        row: `
                font-family: var(--site-font-heading);
                font-size: 20px;
                font-weight: 400;
                letter-spacing: -0.01em;`,
        tag: `
                border-radius: 0;
                background: transparent;
                color: hsl(var(--site-fg));
                box-shadow: inset 0 0 0 1px hsl(var(--site-fg));`,
        gap: "40px",
    },
    // VD19–24: warm white and air. Hairlines, no boxes; the thing waiting
    // on her sits under the ink rule instead.
    quiet: {
        card: `
                background: transparent;
                border: 0;
                border-top: 1px solid hsl(var(--site-border));
                border-radius: 0;
                box-shadow: none;
                padding: 28px 0 0;`,
        needsYou: `
                border-top-color: hsl(var(--site-fg));`,
        title: EYEBROW,
        row: `
                font-family: var(--site-font-heading);
                font-size: 22px;
                font-weight: 400;
                letter-spacing: -0.005em;`,
        tag: `
                background: transparent;
                color: hsl(var(--site-body));
                box-shadow: inset 0 0 0 1px hsl(var(--site-border));`,
        gap: "48px",
    },
    // VB19–24: app-like cards on the tinted ground, the heading face
    // heavy and tight.
    live: {
        card: `
                background: hsl(var(--site-surface));
                border-color: transparent;
                border-radius: var(--site-radius);
                box-shadow: none;
                padding: 20px;`,
        needsYou: `
                box-shadow: inset 0 0 0 2px hsl(var(--site-accent));`,
        title: `
                font-size: 20px;
                font-weight: 800;
                letter-spacing: -0.02em;`,
        row: `
                font-weight: 700;`,
        tag: `
                border-radius: 999px;`,
        gap: "14px",
    },
};

/** The account's stylesheet under `look`, scoped to its own wrapper. */
export function accountLookRules(look: LookId): string {
    const at = `[data-account-look="${look}"]`;
    const part = LOOK_PARTS[look];
    return `
            ${within(at, ACCOUNT_PARTS.rounded)} {
                border-radius: var(--site-radius-s, var(--site-radius));
            }
            ${within(at, ACCOUNT_PARTS.button)} {
                border-radius: var(--site-radius);
            }
            ${within(at, ACCOUNT_PARTS.sheet)} {
                border-top-left-radius: var(--site-radius-s, var(--site-radius));
                border-top-right-radius: var(--site-radius-s, var(--site-radius));
            }
            ${within(at, ACCOUNT_PARTS.card)} {${part.card}
            }
            ${within(at, ACCOUNT_PARTS.cardNeedsYou)} {${part.needsYou}
            }
            ${within(at, ACCOUNT_PARTS.cardTitle)} {${part.title}
            }
            ${within(at, ACCOUNT_PARTS.rowTitle)} {${part.row}
            }
            ${within(at, ACCOUNT_PARTS.tag)} {${part.tag}
            }
            ${within(at, ACCOUNT_PARTS.stack)} {
                row-gap: ${part.gap};
            }`;
}
