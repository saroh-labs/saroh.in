"use client";

import { Button } from "@saroh/ui/button";
import Link from "next/link";

import { CopyValue } from "@/components/sites/search-tracking/parts";
import { Absent, Group, Row, Section } from "@/components/sites/settings-rows";
import type { SiteAddress } from "@/lib/sites/share-links";

/** Where the web address is changed: its one place (DEC-069). */
export const WEB_ADDRESS_HREF = "/settings/organization#web-address";

/**
 * Address: the web address once, with Copy, View while the site is live,
 * and Change where the owner may change it (`WEB_ADDRESS_CHANGE`, the
 * API's `canChange`), which opens its one place, Settings › Business. Then
 * the business's own domain (`domain` is `CustomDomain`, or nothing for a
 * role that can't read it). Both apply as soon as they are saved.
 *
 * The header above already says whether the site is published, so the old
 * "Site status" card and its second copy of the address are gone.
 */
export function AddressGroup({
    address,
    live,
    canChangeAddress,
    domain,
}: {
    address: SiteAddress | null;
    live: boolean;
    canChangeAddress: boolean;
    domain?: React.ReactNode;
}) {
    return (
        <Group id="address" title="Address">
            <Section>
                <Row
                    label="Web address"
                    action={
                        address ? (
                            <div className="flex flex-wrap gap-2">
                                <CopyValue
                                    value={`https://${address.platformHost}`}
                                    label="Web address"
                                />
                                {live ? (
                                    <Button variant="outline" size="sm" asChild>
                                        <a
                                            href={address.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            View
                                        </a>
                                    </Button>
                                ) : null}
                                {canChangeAddress ? (
                                    <Button variant="outline" size="sm" asChild>
                                        <Link href={WEB_ADDRESS_HREF}>
                                            Change
                                        </Link>
                                    </Button>
                                ) : null}
                            </div>
                        ) : undefined
                    }
                >
                    {address ? (
                        <span className="font-mono [overflow-wrap:anywhere]">
                            {address.platformHost}
                        </span>
                    ) : (
                        <Absent>None yet</Absent>
                    )}
                </Row>
            </Section>
            {domain ? (
                <Section
                    title="Your own domain"
                    description="Point a domain you own at this site. Visitors see no change until it's verified."
                >
                    {domain}
                </Section>
            ) : null}
        </Group>
    );
}
