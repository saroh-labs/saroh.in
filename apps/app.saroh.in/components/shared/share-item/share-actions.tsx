"use client";

import { Button } from "@saroh/ui/button";
import { copyText, useCopy } from "@saroh/ui/copy-button";
import { showError } from "@saroh/ui/toast";
import { Copy, Download, Facebook, MessageCircle, Share } from "lucide-react";

import { facebookHref, whatsappHref } from "@/lib/share-item/share";
import { SHARE_WORDS } from "@/lib/share-item/words";

import type { CardImage } from "./use-card-image";

/** What the actions share: the caption with its link, and the picture. */
export interface ShareParts {
    /** The caption as shared, its tagged link at the end. */
    caption: string;
    /** The tagged link alone. */
    link: string;
    image: CardImage;
    fileName: string;
}

/** Saves the PNG this device already has. */
function download(image: CardImage, fileName: string) {
    if (image.state !== "ready") return;
    const a = document.createElement("a");
    a.href = image.src;
    a.download = fileName;
    document.body.append(a);
    a.click();
    a.remove();
}

const ROW =
    "h-9 w-full justify-start gap-2.5 bg-card px-3.5 text-[13.5px] font-semibold";

/**
 * "Share now, free" at a desk (SFBDesk): Download image, Copy caption,
 * Send on WhatsApp and Share on Facebook. Without a picture only Download
 * is off; the caption and the link still go (SFNoImageDesk).
 */
export function DeskActions({ caption, link, image, fileName }: ShareParts) {
    const { copy, copied } = useCopy();
    const onCopy = async () => {
        if (!(await copy(caption))) showError(SHARE_WORDS.copyFailed);
    };
    return (
        <section aria-label={SHARE_WORDS.shareFree} className="grid gap-2">
            <h3 className="text-[13px] font-semibold">
                {SHARE_WORDS.shareFree}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
                <Button
                    type="button"
                    variant="outline"
                    className={ROW}
                    disabled={image.state !== "ready"}
                    onClick={() => download(image, fileName)}
                >
                    <Download aria-hidden className="size-4" />
                    {SHARE_WORDS.download}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    className={ROW}
                    onClick={() => void onCopy()}
                >
                    <Copy aria-hidden className="size-4" />
                    <span aria-live="polite">
                        {copied ? SHARE_WORDS.copied : SHARE_WORDS.copy}
                    </span>
                </Button>
                <Button asChild variant="outline" className={ROW}>
                    <a
                        href={whatsappHref(caption)}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <MessageCircle aria-hidden className="size-4" />
                        {SHARE_WORDS.whatsapp}
                    </a>
                </Button>
                <Button asChild variant="outline" className={ROW}>
                    <a
                        href={facebookHref(link)}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <Facebook aria-hidden className="size-4" />
                        {SHARE_WORDS.facebook}
                    </a>
                </Button>
            </div>
        </section>
    );
}

/**
 * The phone's Share now (SFBPhone, SFCopiedPhone): the caption goes on the
 * clipboard first (Instagram drops shared text), then the phone's own share
 * sheet opens with the one PNG, the caption and the link, called straight
 * from the tap as an iPhone needs. Without a picture it shares the caption
 * and link. Closing the phone's sheet is no error.
 */
export function ShareNowButton({
    caption,
    link,
    image,
    fileName,
    onCopied,
}: ShareParts & { onCopied: () => void }) {
    const failed = image.state === "failed";
    const onShare = () => {
        // Copy first, without waiting: the share must stay in the tap.
        const copying = copyText(caption).then((ok) => {
            if (ok) onCopied();
            return ok;
        });
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
                if (!ok) showError(SHARE_WORDS.copyFailed);
            });
            return;
        }
        navigator.share(data).catch((error: unknown) => {
            if (error instanceof Error && error.name === "AbortError") return;
            showError(SHARE_WORDS.shareFailed, SHARE_WORDS.shareFailedWhy);
        });
    };
    return (
        <Button
            type="button"
            size="lg"
            className="h-11 min-w-0 flex-1 gap-2"
            disabled={image.state === "loading"}
            onClick={onShare}
        >
            <Share aria-hidden className="size-4" />
            {failed ? SHARE_WORDS.shareText : SHARE_WORDS.shareNow}
        </Button>
    );
}
