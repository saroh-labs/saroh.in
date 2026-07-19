"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createSite } from "@/lib/sites/actions";
import type { Template } from "@/lib/sites/service";

/** Sentinel Select value for "no template" — Radix forbids an empty item value. */
const NO_TEMPLATE = "none";

/**
 * Create-site form (S2-004). Follows create-store-form.tsx precisely: client
 * component, `@saroh/ui` primitives, `sonner` toasts, calls the createSite
 * server action, maps `res.field` to a field error else toasts, and routes to
 * the new site's editor on success. Adds an optional template picker seeded
 * from the templates fetched by the server page.
 */
export function CreateSiteForm({ templates }: { templates: Template[] }) {
    const router = useRouter();
    const [name, setName] = useState("");
    const [subdomain, setSubdomain] = useState("");
    const [templateId, setTemplateId] = useState<string>(NO_TEMPLATE);
    const [errors, setErrors] = useState<{
        name?: string;
        subdomain?: string;
    }>({});
    const [submitting, setSubmitting] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setErrors({});
        if (!name.trim()) {
            setErrors({ name: "Name is required" });
            return;
        }
        const template =
            templateId === NO_TEMPLATE
                ? undefined
                : templates.find((t) => t.id === templateId);
        setSubmitting(true);
        const res = await createSite({
            name,
            subdomain: subdomain.trim() || undefined,
            templateId: template?.id,
            templateVersion: template?.version,
        });
        setSubmitting(false);
        if (!res.ok) {
            if (res.field === "subdomain" || res.field === "name") {
                setErrors({ [res.field]: res.error });
            } else {
                toast.error(res.error);
            }
            return;
        }
        router.push(`/sites/${res.data.siteId}`);
    }

    return (
        <form onSubmit={onSubmit} className="grid max-w-md gap-4">
            <div className="grid gap-2">
                <Label htmlFor="name">Site name</Label>
                <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Site"
                    required
                    disabled={submitting}
                />
                {errors.name && (
                    <p className="text-sm text-destructive">{errors.name}</p>
                )}
            </div>
            <div className="grid gap-2">
                <Label htmlFor="subdomain">Subdomain (optional)</Label>
                <Input
                    id="subdomain"
                    value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value)}
                    placeholder="my-site"
                    disabled={submitting}
                />
                {errors.subdomain && (
                    <p className="text-sm text-destructive">
                        {errors.subdomain}
                    </p>
                )}
            </div>
            {templates.length > 0 && (
                <div className="grid gap-2">
                    <Label htmlFor="template">Template (optional)</Label>
                    <Select
                        value={templateId}
                        onValueChange={setTemplateId}
                        disabled={submitting}
                    >
                        <SelectTrigger id="template">
                            <SelectValue placeholder="Blank site" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NO_TEMPLATE}>
                                Blank site
                            </SelectItem>
                            {templates.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                    {t.name} (v{t.version})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
            <Button type="submit" disabled={submitting || !name.trim()}>
                {submitting ? "Creating…" : "Create site"}
            </Button>
        </form>
    );
}
