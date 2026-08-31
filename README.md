# Lanes

A resource timeline for Vue 3. Rows of people, rooms or machines; a day or week
axis across the top; bars you can drag, stretch and connect.

```sh
npm i lanesjs
```

Vue 3.4 or newer, as a peer dependency. ES modules only.

## Why another one

Because the alternatives are either a calendar pretending to be a timeline, or a
suite you buy whole. Lanes is one component, about **15 kB gzipped**, and it does
not own your data: no store inside, no fetching, no dates rewritten behind your
back. You pass rows and bars, you get told what the user did, you decide what
happens next.

The free half is a complete, working timeline. The paid half is a set of plugins
that let users *change* things — drag, stretch, select-to-create, undo. Nothing
is crippled and nothing phones home: see [Licence](#licence) below.

## Quick start

```vue
<script setup lang="ts">
import { Timeline } from "lanesjs";
import "lanesjs/style.css";

const resources = [
    { id: "r1", title: "Room 101" },
    { id: "r2", title: "Room 102" },
];

const items = [
    { id: "b1", resourceId: "r1", start: "2026-03-02", end: "2026-03-06" },
];

const range = { start: "2026-03-01", end: "2026-04-01" };
</script>

<template>
    <Timeline :resources="resources" :items="items" :range="range" />
</template>
```

Dates are plain `YYYY-MM-DD` strings, and the end is exclusive — the same
convention as the rest of the platform, so nothing has to be converted on the
way in or out.

### Slots

Every visible piece is a slot: `corner`, `slot-label` (a cell of the date axis),
`resource` (a row header), `item` (the contents of a bar), `background`. The
default rendering is a sensible fallback, not a limit.

### Events

`range-change`, `cell-click`, `item-click`, `slot-click`. The component never
changes your arrays; it tells you what happened and waits.

## What it does

- **Virtualized rows and axis.** Three hundred resources over a year cost three
  hundred rows in the DOM, not ninety thousand cells.
- **Day and week steps**, with a range label per week (`12–18 Mar`) produced by
  `Intl` — there are no locale files in this package and there never will be.
  Every language the browser knows is supported and none of them weighs
  anything.
- **Two scroll modes.** Inside a fixed height for panels and modals, or growing
  down the page with a sticky header for full screens.
- **Keyboard and screen readers.** Tab enters the table once, arrows move between
  bars, `Home`/`End` reach the edges of a row, `Enter` opens. Bars are named for
  screen readers, and you can name them better with `itemLabel`.
- **Printing.** `Ctrl+P` would print only the virtualized rows, so printing is a
  method: `timeline.print()` renders the whole table, prints, and folds it back.
- **Device-pixel snapping**, because at 125% display scaling a 31 px column is
  38.75 device pixels and every fourth grid line otherwise disappears.

## Styling

Colours come from CSS custom properties, and every rule inside the component has
zero specificity (`:where`), so anything you write wins without `!important`:

```css
.my-timeline {
    --rt-surface: #fff;
    --rt-grid-line: rgba(0, 0, 0, 0.07);
    --rt-bar-bg: #4f2dc5;
    --rt-bar-text: #fff;
    --rt-today-bg: rgba(79, 45, 197, 0.05);
    --rt-ghost-bg: rgba(79, 45, 197, 0.06); /* the drag preview */
    --rt-radius: 8px;
}
```

Light, system-dark and explicit dark are all handled; pass `theme="dark"` to
force it, or leave it alone and follow the reader's system.

Tokens cover colour, not layout. For borders, gaps and header height there are
public class names — `.rt`, `.rt__grid`, `.rt__corner`, `.rt__axis`,
`.rt__axis-cell`, `.rt__resources`, `.rt__resource`, `.rt__body`, `.rt__column`,
`.rt__row`, `.rt__bar`, `.rt__ghost`, `.rt__background`, `.rt__overlay`, plus the
`--today`, `--weekend`, `--dragging` and `--invalid` modifiers. Those names are
part of the contract; renaming one is a breaking change.

## Pro plugins

```ts
import { drag, create, history, links, setLicense } from "lanesjs/pro";
```

- `drag` — move a bar between days and rows, stretch it by an edge. On touch the
  gesture starts on a long press, so a finger can still scroll the table.
- `create` — drag across empty space to make something new.
- `history` — undo and redo, over your data, not ours.
- `links` — dependencies drawn between bars.

Rules stay in your application, not in the plugin: `canMove` and `canResize` are
asked before anything is shown, and a forbidden target is drawn as forbidden
while the gesture is still happening — not silently ignored on release.

## Licence

The core is free to use. The `lanesjs/pro` plugins are commercial, and a licence
key is one string:

```ts
setLicense("LANES.…");
```

The check is offline — a signature, verified in the browser, with no request to
us. Nothing is disabled without a key: the plugins work, and the component says
once in the console and in a small corner badge that it is being used unlicensed.
What the key limits is the **updates window**, compared against the build date of
the package rather than the clock, so the version you bought keeps working
forever.

See [LICENSE.md](./LICENSE.md) for the terms, and
[polkilof.github.io/lanesjs](https://polkilof.github.io/lanesjs/) for the live
demo. Until the store is up, keys are issued by hand — open an issue in
[github.com/Polkilof/lanesjs](https://github.com/Polkilof/lanesjs/issues).

## Status

`0.1.0` — in production in one application, API still allowed to move before
`1.0`. Decisions and their reasons are written down in
[BRIEF.md](./BRIEF.md), in Ukrainian.
