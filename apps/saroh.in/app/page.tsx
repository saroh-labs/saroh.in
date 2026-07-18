import { BentoGridThirdDemo } from "@/components/home/bento-grid-demo";
import JoinWaitlist from "@/components/home/join-waitlist";
import { SparklesPreview } from "@/components/home/sparkles-preview";
import { SpotlightPreview } from "@/components/home/spotlight";

export default function Page() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-between bg-neutral-950">
            {/* <NewHero /> */}
            {/* <Hero /> */}
            {/* <GoogleGeminiEffectDemo /> */}
            <SpotlightPreview />
            <BentoGridThirdDemo />
            {/* <CardHoverEffectDemo /> */}
            <SparklesPreview />
            <JoinWaitlist />
        </main>
    );
}
