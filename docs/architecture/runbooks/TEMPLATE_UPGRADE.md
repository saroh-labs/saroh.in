# Template upgrade: moving existing sites to their template's newest version

> **Read when:** releasing a new version of the starter, Personal or Portfolio
> template and bringing existing sites up to it. Decision: DEC-141. Code:
> `apps/api.saroh.in/src/modules/sites/template-upgrade.ts`, run by
> `apps/api.saroh.in/src/cli/template-upgrade.cli.ts`.

A site's sections and style are copied into it when it is made, so a new
template version reaches no existing site by itself. This command brings each
one up. It is run by hand, once per environment, after the release that carries
the new version is live. It is not a migration and nothing runs it on a
schedule.

## What it does to one site

Only sites whose recorded template is `starter`, `personal` or `portfolio`, on
a version older than the newest. In one transaction per site:

| Part                                              | Still as its template made it                                                                                      | Changed by its owner                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Look (colourway, fonts, type scale)               | The new version's first colourway                                                                                  | Kept. Website › Style offers the new colourways                                                                                                  |
| Footer                                            | The new version's (set on the left, with the business's own line where it has one)                                 | Kept                                                                                                                                             |
| A page                                            | Becomes the new version's page for the business as it is now                                                       | Every section kept, in its order. Gains only bound sections it has nothing like (products, services, classes, plans, packs, the place and hours) |
| A page the new version no longer makes            | Hidden (not deleted)                                                                                               | Kept                                                                                                                                             |
| A note to the owner in a headline's line          | Replaced by the business's own line, or cleared                                                                    | The same: nobody wrote it                                                                                                                        |
| Module pages (Contact; Shop, Book, Prices)        | Added where the business has the module and the site has no such page and nothing of its own at the page's address | The same                                                                                                                                         |
| The record (`templateVersion`, `templateStyleId`) | Moves to the new version, with an audit event `site.template.upgrade` by `system:template-upgrade`                 | The version moves; the colourway is recorded only when the look was applied                                                                      |

"Still as its template made it" is read from the data: a page whose draft has
never been saved, or whose sections equal what its template produces for the
business. Anything else counts as changed and is kept.

**It writes drafts only.** No site is published by it and no live page changes.
The owner sees the new look in the editor, with changes waiting, and publishes.

It leaves alone: a site with no template recorded (made before templates were
recorded), a site on any other template, a site already on the newest version,
and every published version of every site.

## Running it

Inside the API's own container (it reads the same environment as the API):

```bash
# 1. Count what a run would do. Reads only; writes nothing.
node apps/api.saroh.in/dist/cli/template-upgrade.cli.js --dry-run

# 2. Optional: one business first, or a small number of sites.
node apps/api.saroh.in/dist/cli/template-upgrade.cli.js --business=<id or slug>
node apps/api.saroh.in/dist/cli/template-upgrade.cli.js --limit=20

# 3. Everything that is left.
node apps/api.saroh.in/dist/cli/template-upgrade.cli.js
```

It prints counts and template names, never a business's name, an address or a
line of anyone's site:

```text
[template-upgrade] dry run, nothing written. sites on these templates: <n>, would upgrade: <n>, already current: <n>, unknown version: <n>, failed: <n>
[template-upgrade] look: applied <n>, kept <n>; footer: applied <n>, kept <n>
[template-upgrade] pages: replaced <n>, kept with sections added <n>, added <n>, hidden <n>; sections added <n>; owner notes removed <n>; module pages added <n>
[template-upgrade] moves: personal@1 → personal@2: <n>, starter@3 → starter@4: <n>
```

- **Safe to run again, and to stop partway.** Each site commits by itself and a
  site on the newest version is skipped, so a second run carries on with what is
  left and changes nothing already done.
- **Exit 1** means a site failed. Nothing of that site was written (its
  transaction rolled back). Run it again; if the same count fails, look at the
  API's logs for that time rather than the command's output, which never prints
  a site.
- **`unknown version`** counts sites on a version this build does not have.
  They are left alone.
- **Beside live traffic.** It holds one site's lock at a time, the lock a
  publish takes, so a publish of that site waits a moment and then goes ahead.
  An editor open on a page the run adds a section to is told to reload at its
  next save.

## Order in a release

1. Release the API and the merchant sites with the new template version.
2. `--dry-run` on the dev environment, then the real run there. Open a few
   upgraded sites in the editor: one untouched, one with an edited page, one
   with a changed style.
3. The same on production.

There is nothing to switch off afterwards and no flag. New sites start from the
newest version from the moment the release is live, whether or not the command
has been run.

## Undoing it

There is no command that puts a site back, and none is needed for the live
site: nothing live was changed. For a draft, the owner's own tools apply: a
hidden page is shown again from its page settings, a section is removed in the
editor, and Website › Style returns a site to any look it offers. The audit
event on each site says which version it moved from and what was applied.
