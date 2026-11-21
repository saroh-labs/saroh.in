"use client";

import { Button } from "@saroh/ui/button";
import { CopyButton, copyFailedMessage, copyText } from "@saroh/ui/copy-button";
import { FormSheet } from "@saroh/ui/form-sheet";
import { Label } from "@saroh/ui/label";
import { qrFileName, qrSvg } from "@saroh/ui/lib/qr-art";
import { QrArt } from "@saroh/ui/qr-art";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Copy, MessageCircle } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import type { DownloadEnv, QrFile } from "@/components/qr/link-qr/qr-download";
import {
    artOf,
    BROWSER,
    downloadQr,
    qrFile,
} from "@/components/qr/link-qr/qr-download";
import { pageLink } from "@/components/sites/pages-area/page-words";
import { makeQrPanelCode, openQrPanel } from "@/lib/qr/actions";
import { QR_INK } from "@/lib/qr/colours";
import type { QrPanelRead, QrSavedLink } from "@/lib/qr/panel";
import { refusalWords } from "@/lib/qr/words";
import { whatsappHref } from "@/lib/share-item/share";
import type { SharePageWords } from "@/lib/sites/share-words";
import { instagramCaption, whatsappMessage } from "@/lib/sites/share-words";

/** The page a share sheet is about. */
export interface SharePage extends SharePageWords {
    id: string;
    path: string;
}

/** Where the made code says it came from (Settings › Share lists it). */
const FROM = "Share this page";

const LABEL = "block text-sm font-semibold";
const NOTE = "text-[13px] text-muted-foreground";

/**
 * Share this page / Tell people (plan 2026-11-18-001 U12, WXSShare and
 * WXSSharePhone): the page link with Copy, its QR for the counter, and a
 * WhatsApp message and an Instagram caption written from the page's own
 * words (`share-words.ts`, no AI). The merchant may change either before
 * sending; nothing here saves. A side sheet at a desk, the whole screen
 * on a phone, Done the only way out.
 *
 * Opened from a page's row on Pages, Overview's address card and Links
 * and sharing, and by the Publish sheet after a publish (`justPublished`).
 * The caller opens it only for a page a visitor can open now. Email to
 * subscribers is absent until the newsletter ships (batch 4).
 *
 * One QR per page: the page's saved code, found in Settings › Share or
 * made on the first Download QR (`findPanelCode`). Someone who may not
 * make codes downloads a QR of the page link itself.
 */
export function SharePageSheet({
    open,
    onClose,
    siteId,
    page,
    business,
    host,
    justPublished = false,
    env = BROWSER,
}: {
    open: boolean;
    onClose: () => void;
    siteId: string;
    page: SharePage;
    business: string;
    /** The business's web address (DEC-230). */
    host: string;
    justPublished?: boolean;
    /** Replaced in tests; the browser's own otherwise. */
    env?: DownloadEnv;
}) {
    return (
        <FormSheet
            open={open}
            wide
            title="Share this page"
            description={
                justPublished
                    ? `${page.title} is live. Share it where your customers are.`
                    : `${page.title}. Share it where your customers are.`
            }
            dirty={false}
            doneOnly
            onClose={onClose}
            fieldsClassName="gap-5"
        >
            {/* Mounted per opening, so each starts from the page's own words. */}
            <ShareBody
                siteId={siteId}
                page={page}
                business={business}
                host={host}
                env={env}
            />
        </FormSheet>
    );
}

function ShareBody({
    siteId,
    page,
    business,
    host,
    env,
}: {
    siteId: string;
    page: SharePage;
    business: string;
    host: string;
    env: DownloadEnv;
}) {
    const id = useId();
    const shown = pageLink(host, page.path);
    const url = `https://${shown}`;
    const [whatsapp, setWhatsapp] = useState(() =>
        whatsappMessage(page, business, shown),
    );
    const [instagram, setInstagram] = useState(() =>
        instagramCaption(page, business, shown),
    );

    async function copyCaption() {
        if (await copyText(instagram)) showSuccess("Caption copied.");
        else showError(copyFailedMessage(), instagram);
    }

    return (
        <div data-share-page={page.id} className="grid gap-5">
            <div className="grid gap-2">
                <span className={LABEL}>Page link</span>
                <div className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-border bg-card py-1 pl-3 pr-1">
                    <span
                        data-share-link=""
                        className="min-w-0 flex-1 select-all font-mono text-[13px] [overflow-wrap:anywhere]"
                    >
                        {shown}
                    </span>
                    <CopyButton value={url} label="Copy" thing="page link" />
                </div>
            </div>

            <div className="grid gap-2">
                <span className={LABEL}>QR code</span>
                <PageQr
                    siteId={siteId}
                    page={page}
                    url={url}
                    business={business}
                    env={env}
                />
            </div>

            <div className="grid gap-2">
                <Label htmlFor={`${id}-wa`} className={LABEL}>
                    WhatsApp message
                </Label>
                <Textarea
                    id={`${id}-wa`}
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    rows={4}
                    data-share-whatsapp=""
                />
                <div className="flex flex-wrap items-center gap-2">
                    <span className={`${NOTE} mr-auto`}>
                        Written from the page&rsquo;s own words
                    </span>
                    <Button asChild variant="outline" size="sm">
                        <a
                            href={whatsappHref(whatsapp)}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <MessageCircle aria-hidden className="size-4" />
                            Open WhatsApp
                        </a>
                    </Button>
                </div>
            </div>

            <div className="grid gap-2">
                <Label htmlFor={`${id}-ig`} className={LABEL}>
                    Instagram caption
                </Label>
                <Textarea
                    id={`${id}-ig`}
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    rows={3}
                    data-share-instagram=""
                />
                <div className="flex justify-end">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void copyCaption()}
                    >
                        <Copy aria-hidden className="size-4" />
                        Copy caption
                    </Button>
                </div>
            </div>
        </div>
    );
}

/**
 * The page's QR: drawn from its saved code when it has one, else from the
 * page link (both open this page). Download QR makes the code the first
 * time, for someone who may (`site:update`).
 */
function PageQr({
    siteId,
    page,
    url,
    business,
    env,
}: {
    siteId: string;
    page: SharePage;
    url: string;
    business: string;
    env: DownloadEnv;
}) {
    const want: Pick<QrSavedLink, "kind" | "ref" | "siteId" | "from"> = {
        kind: "PAGE",
        ref: page.id,
        siteId,
        from: FROM,
    };
    const [read, setRead] = useState<QrPanelRead | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let gone = false;
        void openQrPanel(want)
            .catch((): QrPanelRead => ({ state: "failed" }))
            .then((next) => {
                if (!gone) setRead(next);
            });
        return () => {
            gone = true;
        };
        // `want` is rebuilt from these each render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId, page.id]);

    const code = read?.state === "ready" ? read.code : null;
    const text = code?.link ?? url;
    const art = useMemo(
        () => artOf(text, code?.style ?? "PLAIN"),
        [text, code?.style],
    );

    /** The file to download, making the page's code the first time. */
    async function fileOf(): Promise<QrFile | null> {
        let at = read;
        if (at === null || at.state === "failed") {
            at = await openQrPanel(want).catch((): QrPanelRead => ({
                state: "failed",
            }));
            setRead(at);
        }
        if (at.state === "failed") {
            showError("We couldn't get this page's QR code. Try again.");
            return null;
        }
        if (at.state === "ready" && (at.code || at.canChange)) {
            let made = at.code;
            if (!made) {
                const res = await makeQrPanelCode(at.siteId, want);
                if (!res.ok) {
                    showError(refusalWords(res).text);
                    return null;
                }
                made = res.data;
                setRead({ ...at, code: made });
            }
            return qrFile(made, business, {
                dataUrl: at.business.logo,
                initials: at.business.initials,
            });
        }
        // No code and may not make one: a QR of the page link itself.
        return {
            name: qrFileName(business || page.title),
            svg: qrSvg(artOf(url, "PLAIN"), { color: QR_INK }),
        };
    }

    async function download() {
        if (busy) return;
        setBusy(true);
        try {
            const file = await fileOf();
            if (file) await downloadQr(file, "png", env);
        } catch {
            showError("Couldn't make the QR code. Try again.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="flex min-w-0 items-center gap-4 rounded-lg border border-border bg-card p-3">
            {art.n > 0 ? (
                <div className="w-[76px] shrink-0">
                    <QrArt
                        art={art}
                        color={code?.color ?? QR_INK}
                        aria-label={`QR code for ${page.title}`}
                    />
                </div>
            ) : null}
            <div className="grid min-w-0 gap-1">
                <p className={NOTE}>
                    For the bill counter or a mirror card. It opens this page.
                </p>
                <Button
                    type="button"
                    variant="link"
                    size="inline"
                    className="self-start font-semibold underline"
                    busy={busy}
                    busyLabel="Making…"
                    onClick={() => void download()}
                    data-share-qr=""
                >
                    Download QR
                </Button>
            </div>
        </div>
    );
}

/**
 * "Share this page" as a link-like button that opens the sheet: Overview's
 * address card and each row on Links and sharing.
 */
export function SharePageButton({
    className,
    children = "Share this page",
    ...sheet
}: Omit<Parameters<typeof SharePageSheet>[0], "open" | "onClose"> & {
    className?: string;
    children?: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button
                type="button"
                variant="link"
                size="inline"
                className={
                    className ?? "self-start text-sm font-semibold underline"
                }
                onClick={() => setOpen(true)}
                data-share-page-open={sheet.page.id}
            >
                {children}
            </Button>
            <SharePageSheet
                {...sheet}
                open={open}
                onClose={() => setOpen(false)}
            />
        </>
    );
}
