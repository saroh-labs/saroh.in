"use client";

import { Button } from "@saroh/ui/button";
import { copyText, useCopy } from "@saroh/ui/copy-button";
import { cn } from "@saroh/ui/lib/utils";
import { showError } from "@saroh/ui/toast";
import { Copy, Download, Facebook, MessageCircle, Share } from "lucide-react";

import { facebookHref, whatsappHref } from "@/lib/share-item/share";
import { SHARE_WORDS } from "@/lib/share-item/words";

import type { CardImage } from "./use-card-image";

/** What the actions share: the caption with its link, and the picture. */
export interface ShareParts {
    /** The caption as shared, its link at the end. */
    caption: string;
    /** The link alone. */
    link: string;
    image: CardImage;
    fileName: string;
}

/** What has been done, for the "Ready for Instagram" step. */
export interface Shared {
    saved: boolean;
    copied: boolean;
}

/** Saves the PNG this device already has. */
function download(image: CardImage, fileName: string): boolean {
    if (image.state !== "ready") return false;
    const a = document.createElement("a");
    a.href = image.src;
    a.download = fileName;
    document.body.append(a);
    a.click();
    a.remove();
    return true;
}

const BIG =
    "h-auto min-h-14 w-full justify-start gap-3 rounded-xl px-4 py-2.5 text-left text-[15px] font-semibold";
const HALF =
    "h-14 w-full justify-start gap-3 rounded-xl bg-card px-4 text-[15px] font-semibold";

/**
 * "Ready to share" at a desk (boards BPostDesk, SBShareDesk): Download image
 * first (it copies the caption too, so Instagram is two pastes away), Copy
 * caption, then WhatsApp and Facebook. Without a picture only Download is
 * off; the caption and the link still go.
 */
export function ReadyActions({
    caption,
    link,
    image,
    fileName,
    onShared,
    className,
}: ShareParts & { onShared: (done: Shared) => void; className?: string }) {
    const { copy, copied } = useCopy();
    const onDownload = async () => {
        const saved = download(image, fileName);
        const ok = await copyText(caption);
        onShared({ saved, copied: ok });
    };
    const onCopy = async () => {
        if (!(await copy(caption))) showError(SHARE_WORDS.copyFailed);
    };
    return (
        <div className={cn("grid gap-3", className)} data-ready-actions="">
            <Button
                type="button"
                className={BIG}
                disabled={image.state !== "ready"}
                onClick={() => void onDownload()}
                data-share-download=""
            >
                <Download aria-hidden className="size-4 shrink-0" />
                <span className="min-w-0">
                    <span className="block">{SHARE_WORDS.download}</span>
                    <span className="block text-[12.5px] font-normal opacity-75">
                        {SHARE_WORDS.downloadWhy}
                    </span>
                </span>
            </Button>
            <Button
                type="button"
                variant="outline"
                className={cn(BIG, "bg-card")}
                onClick={() => void onCopy()}
                data-share-copy=""
            >
                <Copy aria-hidden className="size-4 shrink-0" />
                <span className="min-w-0">
                    <span className="block" aria-live="polite">
                        {copied ? SHARE_WORDS.copied : SHARE_WORDS.copy}
                    </span>
                    <span className="block text-[12.5px] font-normal text-muted-foreground">
                        {SHARE_WORDS.copyWhy}
                    </span>
                </span>
            </Button>
            <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline" className={HALF}>
                    <a
                        href={whatsappHref(caption)}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <MessageCircle aria-hidden className="size-4" />
                        {SHARE_WORDS.whatsappShort}
                    </a>
                </Button>
                <Button asChild variant="outline" className={HALF}>
                    <a
                        href={facebookHref(link)}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <Facebook aria-hidden className="size-4" />
                        {SHARE_WORDS.facebookShort}
                    </a>
                </Button>
            </div>
        </div>
    );
}

/**
 * The phone's Share now (BPostPhone, SBSharePhone): the caption goes on the
 * clipboard first (Instagram drops shared text), then the phone's own share
 * sheet opens with the one PNG, the caption and the link, called straight
 * from the tap as an iPhone needs. Without a picture it shares the caption
 * and link. Closing the phone's sheet is no error; a share that went on
 * says so (`onShared`).
 */
export function ShareNowButton({
    caption,
    link,
    image,
    fileName,
    onShared,
}: ShareParts & { onShared: (done: Shared) => void }) {
    const failed = image.state === "failed";
    const onShare = () => {
        // Copy first, without waiting: the share must stay in the tap.
        const copying = copyText(caption);
        const data: ShareData = {
            // The link goes as `url`; the text keeps the words, so an app
            // that joins the two shows the link once.
            text: caption.replace(link, "").trim(),
            url: link,
        };
        if (image.state === "ready") {
            const file = new File([image.blob], fileName, {
                type: "image/png",
            });
            // Missing in some browsers, whatever the type says.
            const nav: Partial<Pick<Navigator, "canShare">> = navigator;
            if (!nav.canShare || navigator.canShare({ files: [file] })) {
                data.files = [file];
            }
        }
        if (typeof navigator.share !== "function") {
            void copying.then((ok) => {
                if (ok) onShared({ saved: false, copied: true });
                else showError(SHARE_WORDS.copyFailed);
            });
            return;
        }
        navigator
            .share(data)
            .then(async () => onShared({ saved: false, copied: await copying }))
            .catch((error: unknown) => {
                if (error instanceof Error && error.name === "AbortError")
                    return;
                showError(SHARE_WORDS.shareFailed, SHARE_WORDS.shareFailedWhy);
            });
    };
    return (
        <Button
            type="button"
            size="lg"
            className="h-12 min-w-0 flex-1 gap-2 rounded-xl text-[15px]"
            disabled={image.state === "loading"}
            onClick={onShare}
            data-share-now=""
        >
            <Share aria-hidden className="size-4" />
            {failed ? SHARE_WORDS.shareText : SHARE_WORDS.shareNow}
        </Button>
    );
}

/** The phone's Download beside Share now: the picture alone. */
export function DownloadIconButton({
    image,
    fileName,
}: Pick<ShareParts, "image" | "fileName">) {
    return (
        <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-12 shrink-0 rounded-xl bg-card"
            aria-label={SHARE_WORDS.download}
            title={SHARE_WORDS.download}
            disabled={image.state !== "ready"}
            onClick={() => download(image, fileName)}
        >
            <Download aria-hidden className="size-4" />
        </Button>
    );
}
