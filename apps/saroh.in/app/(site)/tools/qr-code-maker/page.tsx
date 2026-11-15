import "@saroh/search-pages/styles.css";

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { toolsCrumb } from "@/components/resources/page-hero";
import { CtaLink } from "@/components/shared/buttons/cta-link";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { QrCodeMaker } from "@/components/tools/qr-code-maker/qr-code-maker";
import { qrCodeMaker as copy } from "@/content/qr-code-maker";
import { qrCodeMakerLive } from "@/lib/qr-code-maker-live";
import { resourcesContext } from "@/lib/resources-context";
import { builtTools } from "@/lib/search-pages";
import { pageMetadata, SITE_URL } from "@/lib/seo";
import { toolLd } from "@/lib/structured-data";
import { Container } from "@saroh/marketing/container";
import { ClosingCTA } from "@saroh/marketing/kit/closing-cta";
import { PageHero } from "@saroh/marketing/page-hero";

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
            <PageHero
                crumbs={[
                    toolsCrumb(builtTools().length > 0),
                    { name: copy.title },
                ]}
                title={copy.title}
                lead={copy.sub}
                className="pb-8 min-[760px]:pb-10"
            />
            <Container>
                <QrCodeMaker />
            </Container>
            <ClosingCTA
                id="qr-start"
                className="mt-[72px] border-t border-border min-[760px]:mt-[96px]"
                title={copy.band.title}
                primary={<CtaLink src="qr-code-maker" size="kit" />}
                note={copy.band.body}
            />
        </>
    );
}
