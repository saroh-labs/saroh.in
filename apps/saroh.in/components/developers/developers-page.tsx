import { CtaLink } from "@/components/shared/buttons/cta-link";
import { DEVELOPERS, docsHref } from "@/content/developers";
import { DevelopersPage as Page } from "@saroh/marketing/feature-pages/developers-page";

/** saroh.in's /developers: the shared page (`@saroh/marketing`) in its words. */
export function DevelopersPage({
    docsOn,
    aiAppsOn,
}: {
    docsOn: boolean;
    aiAppsOn: boolean;
}) {
    return (
        <Page
            words={DEVELOPERS}
            docsHref={docsHref}
            docsHost=" docs.saroh.in"
            start={(src, variant) => (
                <CtaLink src={src} size="kit" variant={variant} />
            )}
            docsOn={docsOn}
            aiAppsOn={aiAppsOn}
        />
    );
}
