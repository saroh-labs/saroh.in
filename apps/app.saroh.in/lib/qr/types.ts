import type { PlanRefusal } from "@/lib/billing/refusal";

/**
 * A site's QR codes as the API serves them (`organizations/:org/sites/:site/
 * qr-codes`, `qr-codes.view.ts` there). Types and the API's bounds only, so
 * the client screen and the server reads share them.
 */

export type QrTargetKind = "SITE" | "SHOP" | "BOOK" | "PRODUCT" | "PAGE";
export type QrPlace = "COUNTER" | "MIRROR" | "CARD" | "FLYER" | "OTHER";
export type QrStyle = "PLAIN" | "BRANDED";

/** The API's bounds (`qr-codes.dto.ts`). */
export const QR_LABEL_MAX = 40;
export const QR_PLACE_NOTE_MAX = 60;

export interface QrCodeView {
    id: string;
    /** The short id in the link. Never changes. */
    code: string;
    /** `https://<address>.saroh.app/q/<code>`; null: the site has no address. */
    link: string | null;
    target: {
        kind: QrTargetKind;
        ref: string | null;
        name: string;
        /** Where on the site it opens; null while it can't be opened. */
        path: string | null;
        /** The product or page it named is gone: a scan opens the home page. */
        missing: boolean;
    };
    place: QrPlace;
    placeNote: string | null;
    label: string | null;
    style: QrStyle;
    /** "#rrggbb". */
    color: string;
    retired: boolean;
    retiredAt?: string | null;
    createdAt?: string;
    updatedAt?: string;
    scans: { total: number; last7Days: number };
    /** Made from a page this code opened. */
    bookings: number;
    orders: number;
}

export interface QrCodesView {
    /** `https://<address>.saroh.app`; null: the site has no Saroh address. */
    origin: string | null;
    /** Whether the short links open now: the site is published. */
    live: boolean;
    /** Whether the plan includes branded codes, print files and scan counts. */
    included: boolean;
    /** Newest first; retired ones among them. */
    codes: QrCodeView[];
}

/** What a create sends. */
export interface QrCodeInput {
    targetKind: QrTargetKind;
    targetRef?: string | null;
    place: QrPlace;
    placeNote?: string | null;
    label?: string | null;
    style?: QrStyle;
    color?: string;
}

/** What a change sends: only what changed. The target moves as one thing. */
export type QrCodeChange = Partial<QrCodeInput>;

/** Why the API refused a save or a print file (`details.reason`). */
export type QrRefusalReason =
    | "unknown"
    | "booking-closed"
    | "shop-closed"
    | "product-missing"
    | "page-missing"
    | "format"
    | "too-light"
    | "retired"
    | "too-many"
    | "no-free-code"
    /** A print file: the site has no Saroh address for the code to hold. */
    | "no-address"
    /** A print file: the code's link is too long for any QR. */
    | "unencodable";

export type QrResult<T> =
    | { ok: true; data: T }
    | {
          ok: false;
          error: string;
          /** The control the refusal is about. */
          field?: "target" | "color";
          reason?: QrRefusalReason;
          /** Its plan refused it (`MODULE_LOCKED`, row `qr-branding`). */
          plan?: PlanRefusal;
      };
