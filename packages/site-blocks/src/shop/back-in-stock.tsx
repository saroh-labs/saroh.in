"use client";

import type { LookId } from "@saroh/block-contract";
import { useEffect, useId, useState } from "react";

import { focusRing, inputFill } from "../booking-flow/styles";
import { cn } from "../lib/utils";
import { useProductSelection } from "../product/product-page";
import { actionButton } from "./add-to-bag";
import type { BackInStockApi } from "./back-in-stock-shape";
import {
    cleanWatchEmail,
    consentLine,
    waitingLine,
    WATCH_WORDS,
} from "./back-in-stock-shape";
import { shopField, shopLink, shopPrimary } from "./look-shop";

/**
 * "Tell me when it's back" (DEC-174, automatic notices U24, #1155): under a
 * sold-out product's button, an email field, the button and the opt-in in
 * one line ("‹Business› will email you now and when it's back. Nothing
 * else."). Once taken:
 * "We'll email you at ‹email›", with "Stop waiting" when this visit made
 * the watch.
 *
 * - **Offered only where the API says so.** Whether the business takes
 *   "Tell me" (its switch, its own email provider) and whether this option
 *   is sold out is read in the browser for the option on screen, never
 *   drawn on the server: the page is cached (#863), and a switch turned
 *   off or a count put right shows at the next read, not after a purge.
 *   Until the answer, and whenever it is no, nothing is drawn.
 * - **Every option on its own.** Picking another option asks again; a
 *   watch is for the option chosen (or the product, without options).
 * - **The site's own look.** Classic draws with the product page's own
 *   button and the bag's field; Folio, Quiet and Live with their shop
 *   shapes (`look-shop.ts`). `--site-*` only, never Saroh's.
 * - **Consent is the press.** The line beside the button says what it
 *   agrees to; the address never becomes a contact or a subscriber (U23).
 *
 * It sits in `ProductPage`'s action slot beside Add to bag and reads the
 * choice with `useProductSelection`; the site's server actions arrive as a
 * {@link BackInStockApi}.
 */
export function BackInStock({
    api,
    productId,
    business,
    look,
}: {
    api: BackInStockApi;
    productId: string;
    business: string;
    /** Folio, Quiet or Live (DEC-172); absent is Classic. */
    look?: LookId;
}) {
    const selection = useProductSelection();
    if (!selection?.soldOut) return null;
    return (
        <WatchForm
            // A new option is a new question, and a new form.
            key={selection.variantId ?? "product"}
            api={api}
            productId={productId}
            variantId={selection.variantId}
            business={business}
            look={look}
        />
    );
}

type Offer = "asking" | "offered" | "not-offered";

function WatchForm({
    api,
    productId,
    variantId,
    business,
    look,
}: {
    api: BackInStockApi;
    productId: string;
    variantId: string | null;
    business: string;
    look?: LookId;
}) {
    const ids = useId();
    const [offer, setOffer] = useState<Offer>("asking");
    const [email, setEmail] = useState("");
    const [fieldError, setFieldError] = useState<string | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [taken, setTaken] = useState<{
        email: string;
        stopToken: string | null;
    } | null>(null);
    const [note, setNote] = useState<string | null>(null);

    useEffect(() => {
        let live = true;
        api.offer(productId, variantId)
            .then((r) => {
                if (live) {
                    setOffer(
                        r.ok && r.data.offered ? "offered" : "not-offered",
                    );
                }
            })
            // Unknown is no: the page still says "Sold out".
            .catch(() => live && setOffer("not-offered"));
        return () => {
            live = false;
        };
    }, [api, productId, variantId]);

    if (offer === "asking") return null;
    if (offer === "not-offered") {
        // Refused after it was offered (switched off, back in stock): say
        // why. Never offered: nothing at all.
        return problem ? (
            <p
                role="status"
                data-back-in-stock="refused"
                className="text-site-body mt-4 text-[14.5px]"
            >
                {problem}
            </p>
        ) : null;
    }

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (busy) return;
        setNote(null);
        setProblem(null);
        const clean = cleanWatchEmail(email);
        if (!clean) {
            setFieldError(WATCH_WORDS.invalid);
            return;
        }
        setFieldError(null);
        setBusy(true);
        try {
            const r = await api.watch({ productId, variantId, email: clean });
            if (r.ok) {
                setTaken({ email: clean, stopToken: r.data.stopToken });
            } else if (r.reason === "invalid") {
                setFieldError(r.message);
            } else if (r.reason === "not-offered") {
                setProblem(r.message);
                setOffer("not-offered");
            } else {
                setProblem(r.message);
            }
        } catch {
            setProblem(WATCH_WORDS.offline);
        } finally {
            setBusy(false);
        }
    }

    async function stop() {
        if (!taken?.stopToken || busy) return;
        setProblem(null);
        setBusy(true);
        try {
            const r = await api.stop(taken.stopToken);
            if (r.ok) {
                setTaken(null);
                setNote(WATCH_WORDS.stopped);
            } else {
                setProblem(
                    r.reason === "test-release" || r.reason === "busy"
                        ? r.message
                        : WATCH_WORDS.stopFailed,
                );
            }
        } catch {
            setProblem(WATCH_WORDS.offline);
        } finally {
            setBusy(false);
        }
    }

    const field = look
        ? shopField
        : cn(
              "border-site-border text-site-fg placeholder:text-site-muted block h-12 w-full min-w-0 rounded-[calc(var(--site-radius,2px)+8px)] border px-3.5 text-base",
              inputFill,
              focusRing,
          );
    const button = look
        ? cn(shopPrimary(busy), "w-full min-[700px]:w-auto")
        : cn(actionButton, busy && "cursor-wait opacity-70");
    const link = look
        ? shopLink
        : cn(
              "text-site-fg inline-flex min-h-11 cursor-pointer items-center rounded-sm text-sm font-semibold underline underline-offset-2 hover:no-underline",
              focusRing,
          );
    const problemLine = problem ? (
        <p
            role="alert"
            data-back-in-stock-problem=""
            className="text-site-fg mt-2 text-[14px] font-semibold"
        >
            {problem}
        </p>
    ) : null;

    if (taken) {
        return (
            <div data-back-in-stock="waiting" className="mt-4">
                <p
                    role="status"
                    className="text-site-fg text-[15px] font-semibold [overflow-wrap:anywhere]"
                >
                    {waitingLine(taken.email)}
                </p>
                {taken.stopToken ? (
                    <button
                        type="button"
                        onClick={() => void stop()}
                        disabled={busy}
                        className={link}
                    >
                        {busy ? WATCH_WORDS.stopping : WATCH_WORDS.stop}
                    </button>
                ) : null}
                {problemLine}
            </div>
        );
    }

    const errorId = `${ids}-error`;
    const consentId = `${ids}-consent`;
    return (
        <form
            noValidate
            onSubmit={(e) => void submit(e)}
            data-back-in-stock="form"
            className="mt-4 max-w-[34rem]"
        >
            <label
                htmlFor={`${ids}-email`}
                className="text-site-fg mb-1.5 block text-[14px] font-semibold"
            >
                {WATCH_WORDS.label}
            </label>
            <div className="flex flex-col gap-2 min-[700px]:flex-row">
                <input
                    id={`${ids}-email`}
                    type="email"
                    name="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => {
                        setEmail(e.target.value);
                        if (fieldError) setFieldError(null);
                    }}
                    aria-invalid={fieldError ? true : undefined}
                    aria-describedby={cn(fieldError && errorId, consentId)}
                    className={cn(
                        field,
                        "min-[700px]:flex-1",
                        fieldError && "border-site-fg border-2",
                    )}
                />
                <button
                    type="submit"
                    disabled={busy}
                    // The view's one filled button while Add to bag is off.
                    data-site-primary=""
                    className={cn(button, "shrink-0")}
                >
                    {busy ? WATCH_WORDS.saving : WATCH_WORDS.button}
                </button>
            </div>
            {fieldError ? (
                <p
                    id={errorId}
                    className="text-site-fg mt-2 text-[14px] font-semibold"
                >
                    {fieldError}
                </p>
            ) : null}
            <p id={consentId} className="text-site-body mt-2 text-[13.5px]">
                {consentLine(business)}
            </p>
            {problemLine}
            {note ? (
                <p role="status" className="text-site-body mt-2 text-[14px]">
                    {note}
                </p>
            ) : null}
        </form>
    );
}
