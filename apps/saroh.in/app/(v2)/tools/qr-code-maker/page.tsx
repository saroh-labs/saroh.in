import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CtaLink } from "@/components/v2/cta-link";
import { JsonLd } from "@/components/v2/json-ld";
import { QrCodeMaker } from "@/components/v2/tools/qr-code-maker";
import { qrCodeMaker as copy } from "@/content/qr-code-maker";
import { qrCodeMakerLive } from "@/lib/qr-code-maker-live";
import { resourcesContext } from "@/lib/resources-context";
import { pageMetadata, SITE_URL } from "@/lib/seo";
import { toolLd } from "@/lib/structured-data";

export const metadata: Metadata = pageMetadata({
    title: copy.metaTitle,
    socialTitle: copy.socialTitle,
    description: copy.metaDescription,
    path: copy.path,
});

/**
 * The free QR code maker (QR codes plan U9; design "Saroh QR Codes", screen
 * 02 "Free QR tool"): the title, the tool, and the closing band. The page is
 * static words; the tool is a client component that draws and downloads the
 * code in the browser, and sends Saroh an email address and nothing else.
 *
 * Published with early access (17 Oct, `content/resources.ts`): before its
 * day the page is a 404 and is linked nowhere (KTD-2); `RESOURCES_PREVIEW`
 * shows it on previews and locally.
 */
export default function QrCodeMakerPage() {
    if (!qrCodeMakerLive(resourcesContext())) notFound();
    return (
        <>
            <JsonLd
                data={[
                    toolLd({
                        name: copy.title,
                        description: copy.definition,
                        url: `${SITE_URL}${copy.path}`,
                    }),
                ]}
            />
            <div className="flex flex-col gap-7 px-mk-gutter pb-14 pt-11">
                <div className="flex flex-wrap items-end justify-between gap-6">
                    <h1 className="m-0 font-display text-[clamp(34px,6vw,44px)] font-bold leading-[1.02] tracking-[-0.04em]">
                        {copy.title}
                    </h1>
                    <span className="text-[15px] text-mk-copy">{copy.sub}</span>
                </div>

                <QrCodeMaker />

                <div className="flex flex-wrap items-center justify-between gap-5 rounded-mk-card bg-foreground px-[26px] py-[22px] text-background">
                    <div className="flex min-w-0 max-w-[60ch] flex-col gap-1">
                        <h2 className="m-0 font-display text-xl font-semibold tracking-[-0.02em]">
                            {copy.band.title}
                        </h2>
                        <p className="m-0 text-sm leading-[1.5] text-mk-on-ink">
                            {copy.band.body}
                        </p>
                    </div>
                    <CtaLink
                        src="qr-code-maker"
                        variant="saffron"
                        size="sm"
                        className="h-11 text-[15px]"
                    />
                </div>
            </div>
        </>
    );
}
