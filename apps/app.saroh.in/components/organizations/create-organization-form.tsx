"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createOrganization } from "@/lib/organizations/actions";
import type { OrganizationProfileInput } from "@/lib/organizations/service";

/**
 * Onboarding form: create an organization (the tenant root). Name is required;
 * the business-profile fields are optional. On success the new org is already
 * set active by the server action, so we route into the dashboard and refresh
 * to render under it.
 */
export function CreateOrganizationForm() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [profile, setProfile] = useState<OrganizationProfileInput>({});
    const [nameError, setNameError] = useState<string>();
    const [submitting, setSubmitting] = useState(false);

    function setProfileField(key: keyof OrganizationProfileInput) {
        return (e: React.ChangeEvent<HTMLInputElement>) =>
            setProfile((p) => ({ ...p, [key]: e.target.value }));
    }

    /** Drop empty strings so the API receives only meaningful profile fields. */
    function cleanProfile(): OrganizationProfileInput | undefined {
        const entries = Object.entries(profile).filter(
            ([, v]) => typeof v === "string" && v.trim() !== "",
        );
        return entries.length ? Object.fromEntries(entries) : undefined;
    }

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setNameError(undefined);
        if (!name.trim()) {
            setNameError("Name is required");
            return;
        }
        setSubmitting(true);
        const res = await createOrganization({
            name: name.trim(),
            profile: cleanProfile(),
        });
        setSubmitting(false);
        if (!res.ok) {
            if (res.field === "name") setNameError(res.error);
            else toast.error(res.error);
            return;
        }
        router.push("/");
        router.refresh();
    }

    return (
        <form onSubmit={onSubmit} className="grid max-w-lg gap-6">
            <div className="grid gap-2">
                <Label htmlFor="org-name">Organization name</Label>
                <Input
                    id="org-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Acme Inc."
                    required
                    disabled={submitting}
                    aria-invalid={nameError ? true : undefined}
                />
                {nameError && (
                    <p className="text-sm text-destructive">{nameError}</p>
                )}
            </div>

            <fieldset className="grid gap-4" disabled={submitting}>
                <legend className="text-sm font-medium text-muted-foreground">
                    Business profile (optional)
                </legend>
                <div className="grid gap-2">
                    <Label htmlFor="org-legalName">Legal name</Label>
                    <Input
                        id="org-legalName"
                        value={profile.legalName ?? ""}
                        onChange={setProfileField("legalName")}
                        placeholder="Acme Incorporated"
                    />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                        <Label htmlFor="org-type">Type</Label>
                        <Input
                            id="org-type"
                            value={profile.type ?? ""}
                            onChange={setProfileField("type")}
                            placeholder="LLC"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="org-country">Country</Label>
                        <Input
                            id="org-country"
                            value={profile.country ?? ""}
                            onChange={setProfileField("country")}
                            placeholder="IN"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="org-taxId">Tax ID</Label>
                        <Input
                            id="org-taxId"
                            value={profile.taxId ?? ""}
                            onChange={setProfileField("taxId")}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="org-contactEmail">Contact email</Label>
                        <Input
                            id="org-contactEmail"
                            type="email"
                            value={profile.contactEmail ?? ""}
                            onChange={setProfileField("contactEmail")}
                            placeholder="hello@acme.com"
                        />
                    </div>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="org-website">Website</Label>
                    <Input
                        id="org-website"
                        type="url"
                        value={profile.website ?? ""}
                        onChange={setProfileField("website")}
                        placeholder="https://acme.com"
                    />
                </div>
            </fieldset>

            <Button
                type="submit"
                disabled={submitting || !name.trim()}
                className="justify-self-start"
            >
                {submitting ? "Creating…" : "Create organization"}
            </Button>
        </form>
    );
}
