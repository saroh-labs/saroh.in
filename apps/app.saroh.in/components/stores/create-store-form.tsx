"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createStore } from "@/lib/stores/actions";
import { slugify } from "@/lib/stores/slug";

export function CreateStoreForm() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [slugInput, setSlugInput] = useState("");
    const [slugEdited, setSlugEdited] = useState(false);
    const [description, setDescription] = useState("");
    const [errors, setErrors] = useState<{ name?: string; slug?: string }>({});
    const [submitting, setSubmitting] = useState(false);

    // Suggest the slug from the name until the user edits it directly.
    const slug = slugEdited ? slugify(slugInput) : slugify(name);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setErrors({});
        if (!name.trim()) {
            setErrors({ name: "Name is required" });
            return;
        }
        setSubmitting(true);
        const res = await createStore({
            name,
            slug: slug || undefined,
            description: description.trim() || undefined,
        });
        setSubmitting(false);
        if (!res.ok) {
            if (res.field === "slug" || res.field === "name") {
                setErrors({ [res.field]: res.error });
            } else {
                toast.error(res.error);
            }
            return;
        }
        router.push(`/stores/${res.data.id}`);
    }

    return (
        <form onSubmit={onSubmit} className="grid max-w-md gap-4">
            <div className="grid gap-2">
                <Label htmlFor="name">Store name</Label>
                <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Blog"
                    required
                    disabled={submitting}
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
                    onChange={(e) => {
                        setSlugEdited(true);
                        setSlugInput(e.target.value);
                    }}
                    placeholder="my-blog"
                    disabled={submitting}
                />
                {errors.slug && (
                    <p className="text-destructive text-sm">{errors.slug}</p>
                )}
            </div>
            <div className="grid gap-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={submitting}
                />
            </div>
            <Button type="submit" disabled={submitting || !name.trim()}>
                {submitting ? "Creating…" : "Create store"}
            </Button>
        </form>
    );
}
