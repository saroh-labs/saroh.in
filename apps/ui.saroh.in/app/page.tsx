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
                description="Semantic tokens from @saroh/ui globals.css. brand is the canonical accent (blue-600)."
            >
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
                    <Swatch name="brand" className="bg-brand" />
                    <Swatch name="primary" className="bg-primary" />
                    <Swatch name="secondary" className="bg-secondary" />
                    <Swatch name="accent" className="bg-accent" />
                    <Swatch name="muted" className="bg-muted" />
                    <Swatch name="destructive" className="bg-destructive" />
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
