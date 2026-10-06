import { Container } from "@/components/v2/container";
import { CtaLink } from "@/components/v2/cta-link";

/**
 * The gallery's closing band (Templates design): Ink, its title and line,
 * and the start button from the one CTA builder (`cta()`), which saves the
 * template when the page is one template's.
 */
export function TemplatesBand({
    title,
    body,
    src,
    template,
}: {
    title: string;
    body: string;
    src: string;
    template?: { slug: string; name: string };
}) {
    return (
        <Container className="pt-[110px]">
            <div className="flex flex-wrap items-end justify-between gap-10 rounded-mk-band bg-foreground p-mk-band text-background">
                <div className="grid flex-[1_1_420px] gap-4">
                    <h2 className="m-0 font-display text-mk-band font-bold [text-wrap:balance]">
                        {title}
                    </h2>
                    <p className="m-0 max-w-[46ch] text-mk-band-body text-mk-on-ink [text-wrap:pretty]">
                        {body}
                    </p>
                </div>
                <CtaLink src={src} template={template} variant="saffron" />
            </div>
        </Container>
    );
}
