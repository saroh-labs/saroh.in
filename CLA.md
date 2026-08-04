# Contributor Licence Agreement

**Version 1.0 — 4 August 2026**

Thank you for wanting to contribute to Saroh.

This agreement is between **you** and **Saroh** (the project maintainer, "we",
"us"). It has to be agreed once, before your first contribution is merged.

> **What this is, in one line:** you keep ownership of what you write, and you
> give us permission to use it in Saroh — including in versions we license
> commercially.
>
> **What this is not:** it is not a transfer of your copyright, and it is not
> exclusive. You may use, publish and relicense your own contribution anywhere
> else, for anything, forever. Nothing here takes your work away from you.

## Why this exists

Saroh is released under the [Elastic License 2.0](LICENSE.md), and we sell
separate commercial licences to anyone who wants to run it as a hosted service.

A commercial licence has to cover the **whole** codebase. If parts of Saroh were
licensed to us only under ELv2 by their authors, we could not include those
parts in a commercial grant without going back to each author for permission —
and one contributor who is unreachable, or who says no, means their code has to
be found and rewritten before any such deal can close.

This agreement prevents that, once, at the start. It is the ordinary practice
for projects with a commercial licence: Apache, Google, Elastic and MongoDB all
use a version of it.

## 1. Definitions

**"Contribution"** means any work you intentionally submit to us for inclusion
in Saroh — code, documentation, designs, tests, configuration — in any form and
by any means, including pull requests, patches and issue attachments.

**"Saroh"** means the software and materials in this repository and any later
version of them.

## 2. Copyright licence

**You keep your copyright.** You grant us a perpetual, worldwide, non-exclusive,
irrevocable, royalty-free licence to:

- **a.** use, reproduce, modify, adapt and publish your Contribution;
- **b.** distribute and make it available as part of Saroh; and
- **c.** **sublicense and relicense it**, including under commercial or
  proprietary terms, and including under a different licence should Saroh's
  licence change.

Point (c) is the operative one. Without it, none of the above is worth much to
us in practice, because we could not include your work in a commercial licence.

## 3. Patent licence

You grant us and everyone who receives Saroh a perpetual, worldwide,
non-exclusive, irrevocable, royalty-free licence under any patent claims you own
or control that are necessarily infringed by your Contribution, to make, use,
sell, offer to sell, import and otherwise transfer Saroh.

If you start patent litigation alleging that Saroh infringes a patent, the
patent licences granted to you for Saroh end on the day you file.

## 4. What you are confirming

By agreeing, you confirm that:

- **a.** the Contribution is your original work, or you have the right to submit
  it under this agreement;
- **b.** **if you are employed, or wrote it using an employer's equipment or
  time, your employer has waived any rights in it or has permitted you to submit
  it.** This is the one people forget, and it is the one most likely to cause a
  problem later — many employment contracts assign everything you write to your
  employer by default, including work done at home;
- **c.** you have identified any third-party material in your Contribution and
  the licence it comes under (see Section 5);
- **d.** you are legally able to enter this agreement. If you are under 18,
  please ask a parent or guardian to agree on your behalf.

## 5. Third-party material

If your Contribution includes code you did not write — a snippet from a blog
post, a vendored file, an adapted example — say so in the pull request and name
its licence.

Do not include anything under a copyleft licence (GPL, AGPL, SSPL) without
asking us first. Saroh has no copyleft dependency anywhere in production, and
that is deliberate: a single one would make it impossible to license Saroh
commercially at all.

## 6. No warranty from you

Your Contribution is provided as is. Unless required by law or agreed in
writing, you provide it without warranties or conditions of any kind, express or
implied. You are not taking on liability to us for it.

## 7. We are not obliged to use it

We may accept, reject, modify or later remove any Contribution. Agreeing to this
does not oblige us to merge anything, and nothing here creates an employment,
partnership or agency relationship between us.

## 8. If something changes

If any fact you relied on when agreeing stops being true — you discover you did
not have the rights after all, or your employer raises a claim — tell us at
<mohit@saroh.in> as soon as you can.

## 9. Governing law

This agreement is governed by the laws of India.

---

## How to agree

Add this line to the description of your first pull request, with your details
filled in:

```
I have read CLA.md and I agree to it.
Name: <your full name>
GitHub: @<your username>
Email: <your email>
```

That is the whole process, and it is once — not per pull request.

Sign your commits as well, so the record travels with the code:

```bash
git commit -s -m "feat(scope): what changed"
```

That adds a `Signed-off-by:` trailer. Combined with the line above, the
provenance of every line in Saroh stays traceable.

---

**This agreement has not been reviewed by a lawyer.** It is written to be
readable and to do the job, and it is far better than having nothing — but if
you are contributing on behalf of a company, have your own counsel read it
first.
