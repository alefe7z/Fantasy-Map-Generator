Azgaar's Fantasy Map Generator is a web application for procedurally generating, editing, and visualizing fantasy maps. Read the `CONTEXT.md` file in the root.

For deeper knowledge, consult the `docs/` directory, especially `docs/architecture/architecture.md` and `docs/architecture/data-model.md`.

Keep comments short and to the point. Don't repeat information that is in docs. Prefer one-liners or no comments.

# Working in this fork (alefe7z/Fantasy-Map-Generator)

This fork has a lead reviewer (Claude). Every change you make is reviewed against the rules below before it is
merged; a PR that breaks one is sent back. The owner reads Brazilian Portuguese.

## Scope

- One topic per PR, as small as the task allows. Don't refactor, rename or reformat code the task does not need.
- Read the files you change and their neighbours first, and copy the patterns already there. `CONTEXT.md` and
  `docs/architecture/module-guide.md` are binding. A similar existing module is the template: an editor of a
  list in `options.map` follows `src/controllers/economy/transport-editor.ts`; one in `pack` follows its domain's
  existing editor.
- Don't edit `.github/`, `electron/`, `electron-builder.yml`, `package.json` dependencies or `VERSION` in
  `src/services/versioning.ts` unless the task asks for it: a version bump on `master` starts a desktop release.
- No new production dependencies.

## Before you open the PR, all of these must pass

```sh
npx tsc --noEmit
npm run lint                       # biome, writes fixes: commit them
npx vitest run                     # unit tests, once (plain `npm run test` watches)
npm run build
```

- Interface text changed: `npm run extract-strings`, then add the new keys to `src/locales/pt-BR.json` and
  `src/locales/pt.json`, appended at the end of each file (don't re-sort them), then `node scripts/lint-locales.mjs`.
- A model, `src/app/fmg.ts` or a map command changed: `npm run generate:assistant-context`
  (`context.test.ts` fails when it is stale).
- New model logic gets a unit test next to it (`*.test.ts`, `// @vitest-environment jsdom` when it touches the DOM
  or `options`).
- Never run Playwright / `npm run test:e2e`: it freezes the machine.

## Mistakes already made here; don't repeat them

- `ensureEl(id)` and `findEl(id)` take an element **id**, not a CSS selector. For a selector use
  `element.querySelector(...)`.
- Biome rejects `return voidFunction();` in a `void` function: call it, then `return;`.
- `t()` keys are plain English text: no markup, no trailing colon, no ellipsis, no outer spaces. Put `:` and `…`
  in code: `` `${t("Name")}:` ``, `` `${t("Myths, omens")}…` ``.
- A new field in a saved shape (`options.map` schema in `options-schema.ts`, or `pack`) needs: the default in
  `options-model.ts` (and the legacy default in `auto-update.ts`), a migration in `src/services/io/auto-update.ts`
  for maps saved without it, and a decision whether `Options.randomize()` keeps it on regeneration. Never guard
  for the old shape anywhere else.
- Tests that compare a whole object (`toEqual`) break when you add a field: update them, don't loosen them.
- A new model singleton is exposed in `src/app/fmg.ts`; a new editor is registered in `src/controllers/index.ts`,
  in `src/app/map-commands.ts` and, when it has a button, in the matching tab under `src/app/chrome/tabs/`.

## The PR description, in Brazilian Portuguese

1. **O que mudou** – one or two sentences for the owner, no jargon.
2. **Como foi verificado** – the commands above and their results; what you checked by hand.
3. **Pendências** – anything not done, assumed or uncertain. Don't hide a failing check.

## Review guidelines

Flag as blocking: a broken rule above, `any`, a DOM lookup by `getElementById`, generators or renderers touching
state they don't own, a saved-shape change without its migration, user-visible text outside `t()`, missing tests
for new model logic, and changes outside the task's scope.
