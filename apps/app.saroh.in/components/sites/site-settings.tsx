"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card, CardContent } from "@saroh/ui/card";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import { ImageIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateSiteSettings } from "@/lib/sites/actions";
import type { SiteDetail, SiteSettingsInput } from "@/lib/sites/service";

/**
 * A site's address, search appearance and share card (#188).
 *
 * Everything here is DRAFT state. It reaches the public only through the next
 * publish, like a section edit — so the page says that rather than letting a
 * merchant change a search title and wonder why Google never updates.
 *
 * Rows follow the design: a label, the value, and the one action that changes
 * it. Editing happens in place; there is no page-level Save, because a settings
 * form that saves everything at once lets a stale tab overwrite a field someone
 * else changed. Each field PATCHes only itself.
 */

/** Search engines truncate around here. Guidance, never enforcement. */
const TITLE_GUIDE = 60;
const DESCRIPTION_GUIDE = 155;

function Section({
    title,
    description,
    badge,
    children,
}: {
    title: string;
    description: string;
    badge?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="space-y-3">
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">{title}</h2>
                    {badge}
                </div>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <Card className="wk-surface">
                <CardContent className="divide-y divide-border p-0">
                    {children}
                </CardContent>
            </Card>
        </section>
    );
}

function Row({
    label,
    children,
    action,
}: {
    label: string;
    children: React.ReactNode;
    action?: React.ReactNode;
}) {
    return (
        <div className="grid items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="min-w-0 text-sm">{children}</div>
            {action ? (
                <div className="justify-self-start sm:justify-self-end">
                    {action}
                </div>
            ) : (
                <div />
            )}
        </div>
    );
}

const Missing = () => (
    <span className="text-muted-foreground/70">Nothing set yet</span>
);

export function SiteSettings({ site }: { site: SiteDetail }) {
    const [seoTitle, setSeoTitle] = useState(site.seoTitle ?? "");
    const [seoDescription, setSeoDescription] = useState(
        site.seoDescription ?? "",
    );
    const [socialImageUrl, setSocialImageUrl] = useState(
        site.socialImageUrl ?? "",
    );
    const router = useRouter();
    const [editing, setEditing] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const address = site.subdomain ? `${site.subdomain}.saroh.app` : null;
    const live = Boolean(site.currentPublication);

    function save(input: SiteSettingsInput, label: string) {
        startTransition(async () => {
            const res = await updateSiteSettings(site.id, input);
            if (!res.ok) {
                toast.error(res.error);
                return;
            }
            setEditing(null);
            // Local state already shows the new value; refresh so the server
            // props agree with it and a reload does not appear to lose the edit.
            router.refresh();
            toast.success(`${label} saved. Publish to make it public.`);
        });
    }

    return (
        <div className="space-y-8">
            <Section
                title="Site status"
                description={
                    live
                        ? "Live, with a record of every publish."
                        : "Not published yet. Nobody can reach this site."
                }
                badge={
                    <Badge
                        className={cn(
                            live
                                ? "bg-success text-success-foreground"
                                : "border border-border bg-transparent text-muted-foreground",
                        )}
                    >
                        {live ? "Live" : "Draft"}
                    </Badge>
                }
            >
                <Row
                    label="Address"
                    action={
                        live && address ? (
                            <Button variant="outline" size="sm" asChild>
                                <a
                                    href={`https://${address}`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    View
                                </a>
                            </Button>
                        ) : undefined
                    }
                >
                    {address ?? <Missing />}
                </Row>
                <Row label="Last published">
                    {site.currentPublication ? (
                        new Date(
                            site.currentPublication.publishedAt,
                        ).toLocaleString()
                    ) : (
                        <span className="text-muted-foreground/70">Never</span>
                    )}
                </Row>
            </Section>

            <Section
                title="Saroh address"
                description="Every site gets one of these and keeps it, even after you connect your own domain."
            >
                <Row label="Subdomain">{address ?? <Missing />}</Row>
            </Section>

            <Section
                title="Search"
                description="What people see before they click."
            >
                <Row
                    label="Title"
                    action={
                        editing === "title" ? (
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="brand"
                                    disabled={pending}
                                    onClick={() =>
                                        save(
                                            { seoTitle: seoTitle || null },
                                            "Title",
                                        )
                                    }
                                >
                                    Save
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={pending}
                                    onClick={() => {
                                        setSeoTitle(site.seoTitle ?? "");
                                        setEditing(null);
                                    }}
                                >
                                    Cancel
                                </Button>
                            </div>
                        ) : (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditing("title")}
                            >
                                Edit
                            </Button>
                        )
                    }
                >
                    {editing === "title" ? (
                        <div className="space-y-1">
                            <Input
                                value={seoTitle}
                                autoFocus
                                onChange={(e) => setSeoTitle(e.target.value)}
                                aria-label="Search title"
                            />
                            {/* Guidance, not a limit: search engines truncate,
                                they do not reject. Stating the number beats a
                                silent cut-off the merchant never sees. */}
                            <p className="text-xs text-muted-foreground">
                                {seoTitle.length > TITLE_GUIDE
                                    ? `Aim for ${TITLE_GUIDE} characters or fewer. Currently ${seoTitle.length}.`
                                    : `${seoTitle.length} of about ${TITLE_GUIDE} characters.`}
                            </p>
                        </div>
                    ) : (
                        seoTitle || <Missing />
                    )}
                </Row>

                <Row
                    label="Description"
                    action={
                        editing === "description" ? (
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="brand"
                                    disabled={pending}
                                    onClick={() =>
                                        save(
                                            {
                                                seoDescription:
                                                    seoDescription || null,
                                            },
                                            "Description",
                                        )
                                    }
                                >
                                    Save
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={pending}
                                    onClick={() => {
                                        setSeoDescription(
                                            site.seoDescription ?? "",
                                        );
                                        setEditing(null);
                                    }}
                                >
                                    Cancel
                                </Button>
                            </div>
                        ) : (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditing("description")}
                            >
                                Edit
                            </Button>
                        )
                    }
                >
                    {editing === "description" ? (
                        <div className="space-y-1">
                            <Textarea
                                value={seoDescription}
                                rows={3}
                                autoFocus
                                onChange={(e) =>
                                    setSeoDescription(e.target.value)
                                }
                                aria-label="Search description"
                            />
                            <p className="text-xs text-muted-foreground">
                                {seoDescription.length > DESCRIPTION_GUIDE
                                    ? `Aim for ${DESCRIPTION_GUIDE} characters or fewer. Currently ${seoDescription.length}.`
                                    : `${seoDescription.length} of about ${DESCRIPTION_GUIDE} characters.`}
                            </p>
                        </div>
                    ) : (
                        seoDescription || <Missing />
                    )}
                </Row>

                {/* The point of the section: what the merchant is actually
                    buying with those two fields. */}
                <Row label="Preview">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                            {seoTitle || site.name}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                            {address ?? "not published"}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                            {seoDescription || "No description yet."}
                        </div>
                    </div>
                </Row>
            </Section>

            <Section
                title="Social share image"
                description="Used when someone posts a link to your site."
            >
                <Row
                    label="Image"
                    action={
                        editing === "social" ? (
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="brand"
                                    disabled={pending}
                                    onClick={() =>
                                        save(
                                            {
                                                socialImageUrl:
                                                    socialImageUrl || null,
                                            },
                                            "Share image",
                                        )
                                    }
                                >
                                    Save
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={pending}
                                    onClick={() => {
                                        setSocialImageUrl(
                                            site.socialImageUrl ?? "",
                                        );
                                        setEditing(null);
                                    }}
                                >
                                    Cancel
                                </Button>
                            </div>
                        ) : (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditing("social")}
                            >
                                {socialImageUrl ? "Replace" : "Add"}
                            </Button>
                        )
                    }
                >
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted text-muted-foreground">
                                {socialImageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- a merchant-supplied absolute URL, not a project asset
                                    <img
                                        src={socialImageUrl}
                                        alt=""
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <ImageIcon className="h-4 w-4" />
                                )}
                            </div>
                            <div className="min-w-0 text-xs">
                                {socialImageUrl ? (
                                    <span className="break-all text-muted-foreground">
                                        {socialImageUrl}
                                    </span>
                                ) : (
                                    <>
                                        <Missing />
                                        <p className="text-muted-foreground">
                                            1200×630 works everywhere.
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>
                        {editing === "social" ? (
                            <Input
                                value={socialImageUrl}
                                autoFocus
                                placeholder="https://…"
                                onChange={(e) =>
                                    setSocialImageUrl(e.target.value)
                                }
                                aria-label="Share image URL"
                            />
                        ) : null}
                    </div>
                </Row>
            </Section>

            {/* Say what is true: none of this is public until it is published. */}
            <p className="text-sm text-muted-foreground">
                These settings are part of your draft. They reach your live site
                the next time you publish.
            </p>
        </div>
    );
}
