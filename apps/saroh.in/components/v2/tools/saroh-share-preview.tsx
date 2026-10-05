import { ShareCard } from "@saroh/ui/share-card";

import { linkPreview as copy } from "@/content/link-preview";

import { CtaLink } from "../cta-link";

/**
 * "Saroh sites get this right automatically." (design 1b): the Share
 * preview settings drawn small, with the same WhatsApp card the site
 * settings draw (`@saroh/ui/share-card`), and the page's one start button.
 * The fields are a picture of the settings, not inputs.
 */
export function SarohSharePreview() {
    const s = copy.saroh;
    return (
        <div className="px-mk-gutter pt-[72px]">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-center gap-10 rounded-3xl border border-border bg-card px-12 py-10 max-[640px]:px-6 max-[640px]:py-8">
                <div className="grid justify-items-start gap-3.5">
                    <h2 className="m-0 font-display text-[clamp(30px,5vw,38px)] font-bold leading-[1.02] tracking-[-0.04em] [text-wrap:balance]">
                        {s.title}
                    </h2>
                    <p className="m-0 text-[15.5px] leading-[1.6] text-mk-copy">
                        {s.body}
                    </p>
                    <CtaLink
                        src="link-preview"
                        size="lg"
                        className="h-[50px] rounded-xl"
                    />
                </div>
                <div
                    aria-label={s.path}
                    role="img"
                    className="grid min-w-0 gap-3 rounded-[14px] border border-border bg-background p-[18px]"
                >
                    <span className="text-[12.5px] font-semibold text-muted-foreground">
                        {s.path}
                    </span>
                    <span className="flex h-9 min-w-0 items-center truncate rounded-lg border border-border bg-card px-2.5 text-sm">
                        {s.titleField}
                    </span>
                    <span className="flex h-9 min-w-0 items-center gap-2 rounded-lg border border-brand-500 bg-card px-2.5 text-sm">
                        <span className="truncate">{s.imageField}</span>
                        <span className="ml-auto shrink-0 text-mk-good">
                            {s.rightSize}
                        </span>
                    </span>
                    <ShareCard
                        platform="whatsapp"
                        title={s.card.title}
                        description={s.card.description}
                        siteName={s.card.domain}
                        domain={s.card.domain}
                        image={{ url: "", width: 1200, height: 630 }}
                    />
                </div>
            </div>
        </div>
    );
}
