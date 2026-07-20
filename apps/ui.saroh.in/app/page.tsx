import Hero from "@/components/home/hero";

export default function Home() {
    // Header and Footer are provided by BaseLayout (app/layout.tsx); do not
    // render them again here or the page shows two navbars / two footers.
    return (
        <main>
            <Hero />
        </main>
    );
}
