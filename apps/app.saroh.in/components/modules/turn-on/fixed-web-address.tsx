"use client";

import { Button } from "@saroh/ui/button";
import { useEffect, useState } from "react";

import type {
    WebAddressRead,
    WebAddressView,
} from "@/lib/organizations/web-address";
import { readWebAddressAction } from "@/lib/organizations/web-address-actions";

import { WebAddressDialog } from "@/components/organizations/web-address/web-address-dialog";
import { useBusinessZone } from "@/components/shared/dates/business-zone";

/**
 * The web address chosen at setup, in the Turn on sheet's Website field:
 * read, not asked again. The owner, while changing is rolled out
 * (DEC-069), changes it here in Settings' own dialog, on top of the sheet,
 * which stays open with the new address. Read only while this shows.
 */
export function FixedWebAddress({
    address,
    onChanged,
}: {
    address: string;
    onChanged: (address: string) => void;
}) {
    const zone = useBusinessZone();
    const [read, setRead] = useState<WebAddressRead | null>(null);
    const [open, setOpen] = useState(false);
    useEffect(() => {
        let live = true;
        readWebAddressAction().then(
            (r) => {
                if (live) setRead(r);
            },
            () => {
                if (live) setRead({ ok: false, missing: false });
            },
        );
        return () => {
            live = false;
        };
    }, []);

    const view = read?.ok ? read.data : null;
    const canChange = !!view?.changeAvailable && view.canChange;
    // Nothing promised until the read says who may change it.
    const line =
        !read || canChange
            ? "You chose it when you set up."
            : view?.changeAvailable
              ? "You chose it when you set up. Only the owner can change it."
              : "You chose it when you set up. It can be changed in Settings › Business.";

    function changed(next: WebAddressView) {
        setRead({ ok: true, data: next });
        onChanged(next.address);
    }

    return (
        <dl className="grid gap-1">
            <dt data-ph-unmask="" className="text-[12.5px] font-medium">
                Web address
            </dt>
            <dd className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 break-all font-mono text-[13px]">
                    {address}.saroh.app
                </span>
                {view && canChange ? (
                    <>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setOpen(true)}
                        >
                            Change
                        </Button>
                        <WebAddressDialog
                            open={open}
                            onOpenChange={setOpen}
                            view={view}
                            zone={zone}
                            onChanged={changed}
                        />
                    </>
                ) : null}
            </dd>
            <dd
                data-ph-unmask=""
                className="text-pretty text-[11.5px] leading-normal text-muted-foreground"
            >
                {line}
            </dd>
        </dl>
    );
}
