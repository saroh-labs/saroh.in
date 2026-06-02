"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useState } from "react";
import { toast } from "sonner";

import { updateStore } from "@/lib/stores/actions";

interface StoreFields {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logo: string | null;
}

export function StoreSettingsForm({ store }: { store: StoreFields }) {
    const [name, setName] = useState(store.name);
    const [slug, setSlug] = useState(store.slug);
    const [description, setDescription] = useState(store.description ?? "");
    const [logo, setLogo] = useState(store.logo ?? "");
    const [errors, setErrors] = useState<{
        name?: string;
        slug?: string;
        logo?: string;
    }>({});
    const [saving, setSaving] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setErrors({});
        setSaving(true);
        const res = await updateStore(store.id, {
            name,
            slug,
            description: description.trim() || null,
            logo: logo.trim() || null,
        });
        setSaving(false);
        if (!res.ok) {
            if (
                res.field === "name" ||
                res.field === "slug" ||
                res.field === "logo"
            ) {
                setErrors({ [res.field]: res.error });
            } else {
                toast.error(res.error);
            }
            return;
        }
        toast.success("Store settings saved");
    }

    return (
        <form onSubmit={onSubmit} className="grid max-w-md gap-4">
            <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    disabled={saving}
                />
                {errors.name && (
                    <p className="text-destructive text-sm">{errors.name}</p>
                )}
            </div>
            <div className="grid gap-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                    id="slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    required
                    disabled={saving}
                />
                {errors.slug && (
                    <p className="text-destructive text-sm">{errors.slug}</p>
                )}
            </div>
            <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={saving}
                />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="logo">Logo URL</Label>
                <Input
                    id="logo"
                    value={logo}
                    onChange={(e) => setLogo(e.target.value)}
                    placeholder="https://…"
                    disabled={saving}
                />
                {errors.logo && (
                    <p className="text-destructive text-sm">{errors.logo}</p>
                )}
            </div>
            <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
            </Button>
        </form>
    );
}
