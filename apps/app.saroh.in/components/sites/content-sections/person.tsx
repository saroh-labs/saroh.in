"use client";

import {
    PERSON_BIO_MAX,
    PERSON_CREDENTIALS_MAX,
    PERSON_TEAM_MAX,
    resolveVariant,
} from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";
import { useId } from "react";

import { MediaPicker } from "@/components/shared/fields/media-picker";
import { pickedSizes } from "@/components/shared/fields/picked-image";
import { TeamPeople } from "@/components/sites/editor/inspector/team-people";
import type {
    PersonContent,
    PersonCredential,
    PersonMember,
} from "@/lib/sites/service";

import {
    CtaActionFields,
    actionOf,
    withCtaAction,
    withCtaLabel,
} from "@/components/sites/section-fields/cta-action-fields";
import { ImageBrief } from "@/components/sites/section-fields/image-brief";
import { OptionSwitch } from "@/components/sites/section-fields/option-switch";
import { PhoneTextField } from "@/components/sites/section-fields/phone-text-field";
import type { SectionFieldsProps } from "@/components/sites/section-fields/props";

/**
 * The `person` section's editor fields (industry templates U2): a photo,
 * the name, what they do, their qualifications (up to the contract's cap),
 * a few lines about them and an optional button, such as "Book with Anika".
 *
 * Nothing is invented: a just-added block has an empty name. The photo goes
 * through the media library and its description is asked for here, needed
 * before publishing (the pre-publish check names a photo without one). A
 * template's brief for the photo shows in the empty slot (KTD-5).
 */
export function PersonFields({
    section,
    pages,
    onChange,
}: SectionFieldsProps<"person">) {
    const c = section.content;
    const patch = (next: Partial<PersonContent>) =>
        onChange({ ...section, content: { ...c, ...next } });
    const credentials = c.credentials ?? [];
    const setCredentials = (next: PersonCredential[]) =>
        patch({ credentials: next.length > 0 ? next : undefined });
    const team = resolveVariant("person", c) === "team";
    const hintId = useId();
    const image = c.image?.src ? c.image : undefined;
    // Our team with nobody on it: no first person to give a photo or words.
    const empty = team && c.name === "" && !c.people?.length;

    return (
        <div className="grid gap-3">
            {team ? (
                // Who appears, in order (round 3, EBTeamPicker).
                <TeamPeople
                    content={c}
                    onChange={(content) => onChange({ ...section, content })}
                />
            ) : null}
            {empty ? null : (
                <Field label="Photo">
                    <div className="flex items-start gap-2.5">
                        {image ? (
                            // eslint-disable-next-line @next/next/no-img-element -- a tenant's own photo, a thumbnail outside next/image's allowlist
                            <img
                                src={image.src}
                                alt=""
                                className="h-14 w-11 flex-none rounded-md border border-border object-cover"
                            />
                        ) : null}
                        <MediaPicker
                            className="min-w-0 flex-1"
                            label={image ? "Replace…" : "Upload a photo…"}
                            onPick={(picked) =>
                                patch({
                                    image: {
                                        src: picked.src,
                                        alt: image?.alt,
                                        width: picked.width,
                                        height: picked.height,
                                        ...pickedSizes(picked),
                                    },
                                })
                            }
                        />
                    </div>
                    <ImageBrief
                        brief={c.imageBrief}
                        hasImage={Boolean(image)}
                    />
                    {image ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="justify-self-end text-destructive hover:text-destructive"
                            onClick={() => patch({ image: undefined })}
                        >
                            Remove photo
                        </Button>
                    ) : null}
                </Field>
            )}
            {image ? (
                <div className="grid gap-1">
                    <Field label="Describe the photo">
                        <Input
                            value={image.alt ?? ""}
                            onChange={(e) =>
                                patch({
                                    image: { ...image, alt: e.target.value },
                                })
                            }
                            placeholder="What is in the photo, for someone who can't see it"
                            aria-describedby={hintId}
                        />
                    </Field>
                    <p id={hintId} className="text-xs text-muted-foreground">
                        {image.alt?.trim()
                            ? "Read aloud to visitors who can't see it."
                            : "Needed before you publish."}
                    </p>
                </div>
            ) : null}

            {/* On Our team the People list names each person and holds the
                words under them (EBTeamPicker 1); a name typed by hand is
                still changed here. */}
            {team && (c.staffId || empty) ? null : (
                <Field
                    label="Name"
                    hint={
                        c.staffId
                            ? "From Team: their name as Team has it."
                            : undefined
                    }
                >
                    <Input
                        value={c.name}
                        readOnly={Boolean(c.staffId)}
                        onChange={(e) => patch({ name: e.target.value })}
                        placeholder="Their name, as they'd introduce themselves"
                    />
                </Field>
            )}
            {team ? null : (
                <Field label="What they do">
                    <Input
                        value={c.role ?? ""}
                        onChange={(e) =>
                            patch({ role: e.target.value || undefined })
                        }
                        placeholder="Clinical dietician"
                    />
                </Field>
            )}

            {team ? null : (
                <>
                    <Field label="Qualifications">
                        <div className="grid gap-2">
                            {credentials.map((cred, i) => {
                                const row = credentialRow(cred);
                                return (
                                    <div
                                        key={i}
                                        className="grid gap-1.5 rounded-md border p-2"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Input
                                                value={row.title}
                                                aria-label={`Qualification ${i + 1}`}
                                                onChange={(e) =>
                                                    setCredentials(
                                                        credentials.map(
                                                            (v, j) =>
                                                                j === i
                                                                    ? asCredential(
                                                                          e
                                                                              .target
                                                                              .value,
                                                                          row.detail,
                                                                      )
                                                                    : v,
                                                        ),
                                                    )
                                                }
                                                placeholder="MSc Clinical Nutrition"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                aria-label={`Remove qualification ${i + 1}`}
                                                onClick={() =>
                                                    setCredentials(
                                                        credentials.filter(
                                                            (_, j) => j !== i,
                                                        ),
                                                    )
                                                }
                                            >
                                                Remove
                                            </Button>
                                        </div>
                                        <Input
                                            value={row.detail}
                                            aria-label={`Where qualification ${i + 1} is from`}
                                            onChange={(e) =>
                                                setCredentials(
                                                    credentials.map((v, j) =>
                                                        j === i
                                                            ? asCredential(
                                                                  row.title,
                                                                  e.target
                                                                      .value,
                                                              )
                                                            : v,
                                                    ),
                                                )
                                            }
                                            placeholder="Optional. Where and when, like Manipal University, 2012"
                                        />
                                    </div>
                                );
                            })}
                            {credentials.length < PERSON_CREDENTIALS_MAX ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="justify-self-start"
                                    onClick={() =>
                                        setCredentials([...credentials, ""])
                                    }
                                >
                                    Add a qualification
                                </Button>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    That is the most this block lists.
                                </p>
                            )}
                        </div>
                    </Field>
                    {credentials.length > 0 ? (
                        <Field label="Label over them">
                            <Input
                                value={c.credentialsLabel ?? ""}
                                onChange={(e) =>
                                    patch({
                                        credentialsLabel:
                                            e.target.value || undefined,
                                    })
                                }
                                maxLength={40}
                                placeholder="Qualifications"
                            />
                        </Field>
                    ) : null}
                </>
            )}

            {empty ? null : (
                <Field optional label="About them">
                    <Textarea
                        value={c.bio ?? ""}
                        onChange={(e) =>
                            patch({ bio: e.target.value || undefined })
                        }
                        rows={4}
                        maxLength={PERSON_BIO_MAX}
                        placeholder="A few lines in their own words."
                    />
                </Field>
            )}

            {/* The team look draws no button. */}
            {team ? null : (
                <Field label="Button label">
                    <Input
                        value={c.cta?.label ?? ""}
                        onChange={(e) =>
                            patch({ cta: withCtaLabel(c.cta, e.target.value) })
                        }
                        placeholder="Book a consultation"
                    />
                </Field>
            )}
            {!team && c.cta?.label.trim() ? (
                <CtaActionFields
                    action={actionOf(c.cta)}
                    pages={pages}
                    onChange={(action) =>
                        patch({ cta: withCtaAction(c.cta, action) })
                    }
                />
            ) : null}
            {!team && c.cta?.label.trim() ? (
                <PhoneTextField
                    label="Button"
                    value={c.cta.phoneLabel}
                    fallback={c.cta.label}
                    maxLength={40}
                    onChange={(phoneLabel) =>
                        patch({ cta: c.cta && { ...c.cta, phoneLabel } })
                    }
                />
            ) : null}

            {team ? (
                <>
                    <Field label="Heading over the team">
                        <Input
                            value={c.title ?? ""}
                            onChange={(e) =>
                                patch({ title: e.target.value || undefined })
                            }
                            placeholder="Who is coaching"
                        />
                    </Field>
                    <TeamFields
                        people={c.people ?? []}
                        onChange={(people) =>
                            patch({
                                people: people.length > 0 ? people : undefined,
                            })
                        }
                    />
                </>
            ) : null}

            <OptionSwitch
                label="This opens the page"
                checked={c.asTitle === true}
                onChange={(on) => patch({ asTitle: on ? true : undefined })}
                note={
                    team
                        ? "The heading becomes the page's main title. Use it only when this is the first thing on the page."
                        : "The name becomes the page's main title. Use it only when this is the first thing on the page."
                }
            />
        </div>
    );
}

/** A credential as the two inputs edit it. */
function credentialRow(cred: PersonCredential): {
    title: string;
    detail: string;
} {
    return typeof cred === "string"
        ? { title: cred, detail: "" }
        : { title: cred.title, detail: cred.detail ?? "" };
}

/** A line while there is no detail, a row once there is one. */
function asCredential(title: string, detail: string): PersonCredential {
    return detail.trim() ? { title, detail } : title;
}

/**
 * The team look's other people: a name, what they do, a line and a photo
 * each, up to the contract's cap. The block's own person, above, is always
 * first.
 */
function TeamFields({
    people,
    onChange,
}: {
    people: PersonMember[];
    onChange: (next: PersonMember[]) => void;
}) {
    const set = (i: number, next: Partial<PersonMember>) =>
        onChange(people.map((p, j) => (j === i ? { ...p, ...next } : p)));
    return (
        <Field label="Everyone else">
            <div className="grid gap-2">
                {people.map((p, i) => (
                    <div key={i} className="grid gap-2 rounded-md border p-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                                Person {i + 2}
                            </span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={`Remove person ${i + 2}`}
                                onClick={() =>
                                    onChange(people.filter((_, j) => j !== i))
                                }
                            >
                                Remove
                            </Button>
                        </div>
                        <MediaPicker
                            label={
                                p.image?.src
                                    ? "Replace photo…"
                                    : "Upload a photo…"
                            }
                            onPick={(picked) =>
                                set(i, {
                                    image: {
                                        src: picked.src,
                                        alt: p.image?.alt,
                                        width: picked.width,
                                        height: picked.height,
                                        ...pickedSizes(picked),
                                    },
                                })
                            }
                        />
                        <ImageBrief
                            brief={p.imageBrief}
                            hasImage={Boolean(p.image?.src)}
                        />
                        {p.image?.src ? (
                            <Input
                                value={p.image.alt ?? ""}
                                aria-label={`Describe person ${i + 2}'s photo`}
                                onChange={(e) =>
                                    set(i, {
                                        image: p.image
                                            ? {
                                                  ...p.image,
                                                  alt: e.target.value,
                                              }
                                            : undefined,
                                    })
                                }
                                placeholder="What is in the photo, for someone who can't see it"
                            />
                        ) : null}
                        <Input
                            value={p.name}
                            readOnly={Boolean(p.staffId)}
                            aria-label={`Person ${i + 2}'s name`}
                            onChange={(e) => set(i, { name: e.target.value })}
                            placeholder="Their name"
                        />
                        <Textarea
                            value={p.bio ?? ""}
                            aria-label={`About person ${i + 2}`}
                            onChange={(e) =>
                                set(i, { bio: e.target.value || undefined })
                            }
                            rows={2}
                            maxLength={600}
                            placeholder="A line about them. Optional."
                        />
                    </div>
                ))}
                {people.length < PERSON_TEAM_MAX ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="justify-self-start"
                        onClick={() => onChange([...people, { name: "" }])}
                    >
                        Add a person
                    </Button>
                ) : (
                    <p className="text-xs text-muted-foreground">
                        That is the most a team block shows.
                    </p>
                )}
            </div>
        </Field>
    );
}
