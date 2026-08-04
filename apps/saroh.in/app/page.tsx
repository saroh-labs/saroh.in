import Hero from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";
import JoinWaitlist from "@/components/home/join-waitlist";
import { ModulesSection } from "@/components/home/modules-section";
import { ProductShowcase } from "@/components/home/product-showcase";
import { SiteFooter } from "@/components/home/site-footer";

/**
 * The marketing page.
 *
 * Replaces a stock Aceternity template — spotlight hero, a bento grid of
 * placeholder skeletons, a sparkles band — whose copy still described Saroh as
 * "an open-source storefront management tool" and listed features (AI content
 * generation, drag-and-drop builder) that are not what shipped.
 *
 * Section rhythm alternates deep brand-surface and light background so the two
 * conversion moments (hero, waitlist) carry the weight and the explanatory
 * middle stays quiet.
 */
export default function Page() {
    return (
        <main className="bg-background">
            <Hero />
            <ModulesSection />
            <ProductShowcase />
            <HowItWorks />
            <JoinWaitlist />
            <SiteFooter />
        </main>
    );
}
