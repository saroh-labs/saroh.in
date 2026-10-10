import { findReusable, targetKey } from "./targets";
import type { QrCodeInput, QrCodeView, QrTargetKind } from "./types";
import { QR_PLACE_NOTE_MAX } from "./types";
import { defaultLabel } from "./words";

/**
 * The QR button beside a link the workspace already shows (plan U7,
 * DEC-118): what it is asked for, and what its panel reads. Pure and
 * client-safe; the read itself is `panel-read.ts`.
 *
 * Two kinds, as the decision has them. A **saved code** for a page that
 * stays (the website, the shop, the booking page, a product, a page): a
 * row with a short link, found or made. An **instant QR** for a link that
 * belongs to one record (a pay link, a draft's preview): drawn in the
 * browser, nothing saved, not counted.
 */

export interface QrSavedLink {
    mode: "saved";
    kind: QrTargetKind;
    /** The product's or page's id; none for the others. */
    ref?: string | null;
    /** The site the link is on; the business's own when left out. */
    siteId?: string;
    /** The public link the screen shows: what an instant QR falls back to. */
    url: string;
    /** "your website", "Argan shampoo": ends "QR code for …". */
    what: string;
    /** Where the button is, kept as the made code's place: "Website screen". */
    from: string;
}

export interface QrInstantLink {
    mode: "instant";
    url: string;
    /** "this invoice's pay link": ends "QR code for …". */
    what: string;
    /** What a scan opens, said in the panel. */
    opens: "pay" | "invoice" | "preview";
    /** The download's name, without the extension: "pay-link-qr". */
    fileName: string;
}

export type QrLink = QrSavedLink | QrInstantLink;

/** What the panel learns when it opens on a saved link. */
export type QrPanelRead =
    | {
          state: "ready";
          siteId: string;
          /** Whether the short links open now: the site is published. */
          live: boolean;
          /** `site:update`: may make the code. */
          canChange: boolean;
          /** The code this target already has; null: none yet. */
          code: QrCodeView | null;
          business: {
              name: string;
              initials: string;
              /** The logo as a `data:` URL; only read for a branded code. */
              logo: string | null;
          };
      }
    /** No website, Website off, or codes this role can't see: instant only. */
    | { state: "unavailable" }
    /** We couldn't find out. Never an empty answer. */
    | { state: "failed" };

/**
 * The code a button shows for its target: the one made from that same
 * place before, else the newest code the target has anywhere (the list is
 * newest first). Retired codes never match (`findReusable`'s rule), so a
 * button never hands out a code that opens the home page.
 */
export function findPanelCode(
    codes: readonly QrCodeView[],
    want: Pick<QrSavedLink, "kind" | "ref" | "from">,
): QrCodeView | null {
    const key = targetKey(want.kind, want.ref ?? null);
    return (
        findReusable(codes, {
            targetKey: key,
            place: "OTHER",
            placeNote: want.from,
        }) ??
        codes.find(
            (c) => !c.retired && targetKey(c.target.kind, c.target.ref) === key,
        ) ??
        null
    );
}

/**
 * What "Make this code" sends: a plain code (every plan has those) placed
 * "Other", with where the button was pressed as its note, so the list in
 * Settings › Share says where it came from.
 */
export function panelCodeInput(
    want: Pick<QrSavedLink, "kind" | "ref" | "from">,
): QrCodeInput {
    return {
        targetKind: want.kind,
        targetRef: want.ref ?? null,
        place: "OTHER",
        placeNote: want.from.trim().slice(0, QR_PLACE_NOTE_MAX) || null,
        label: defaultLabel(want.kind),
        style: "PLAIN",
    };
}

/** What a scan of an instant QR opens, in one line. */
export function instantOpens(opens: QrInstantLink["opens"]): string {
    if (opens === "pay") {
        return "Opens the pay page for this link. It isn't the UPI QR on the invoice.";
    }
    if (opens === "invoice") {
        return "Opens this invoice for your customer to view.";
    }
    return "Opens the preview of your draft. It stops working when the preview link does.";
}

/** Said under every instant QR. */
export const NOT_COUNTED =
    "Not counted. It is drawn here for this link only, and nothing is saved.";

/** Where the saved codes are managed. */
export const QR_SHARE_HREF = "/settings/share";
