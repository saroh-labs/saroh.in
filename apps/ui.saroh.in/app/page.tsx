import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@saroh/ui/card";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Wordmark } from "@saroh/ui/wordmark";

/** A single design token, shown as a swatch + its Tailwind utility. */
function Swatch({ name, className }: { name: string; className: string }) {
    return (
        <div className="flex flex-col gap-1.5">
            <div className={`h-14 rounded-md border ${className}`} />
            <span className="text-muted-foreground text-xs">{name}</span>
        </div>
    );
}

function Section({
    title,
    description,
    children,
}: {
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <section className="border-t py-10">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{description}</p>
            <div className="mt-6">{children}</div>
        </section>
    );
}

/**
 * The Saroh UI reference gallery (#97). Renders the live design-system tokens
 * and components straight from @saroh/ui, so drift (e.g. a brand/token
 * mismatch) is visible here instead of hiding in an app.
 */
export default function Home() {
    return (
        <main className="mx-auto max-w-5xl px-6 py-16">
            <header className="flex flex-col items-start gap-4">
                <Wordmark suffix="UI" style={{ fontSize: "2rem" }} />
                <p className="text-muted-foreground max-w-xl text-balance">
                    The Saroh design system — the tokens and components every
                    app shares, from one source. This page renders them live.
                </p>
            </header>

            <Section
                title="Brand & color tokens"
                description="Semantic tokens from @saroh/ui globals.css — “Midnight & Lime”. brand is INTERACTIVE and lightens in dark mode; brand-surface is a FILL and stays deep in both."
            >
                <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
                    <Swatch name="brand" className="bg-brand" />
                    <Swatch name="brand-surface" className="bg-brand-surface" />
                    <Swatch name="brand-subtle" className="bg-brand-subtle" />
                    <Swatch name="primary" className="bg-primary" />
                    <Swatch name="secondary" className="bg-secondary" />
                    <Swatch name="muted" className="bg-muted" />
                </div>
                <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
                    <Swatch name="highlight" className="bg-highlight" />
                    <Swatch
                        name="highlight-subtle"
                        className="bg-highlight-subtle"
                    />
                    <Swatch name="success" className="bg-success" />
                    <Swatch name="warning" className="bg-warning" />
                    <Swatch name="info" className="bg-info" />
                    <Swatch name="destructive" className="bg-destructive" />
                </div>
                <p className="text-muted-foreground mb-3 text-sm">
                    <strong className="text-foreground">accent</strong> is
                    shadcn&rsquo;s neutral hover/selected surface (button ghost
                    hover, menu focus, calendar selection) — not a brand colour.
                    The brand accent is{" "}
                    <strong className="text-foreground">highlight</strong>.
                </p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
                    <Swatch name="accent (hover)" className="bg-accent" />
                    <Swatch name="border" className="bg-border" />
                    <Swatch name="input" className="bg-input" />
                    <Swatch name="ring" className="bg-ring" />
                    <Swatch name="background" className="bg-background" />
                    <Swatch name="foreground" className="bg-foreground" />
                </div>
            </Section>

            <Section
                title="Brand ramp"
                description="50 → 950. Use the ramp for charts and bespoke surfaces; use the semantic tokens for everything else."
            >
                <div className="flex overflow-hidden rounded-lg">
                    {[
                        "bg-brand-50",
                        "bg-brand-100",
                        "bg-brand-200",
                        "bg-brand-300",
                        "bg-brand-400",
                        "bg-brand-500",
                        "bg-brand-600",
                        "bg-brand-700",
                        "bg-brand-800",
                        "bg-brand-900",
                        "bg-brand-950",
                    ].map((c) => (
                        <div key={c} className={`h-12 flex-1 ${c}`} />
                    ))}
                </div>
                <div className="mt-2 flex overflow-hidden rounded-lg">
                    {[
                        "bg-highlight-50",
                        "bg-highlight-100",
                        "bg-highlight-200",
                        "bg-highlight-300",
                        "bg-highlight-400",
                        "bg-highlight-500",
                        "bg-highlight-600",
                        "bg-highlight-700",
                        "bg-highlight-800",
                        "bg-highlight-900",
                        "bg-highlight-950",
                    ].map((c) => (
                        <div key={c} className={`h-12 flex-1 ${c}`} />
                    ))}
                </div>
            </Section>

            <Section
                title="Typography"
                description="Bricolage Grotesque (display) for page-level titles; Geist (sans) for UI and body. Both self-hosted, latin subset, variable."
            >
                <div className="space-y-3">
                    <p className="font-display text-4xl font-bold tracking-tight">
                        Run your whole business from one place.
                    </p>
                    <p className="font-display text-2xl font-semibold tracking-tight">
                        Display · page titles
                    </p>
                    <p className="text-base">
                        Sans · body and dense UI. The quick brown fox jumps over
                        the lazy dog — 0123456789 ₹4.2L
                    </p>
                    <p className="text-muted-foreground text-sm">
                        Muted · secondary and descriptive copy.
                    </p>
                </div>
            </Section>

            <Section
                title="Elevation"
                description="Shadows are tinted with the brand hue rather than pure black, so they sit in the palette instead of greying it."
            >
                {/* Written out, not interpolated: Tailwind scans source
                    statically, so `shadow-${s}` would be purged. */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                    <div className="bg-card shadow-xs rounded-lg p-4 text-center text-sm">
                        shadow-xs
                    </div>
                    <div className="bg-card rounded-lg p-4 text-center text-sm shadow-sm">
                        shadow-sm
                    </div>
                    <div className="bg-card rounded-lg p-4 text-center text-sm shadow-md">
                        shadow-md
                    </div>
                    <div className="bg-card rounded-lg p-4 text-center text-sm shadow-lg">
                        shadow-lg
                    </div>
                    <div className="bg-card rounded-lg p-4 text-center text-sm shadow-xl">
                        shadow-xl
                    </div>
                </div>
            </Section>

            <Section
                title="Buttons"
                description="All variants and sizes of the shared Button."
            >
                <div className="flex flex-col gap-6">
                    <div className="flex flex-wrap items-center gap-3">
                        <Button>Default</Button>
                        <Button variant="brand">Brand</Button>
                        <Button variant="secondary">Secondary</Button>
                        <Button variant="destructive">Destructive</Button>
                        <Button variant="outline">Outline</Button>
                        <Button variant="ghost">Ghost</Button>
                        <Button variant="link">Link</Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <Button size="sm">Small</Button>
                        <Button size="default">Default</Button>
                        <Button size="lg">Large</Button>
                    </div>
                </div>
            </Section>

            <Section title="Badges" description="Status/label pills.">
                <div className="flex flex-wrap items-center gap-3">
                    <Badge>Default</Badge>
                    <Badge variant="secondary">Secondary</Badge>
                    <Badge variant="destructive">Destructive</Badge>
                    <Badge variant="outline">Outline</Badge>
                </div>
            </Section>

            <Section
                title="Card & form"
                description="Composed primitives: Card, Label, Input, Button."
            >
                <Card className="max-w-sm">
                    <CardHeader>
                        <CardTitle>Create workspace</CardTitle>
                        <CardDescription>
                            A quick example composing the shared primitives.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="ws-name">Name</Label>
                            <Input id="ws-name" placeholder="Acme Inc." />
                        </div>
                        <Button className="self-start">Create</Button>
                    </CardContent>
                </Card>
            </Section>
        </main>
    );
}
