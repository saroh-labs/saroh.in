"use client";

import { showError, showSuccess } from "@saroh/ui/toast";
import { Archive } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { retireQrCode } from "@/lib/qr/actions";
import type { QrScreen } from "@/lib/qr/screen";
import type { QrCodeView } from "@/lib/qr/types";
import { opensWords, placeWords } from "@/lib/qr/words";

import { QrCodesList } from "./qr-codes-list";
import type { DownloadEnv } from "./qr-download";
import { QrMaker } from "./qr-maker";
import { QrViewer } from "./qr-viewer";

const HEADING = "font-display text-[19px] font-semibold tracking-[-0.02em]";

/**
 * The site's codes with what this page has just made or changed laid over
 * them, so the list and the maker's "you already have this code" agree at
 * once; the refresh that follows brings the server's own copy, which wins
 * unless ours is newer.
 */
export function mergeCodes(
    server: readonly QrCodeView[],
    local: readonly QrCodeView[],
): QrCodeView[] {
    const mine = new Map(local.map((c) => [c.id, c]));
    const out = server.map((s) => {
        const l = mine.get(s.id);
        mine.delete(s.id);
        return l && (l.updatedAt ?? "") > (s.updatedAt ?? "") ? l : s;
    });
    // Made here and not in the read yet: newest first, as the list is.
    return [...Array.from(mine.values()).reverse(), ...out];
}

/**
 * Settings › Share › QR codes ("Saroh QR Codes" design, "01 In-app
 * Share"): the maker, then "Your QR codes".
 *
 * Someone who may only look (`site:read`) gets the list and a code to
 * view and download, with no controls. A site not yet published can still
 * have codes made: one line says they open once it is.
 */
export function QrShare({
    screen,
    env,
}: {
    screen: Extract<QrScreen, { state: "ready" }>;
    /** Replaced in tests; the browser's own otherwise. */
    env?: DownloadEnv;
}) {
    const { site, view, canChange } = screen;
    const router = useRouter();
    const [local, setLocal] = useState<QrCodeView[]>([]);
    const [changing, setChanging] = useState<QrCodeView | null>(null);
    const [viewingId, setViewingId] = useState<string | null>(null);
    const [retiring, setRetiring] = useState<QrCodeView | null>(null);
    const maker = useRef<HTMLDivElement>(null);

    const codes = mergeCodes(view.codes, local);
    const business = {
        name: screen.business.name,
        initials: screen.business.initials,
        dataUrl: screen.business.logo,
        hasLogo: screen.business.hasLogo,
    };
    const viewing =
        codes.find((c) => c.id === viewingId && !c.retired) ??
        codes.find((c) => !c.retired) ??
        null;

    const took = (code: QrCodeView) => {
        setLocal((prev) => [...prev.filter((c) => c.id !== code.id), code]);
        router.refresh();
    };

    const toTop = () => {
        maker.current?.scrollIntoView({ block: "start" });
        maker.current?.focus({ preventScroll: true });
    };

    async function retire(code: QrCodeView) {
        const res = await retireQrCode(site.id, code.id);
        if (!res.ok) {
            showError(
                res.error.trim() || "We couldn't retire that code. Try again.",
            );
            return;
        }
        if (changing?.id === code.id) setChanging(null);
        took(res.data);
        showSuccess("Code retired", "A printed copy now opens your home page.");
    }

    return (
        <section
            aria-labelledby="qr-codes-title"
            className="flex flex-col gap-5"
        >
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h3 id="qr-codes-title" className={HEADING}>
                    QR codes
                </h3>
                <span className="text-[13px] text-muted-foreground">
                    For the counter, the mirror or a card. Each opens one of
                    your pages and counts its scans.
                </span>
            </div>

            {!view.live ? (
                <p
                    role="note"
                    data-qr-not-live=""
                    className="rounded-[10px] bg-muted px-3.5 py-2.5 text-[13px] text-foreground"
                >
                    Your site isn&apos;t published yet. You can make codes now;
                    they open once it is.
                    {canChange ? (
                        <>
                            {" "}
                            <Link
                                href={`/sites/${site.id}`}
                                className="rounded-[4px] font-semibold text-brand underline underline-offset-2 transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:text-muted-foreground"
                            >
                                Open your site to publish it
                            </Link>
                        </>
                    ) : null}
                </p>
            ) : null}

            {canChange ? (
                <div
                    ref={maker}
                    tabIndex={-1}
                    className="scroll-mt-4 focus-visible:outline-none"
                >
                    <QrMaker
                        // Change starts from that code; leaving it starts clean.
                        key={changing?.id ?? "make"}
                        siteId={site.id}
                        origin={view.origin}
                        displayOrigin={screen.displayOrigin}
                        targets={screen.targets}
                        codes={codes}
                        swatches={screen.swatches}
                        lock={screen.lock}
                        business={business}
                        changing={changing}
                        onChangingDone={() => setChanging(null)}
                        onSaved={took}
                        env={env}
                    />
                </div>
            ) : viewing ? (
                <QrViewer
                    code={viewing}
                    origin={view.origin}
                    business={business}
                    env={env}
                />
            ) : null}

            <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h4 className={HEADING}>Your QR codes</h4>
                <span className="text-[13px] text-muted-foreground">
                    {canChange
                        ? "Change where a code goes any time. The printed one keeps working."
                        : "Where each code is placed and what it opens."}
                </span>
            </div>
            <QrCodesList
                codes={codes}
                included={view.included}
                canChange={canChange}
                activeId={
                    canChange ? (changing?.id ?? null) : (viewing?.id ?? null)
                }
                onChange={(code) => {
                    setChanging(code);
                    toTop();
                }}
                onView={(code) => setViewingId(code.id)}
                onRetire={setRetiring}
            />

            <ConfirmDialog
                open={retiring !== null}
                onOpenChange={(open) => {
                    if (!open) setRetiring(null);
                }}
                icon={Archive}
                title={
                    retiring
                        ? `Retire the ${placeWords(retiring)} code?`
                        : "Retire this code?"
                }
                description={
                    retiring
                        ? `Anyone who scans a printed copy will land on your home page, not ${retiring.target.missing ? "the page it was made for" : opensWords(retiring)}. Its scans are kept. This cannot be undone.`
                        : ""
                }
                confirmLabel="Retire code"
                cancelLabel="Keep it"
                onConfirm={() => {
                    const code = retiring;
                    setRetiring(null);
                    if (code) void retire(code);
                }}
            />
        </section>
    );
}
