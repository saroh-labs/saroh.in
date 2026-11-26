"use client";

import { FailedState, LoadingState } from "@saroh/ui/data-state";
import { FormSheet } from "@saroh/ui/form-sheet";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AddressGroup } from "@/components/sites/contact/address-group";
import { ContactSocialGroup } from "@/components/sites/contact/contact-social-group";
import { SettingsSavedProvider } from "@/components/sites/settings/settings-saved";
import { useSettingsSave } from "@/components/sites/settings/use-settings-save";
import type {
    FindAddressRead,
    FindContactRead,
} from "@/lib/sites/find-settings-read";
import {
    readFindAddress,
    readFindContact,
} from "@/lib/sites/find-settings-read";

/** What Find's Do it here opens in the editor. */
export type FindSettings = "contact" | "address";

const WORDS: Record<FindSettings, { title: string; description: string }> = {
    contact: {
        title: "Contact and social",
        description:
            "Shown in Visit us and the footer on every page. A change shows on the website at once.",
    },
    address: {
        title: "Web address",
        description: "Where people find your website.",
    },
};

/**
 * Find's settings in the editor (U46c, `fix/WXECommand`: "open here, in a
 * sheet"): Website › Settings' own Contact and social rows, or its web
 * address, read afresh on opening and edited in their own sheets, so
 * nothing takes the merchant out of the editor.
 */
/**
 * The editor isn't on React Query: a save there draws the editor's page
 * again, as the rows always did.
 */
export function FindSettingsSheet(props: FindSettingsSheetProps) {
    const router = useRouter();
    const saved = useMemo(
        () => ({
            saved: () => {
                router.refresh();
                return Promise.resolve();
            },
        }),
        [router],
    );
    return (
        <SettingsSavedProvider value={saved}>
            <FindSettingsSheetBody {...props} />
        </SettingsSavedProvider>
    );
}

interface FindSettingsSheetProps {
    siteId: string;
    /** The settings to show; null: the sheet is closed. */
    which: FindSettings | null;
    /** May change the site (`site:update`); otherwise the rows only read. */
    canEdit: boolean;
    onClose: () => void;
}

function FindSettingsSheetBody({
    siteId,
    which,
    canEdit,
    onClose,
}: FindSettingsSheetProps) {
    const [shown, setShown] = useState<FindSettings>("contact");
    const [read, setRead] = useState<
        | { state: "loading" }
        | { state: "failed" }
        | { state: "contact"; data: FindContactRead }
        | { state: "address"; data: FindAddressRead }
    >({ state: "loading" });
    const [attempt, setAttempt] = useState(0);
    const save = useSettingsSave();

    // Each opening, and each Try again, reads afresh: loading until then.
    const asking = which ? `${which}:${attempt}` : null;
    const [asked, setAsked] = useState(asking);
    if (asking !== asked) {
        setAsked(asking);
        if (which) {
            setShown(which);
            setRead({ state: "loading" });
        }
    }

    useEffect(() => {
        if (!which) return;
        let live = true;
        const done = (next: typeof read) => {
            if (live) setRead(next);
        };
        if (which === "contact") {
            readFindContact().then(
                (data) => done({ state: "contact", data }),
                () => done({ state: "failed" }),
            );
        } else {
            readFindAddress(siteId).then(
                (data) =>
                    done(
                        data ? { state: "address", data } : { state: "failed" },
                    ),
                () => done({ state: "failed" }),
            );
        }
        return () => {
            live = false;
        };
    }, [which, siteId, attempt]);

    return (
        <FormSheet
            open={which !== null}
            title={WORDS[shown].title}
            description={WORDS[shown].description}
            doneOnly
            doneLabel="Close"
            onClose={onClose}
        >
            {read.state === "loading" ? (
                <LoadingState rows={4} />
            ) : read.state === "failed" ? (
                <FailedState
                    size="panel"
                    onRetry={() => setAttempt((n) => n + 1)}
                />
            ) : read.state === "contact" ? (
                <ContactSocialGroup
                    view={read.data.contact}
                    business={read.data.business}
                    state={canEdit ? save : null}
                    locations={read.data.locations}
                    canEditLocations={read.data.canEditLocations}
                />
            ) : (
                <AddressGroup
                    siteId={siteId}
                    address={read.data.address}
                    live={read.data.live}
                    canChangeAddress={read.data.canChangeAddress}
                />
            )}
        </FormSheet>
    );
}
