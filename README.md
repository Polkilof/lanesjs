# Lanes

A resource timeline for Vue 3. Rows of people, rooms or machines; a day or week
axis across the top; bars you can drag, stretch and connect.

```sh
npm i lanesjs
```

Vue 3.4 or newer, as a peer dependency. ES modules only.

## Why another one

Because the alternatives are either a calendar pretending to be a timeline, or a
suite you buy whole. Lanes is one component, and it does not own your data: no
store inside, no fetching, no dates rewritten behind your back. You pass rows and
bars, you get told what the user did, you decide what happens next.

The free half is a complete, working timeline. The paid half is a set of plugins
that let users *change* things — drag, stretch, select-to-create, undo. Nothing
is crippled and nothing phones home: see [Licence](#licence) below.

## Contents

- [Quick start](#quick-start)
- [Five things to know first](#five-things-to-know-first)
- [The data you pass](#the-data-you-pass)
- [Props](#props)
- [Events](#events)
- [Slots](#slots)
- [Methods](#methods)
- [Moving through time](#moving-through-time)
- [Size and scrolling](#size-and-scrolling)
- [Styling](#styling)
- [Keyboard and screen readers](#keyboard-and-screen-readers)
- [Printing](#printing)
- [Pro plugins](#pro-plugins)
- [Server-side rendering and Nuxt](#server-side-rendering-and-nuxt)
- [Troubleshooting](#troubleshooting)
- [Size on the wire](#size-on-the-wire)
- [Licence](#licence)

## Quick start

A complete, working component. Copy it, run it, then start changing things.

```vue
<script setup lang="ts">
import { ref } from "vue";
import { Timeline } from "lanesjs";
import "lanesjs/style.css";

const resources = ref([
    { id: "r1", title: "Room 101" },
    { id: "r2", title: "Room 102" },
]);

const items = ref([
    { id: "b1", resourceId: "r1", start: "2026-03-02", end: "2026-03-06" },
    { id: "b2", resourceId: "r2", start: "2026-03-04", end: "2026-03-05" },
]);

const range = { start: "2026-03-01", end: "2026-04-01" };
</script>

<template>
    <!-- The height is yours to set: the component fills what you give it. -->
    <Timeline
        style="height: 400px"
        :resources="resources"
        :items="items"
        :range="range"
        today="2026-03-12"
        label="Rooms"
    />
</template>
```

Two things trip people up on the first run, so they are worth saying out loud:

- **Set a height.** In the default `scroll="container"` mode the timeline fills
  its container and scrolls inside it. A container of zero height shows nothing.
  Either give it a height, or switch to `scroll="page"` (see
  [Size and scrolling](#size-and-scrolling)).
- **Import the stylesheet once**, anywhere in your app — `lanesjs/style.css`.
  The package never injects CSS on its own, because a library does not get to
  decide when your styles load.

## Five things to know first

Everything else in this file follows from these.

**1. Dates are plain `YYYY-MM-DD` strings.** No `Date` objects, no timezones, no
conversion on the way in or out. They are wall dates: `2026-03-02` is the second
of March everywhere, and daylight saving cannot move it.

**2. `end` is exclusive**, the same convention as FullCalendar and the rest of
the platform. A one-day event is `start: "2026-03-02", end: "2026-03-03"`. If
you pass an `end` that is not after `start`, Lanes shows one slot rather than
silently losing the event.

**3. The component is controlled.** It never sorts, filters, or edits your
arrays. Row order *is* the order of `resources`. When a plugin reports a drag,
it reports what the user did — applying it to your data is your call.

**4. Ids are how everything is matched.** `item.resourceId` must equal some
`resource.id`, or the item is not drawn at all (no warning: filtering your data
is not the component's job). Item ids must be unique across the whole table —
plugins and links look items up by id.

**5. Nothing is highlighted as "today" unless you say so.** Pass
`today="2026-03-12"` — or `today` from your own clock. This is deliberate: a
component that reads the clock cannot be tested, and "today" in your product may
mean the user's timezone rather than the browser's.

```ts
// If the browser's day is what you want:
const today = new Date().toLocaleDateString("sv"); // sv gives YYYY-MM-DD
```

## The data you pass

Three shapes, all exported as types:

```ts
import type { DateRange, Item, Resource } from "lanesjs";

interface Resource<M = unknown> {
    id: string;
    title: string;
    meta?: M; // anything of yours: avatar, floor, department…
}

interface Item<M = unknown> {
    id: string;
    resourceId: string;
    start: string; // YYYY-MM-DD
    end: string; // YYYY-MM-DD, exclusive
    display?: "bar" | "background"; // default "bar"
    meta?: M;
}

interface DateRange {
    start: string;
    end: string; // exclusive
}
```

`meta` is yours and the core never looks inside it. That is where the guest
name, the status colour, the employee's photo go — and the slots are where you
render them.

`display: "background"` draws the item *under* the grid across the full row
height instead of taking a lane: closed periods, holidays, off-shift hours. It
takes no part in stacking and does not catch the pointer.

### Typing meta

`Timeline` is generic — `Timeline<resource meta, item meta>` — and in a template
the types flow from the props, so usually you write nothing:

```vue
<script setup lang="ts">
import { ref } from "vue";
import { Timeline } from "lanesjs";
import type { Item, Resource } from "lanesjs";

interface Room { floor: number }
interface Booking { guest: string; status: "confirmed" | "pending" }

const resources = ref<Resource<Room>[]>([]);
const items = ref<Item<Booking>[]>([]);
</script>

<template>
    <Timeline :resources="resources" :items="items" :range="range">
        <!-- placed.item.meta is Booking | undefined here, not any -->
        <template #item="{ placed }">{{ placed.item.meta?.guest }}</template>
    </Timeline>
</template>
```

### Overlapping items

Items in the same row that overlap in time are stacked into *lanes*, and the row
grows to fit: a row with three overlapping bookings is three bars tall. Lane
packing is deterministic — the same input always produces the same picture, so
bars never jump between renders.

## Props

Required:

| Prop | Type | What it is |
|---|---|---|
| `resources` | `Resource<R>[]` | The rows, in the order you want them. |
| `items` | `Item<I>[]` | The bars. Items whose `resourceId` matches no row are ignored. |
| `range` | `DateRange` | The visible window. `end` exclusive. |

Time axis:

| Prop | Type | Default | What it does |
|---|---|---|---|
| `step` | `"day" \| "week"` | `"day"` | One column per day, or per week. |
| `today` | `string` | — | Which day gets the "today" highlight. Nothing is highlighted if you omit it. |
| `weekendDays` | `number[]` | `[0, 6]` | Which weekdays are shaded. `0` is Sunday. |
| `weekStartsOn` | `0…6` | `1` (Monday) | Where a week column starts, for `step="week"`. |
| `locale` | `string` | browser locale | Passed straight to `Intl` for the axis labels. |
| `scrollTo` | `string` | — | Scroll the axis to this date: on mount, and on every change. |

Sizes, in pixels (colours are [tokens](#styling), not props):

| Prop | Type | Default | What it does |
|---|---|---|---|
| `slotWidth` | `number` | `40` | Column width. A **minimum**: spare room is shared out, unless `stretch` is off. |
| `resourceWidth` | `number` | `253` | Width of the left-hand row-header panel. |
| `barHeight` | `number` | `28` | Height of one bar. |
| `barGap` | `number` | `4` | Gap between lanes, and between a bar and the row edge. |
| `minRowHeight` | `number` | `0` | Floor for row height, whatever the lane count. |
| `stretch` | `boolean` | `true` | Off means columns are exactly `slotWidth` and the leftover stays empty. |

Scrolling and theme:

| Prop | Type | Default | What it does |
|---|---|---|---|
| `scroll` | `"container" \| "page"` | `"container"` | Scroll inside a fixed height, or grow down the page. See [below](#size-and-scrolling). |
| `stickyOffset` | `number` | `0` | Height of *your* sticky topbar, so the axis stops below it. Only for `scroll="page"`. |
| `overscan` | `number` | `4` | Rows kept in the DOM above and below the viewport. |
| `theme` | `"auto" \| "light" \| "dark"` | `"auto"` | `auto` follows the system. |

Rendering hooks:

| Prop | Type | What it does |
|---|---|---|
| `label` | `string` | Accessible name of the whole table: "Team schedule". |
| `itemLabel` | `(placed, resource) => string \| undefined` | Accessible name of one bar. Default is resource plus dates; your app almost always knows better. |
| `itemClass` | `(placed, resource) => string \| string[] \| undefined` | Classes on a bar — for states you can name. |
| `itemStyle` | `(placed, resource) => Record<string, string> \| undefined` | Inline styles on a bar — for values that come from data, such as a colour out of an API. This is also where you override `--rt-bar-bg` per bar. |
| `slotClass` | `(slot) => string \| string[] \| undefined` | Classes on a column — holidays, blackouts, sprint boundaries. A classed column gets a full-height overlay, exactly like "today". |
| `plugins` | `Plugin[]` | Behaviour plugins, ours or yours. **Read once, on mount** — see [Pro plugins](#pro-plugins). |

```ts
// Colour from data, state from a class.
const itemStyle = (placed: PlacedItem<Booking>) =>
    placed.item.meta?.colour ? { "--rt-bar-bg": placed.item.meta.colour } : undefined;

const itemClass = (placed: PlacedItem<Booking>) =>
    placed.item.meta?.status === "pending" ? "booking--pending" : undefined;
```

## Events

The component never changes your arrays; it tells you what happened and waits.

| Event | Payload |
|---|---|
| `item-click` | `{ item, resource, event, target }` |
| `cell-click` | `{ date, resource, event, target }` — a click on empty grid |
| `slot-click` | `{ slot, event, target }` — a click on a column header |
| `range-change` | `DateRange` — the axis window actually being shown |

`target` is the element that was clicked, kept as its own field because
`event.currentTarget` is null by the time you read a stored event. Anchor your
popovers to it.

`range-change` fires on mount as well as on change, and it is **the** signal to
load data — not the `range` prop. With `step="week"` the axis is wider than the
range you asked for (it starts at the beginning of the week), and what you need
to fetch is what is on screen:

```vue
<script setup lang="ts">
import type { DateRange } from "lanesjs";

async function load(visible: DateRange) {
    items.value = await api.bookings(visible.start, visible.end);
}
</script>

<template>
    <Timeline :range="range" @range-change="load" ... />
</template>
```

## Slots

Every visible piece is a slot. The default rendering is a sensible fallback, not
a limit.

| Slot | Props | Renders |
|---|---|---|
| `corner` | — | The empty square above the row headers. |
| `slot-label` | `{ slotData: Slot }` | One column header. Replaces the whole label. |
| `resource` | `{ resource: Resource<R> }` | One row header. |
| `item` | `{ placed: PlacedItem<I>, resource: Resource<R> }` | The contents of a bar. |
| `background` | `{ placed: PlacedItem<I> }` | The contents of a `display: "background"` item. |

```vue
<Timeline :resources="rooms" :items="bookings" :range="range">
    <template #corner>Rooms</template>

    <template #resource="{ resource }">
        <strong>{{ resource.title }}</strong>
        <small>floor {{ resource.meta?.floor }}</small>
    </template>

    <template #item="{ placed }">
        {{ placed.item.meta?.guest }}
    </template>
</Timeline>
```

`PlacedItem` is your item plus where it landed:

```ts
interface PlacedItem<M> {
    item: Item<M>;
    slotIndex: number; // first visible column
    slotSpan: number; // how many columns, always ≥ 1
    lane: number; // stacking lane inside the row
    clippedStart: boolean; // starts before the visible range
    clippedEnd: boolean; // ends after it
}
```

`Slot` is one column: `{ index, start, end, date, isToday, isWeekend }`, where
`date` is a local `Date` for formatting only.

## Methods

Reach them through a template ref:

```vue
<script setup lang="ts">
import { ref } from "vue";
import { Timeline } from "lanesjs";
import type { TimelineInstance } from "lanesjs";

const timeline = ref<TimelineInstance<Room, Booking> | null>(null);
</script>

<template>
    <button @click="timeline?.print()">Print</button>
    <button @click="timeline?.scrollToDate('2026-03-20')">Go to 20 March</button>
    <Timeline ref="timeline" ... />
</template>
```

| Member | Signature | What it does |
|---|---|---|
| `print()` | `() => Promise<void>` | Renders the whole table, prints, folds it back. See [Printing](#printing). |
| `scrollToDate()` | `(date, align?: "start" \| "center") => void` | Scrolls the axis. Default alignment is `center`. |
| `syncViewport()` | `() => void` | Re-measures. Call it after *you* resize the container in a way no observer sees. |
| `layout` | `Layout<R, I>` | The computed layout: slots, and rows with everything placed. Read-only. |

`TimelineInstance<R, I>` is exported for exactly this. Do not reach for
`InstanceType<typeof Timeline>` — `Timeline` is a *generic* component, which
compiles to a function rather than a constructor, so `InstanceType` does not
work on it at all. On Vue 3.5 or newer, `useTemplateRef("timeline")` infers the
same thing without naming a type.

## Moving through time

The range belongs to your app, so navigation lives outside the component. There
is a composable for the boring part:

```vue
<script setup lang="ts">
import { Timeline, useTimelineRange } from "lanesjs";

const { range, title, prev, next, today, gotoDate, anchor } = useTimelineRange({
    unit: "month", // "month" | "week" | "day"
    count: 1, // how many units in the window
    date: "2026-03-01", // starting anchor; default is today
    locale: "en-GB",
});
</script>

<template>
    <header>
        <button @click="prev">←</button>
        <button @click="today">Today</button>
        <button @click="next">→</button>
        <strong>{{ title }}</strong>
    </header>

    <Timeline style="height: 400px" :range="range" :resources="rooms" :items="items" />
</template>
```

| Option | Default | |
|---|---|---|
| `unit` | `"month"` | What `prev`/`next` move by. |
| `count` | `1` | Units per window: `{ unit: "week", count: 4 }` is a four-week board. |
| `date` | today | Initial anchor. |
| `weekStartsOn` | `1` | For `unit: "week"`. |
| `locale` | system | For the default title. |
| `formatTitle` | — | `(range, unit) => string`, if you want your own. |

It returns `anchor` (a writable ref), `range`, `title`, and `prev`, `next`,
`today`, `gotoDate`. You are not required to use it — any two ISO strings work.

## Size and scrolling

**`scroll="container"` (default).** The table scrolls inside the height you give
it. Right for modals and dashboard panels. Give the component a height — through
`style`, a class, or a flex parent — or you will see nothing.

**`scroll="page"`.** The table grows to its full height, the *page* scrolls
vertically, and the axis plus the horizontal scrollbar stick to the window.
Right for full-screen views, where a fixed height is always someone's guess
about someone else's screen. If your app has its own sticky topbar, pass its
height as `stickyOffset` so the axis parks underneath it.

```vue
<Timeline scroll="page" :sticky-offset="64" ... />
```

Column width: `slotWidth` is a minimum. When the container is wider than the
axis needs, columns share out the extra rather than leaving a bald strip on the
right. Set `:stretch="false"` if you need columns of exactly `slotWidth`.

Row height is `laneCount × barHeight + (laneCount + 1) × barGap`, floored by
`minRowHeight` — so rows grow with overlapping items instead of clipping them.

Sizes are snapped to *device* pixels, not CSS pixels. At 125% display scaling a
31 px column is 38.75 device pixels, and without snapping every fourth grid line
lands on a boundary and disappears while the rest blur. The fractional remainder
is absorbed by the row-header panel, where a third of a pixel is invisible.

## Styling

Colours come from CSS custom properties, and every rule inside the component has
zero specificity (`:where`), so anything you write wins without `!important`:

```css
.my-timeline {
    --rt-surface: #fff;
    --rt-grid-line: rgba(0, 0, 0, 0.07);
    --rt-bar-bg: #4f2dc5;
    --rt-bar-text: #fff;
    --rt-radius: 8px;
}
```

| Token | Paints |
|---|---|
| `--rt-surface` | Grid and row-header background |
| `--rt-header-bg` | Date-axis background |
| `--rt-text` | Primary text |
| `--rt-muted` | Secondary text: weekends, weekday captions |
| `--rt-grid-line` | Grid lines and panel borders |
| `--rt-today-bg` | The "today" column |
| `--rt-weekend-bg` | Weekend columns |
| `--rt-bar-bg` / `--rt-bar-text` | The bar |
| `--rt-focus` | Focus ring on a bar |
| `--rt-ghost-bg` / `--rt-ghost-line` | The drag preview: where the bar will land |
| `--rt-ghost-invalid-bg` / `--rt-ghost-invalid-line` | The same preview over a forbidden target |
| `--rt-radius` | Bar corner radius |
| `--rt-pane-gap` | Gap between the row-header panel and the grid |

Light, system-dark and explicit dark are all handled, in that order of
precedence: light base → `prefers-color-scheme: dark` (unless you passed
`theme="light"`) → explicit `theme="dark"`. An app with its own theme switch can
ignore `theme` entirely and remap the tokens inside its own selector:

```css
[data-theme="dark"] .rt {
    --rt-surface: var(--app-bg);
    --rt-text: var(--app-fg);
}
```

Tokens cover colour, not layout. For borders, gaps and header height there are
public class names, and these are part of the contract — renaming one is a
breaking change:

`.rt` · `.rt__grid` · `.rt__corner` · `.rt__axis` · `.rt__axis-cell` ·
`.rt__axis-day` · `.rt__axis-weekday` · `.rt__axis-range` · `.rt__resources` ·
`.rt__resource` · `.rt__body` · `.rt__column` · `.rt__row` · `.rt__bar` ·
`.rt__background` · `.rt__overlay` · `.rt__ghost`

Plus the modifiers `--today`, `--weekend`, `--clipped-start`, `--clipped-end`,
`--last`, `--invalid` (on the ghost), `--dragging` (on the bar being dragged),
and two attributes: `data-resource` on a row, `data-item` on a bar. Anything not
in that list is internal.

## Keyboard and screen readers

Tab enters the table once. Inside it, arrows move — thirty bookings should not
mean thirty presses of Tab to get past the table.

| Key | Does |
|---|---|
| `←` `→` | Previous / next bar **in the row** (empty days are not stops) |
| `↑` `↓` | Nearest bar in time in the row above / below, since rows are not aligned |
| `Home` `End` | First / last bar of the row |
| `Enter` `Space` | Same as a click — emits `item-click` |

At the edges the arrow key is not swallowed, so the page keeps scrolling instead
of appearing to freeze. Bars are named for screen readers out of the resource
and the dates; `itemLabel` replaces that with something better. The table itself
is named by `label`.

## Printing

`Ctrl+P` would print only the virtualized rows — the ones actually in the DOM.
So printing is a method: `timeline.print()` renders the whole table, waits for
the repaint, calls the browser, and folds virtualization back afterwards.

In `@media print` the tokens are forced light (grey on dark grey prints as
nothing), the scrollbar is hidden, and rows do not break across sheets.

## Pro plugins

```ts
import { create, drag, history, links, setLicense } from "lanesjs/pro";
```

Plugins are passed through the `plugins` prop, exactly like anyone else's would
be — the core knows nothing about them:

```vue
<Timeline :plugins="plugins" ... />
```

> **The one gotcha:** `plugins` is read **once, on mount**. Changing the array
> later does nothing. To turn a plugin on or off at runtime, change the
> component's `key` so Vue remounts it:
> `<Timeline :key="editable ? 'edit' : 'read'" :plugins="plugins" />`

Rules stay in your application, not in the plugin. `canMove`, `canResize` and
`canCreate` are asked **on every move**, and a forbidden target is drawn as
forbidden while the gesture is still happening — not silently ignored on
release. Permission and result are computed by the same function, so it is
impossible to allow one thing and apply another.

A gesture with no handler never starts: dragging a bar that cannot go anywhere
is worse than not dragging it at all.

### drag — move and stretch

```ts
import { drag } from "lanesjs/pro";
import type { DragMove, DragResize } from "lanesjs/pro";

const plugins = [
    drag<Room, Booking>({
        onMove: (move: DragMove<Room, Booking>) => {
            // move.item, move.from, move.to, move.start, move.end, move.days
            save(move.item.id, { resourceId: move.to.id, start: move.start, end: move.end });
        },
        onResize: (resize: DragResize<Room, Booking>) => {
            // resize.edge is "start" or "end"; the other edge stays put
            save(resize.item.id, { start: resize.start, end: resize.end });
        },
        canMove: (move) => isFree(move),
        canResize: (resize) => isFree(resize),
    }),
];
```

| Option | Default | |
|---|---|---|
| `onMove`, `onResize` | — | Called on release, when something actually changed. Omit one to disable that gesture. |
| `canMove`, `canResize` | always allowed | Asked on every move. |
| `className` | — | Extra class on the drag preview. |
| `threshold` | `4` px | How far the pointer must travel before it counts as a gesture. |
| `longPress` | `400` ms | How long a finger must hold before a touch gesture starts. |
| `edgeSize` | `6` px | Width of the resize zone at a bar's edge (wider for touch, never more than a third of the bar). |

Moving and stretching live in one plugin because both start from the same grab:
where you grabbed — edge or middle — decides which one it is. Creating by
selection starts from empty space instead, so it is a [separate
plugin](#create--drag-across-empty-space) and the two never fight over a grab.

On touch the gesture starts on a **hold**, not on a move: the first finger
movement is taken by the browser for scrolling, so a gesture that started there
would be cancelled before it began. While the finger is still, scrolling has not
started yet and can still be declined. The consequence is deliberate: you can
still scroll the table with a finger that landed on a bar.

The offset is counted in **days**, not in new edges read off the axis — a bar
may be clipped by the range, in which case its visible start is not its start.

Keyboard equivalents, so that everything the mouse can do exists for the
keyboard too: `Shift`+arrow moves the focused bar, `Alt`+arrow drags its edge.
Both go through the same `canMove` / `canResize` — the keyboard is not a way
around your rules.

### create — drag across empty space

```ts
create<Room>({
    onCreate: ({ resource, start, end, days }) => openNewBookingForm(resource, start, end),
    canCreate: (draft) => isFree(draft),
});
```

Separate from `drag` because it starts from empty space rather than from a bar —
so you can allow creating without allowing dragging. The plugin creates nothing
itself: it reports the range and you decide whether to open a form or write
straight to the database. It takes the same `className`, `threshold` and
`longPress` options as `drag`.

### history — undo and redo, over your data

The plugin keeps the stack; it does not know how to reverse anything, because
you own the data. You push a pair of closures:

```ts
const undoRedo = history({
    limit: 50, // how many steps to keep; default 50
    keys: true, // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z
    onChange: () => {
        canUndo.value = undoRedo.canUndo();
        canRedo.value = undoRedo.canRedo();
    },
});

undoRedo.push({
    label: "move",
    undo: () => restore(previous),
    redo: () => apply(next),
});
```

The object you pass to `plugins` *is* the handle — it has `push`, `undo`,
`redo`, `clear`, `canUndo`, `canRedo` — so you never hold two references to the
same thing. Anything your app does can go on the stack, not just our gestures.
The plugin deliberately does not pull in framework reactivity, which is why
`onChange` exists: mirror the flags into your own refs to drive button states.
Turn `keys` off if your app already owns those shortcuts; two stacks on one
shortcut is guaranteed confusion.

### links — arrows between bars

```ts
links({ links: () => [{ from: "b1", to: "b2" }], color: "#888" });
```

`links` is read on every repaint, so the list can change freely. Geometry comes
from the layout contract, never from the DOM: rows are virtualized, so the bar
an arrow points at may not be in the markup at all — its position can always be
computed, but it cannot always be found.

### Licence key

```ts
import { setLicense } from "lanesjs/pro";

setLicense("LANES.…"); // before the first timeline mounts
```

The check is offline — a signature verified in the browser, with no request to
us. Nothing is disabled without a key: the plugins work, and the component says
once in the console, and in a small badge in its corner (`.rt__license`), that
it is being used unlicensed. What the key limits is the **updates window**,
compared against the build date of the package rather than the clock, so the
version you bought keeps working forever.

On plain `http` the browser withholds `crypto.subtle`, so the check cannot run —
and in that case Lanes stays silent rather than accusing someone who paid.

## Server-side rendering and Nuxt

Lanes renders on the server. There is no DOM access during setup or render:
every measurement happens after mount, so `renderToString` produces the full
table and the client takes over from there.

Because the server has no viewport to measure, SSR output contains **every** row
and **every** column — virtualization starts on the client, right after mount.
For a screen's worth of data that is exactly what you want; for three hundred
rows over a year it is a lot of HTML, and `<ClientOnly>` is the better trade.

In Nuxt, the stylesheet goes in the config and nothing else is needed:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
    css: ["lanesjs/style.css"],
});
```

```vue
<script setup lang="ts">
import { Timeline } from "lanesjs";
</script>

<template>
    <Timeline style="height: 400px" :resources="resources" :items="items" :range="range" />
</template>
```

Pro plugins are SSR-safe too: a plugin's `setup` runs on mount, so it never runs
on the server, and `setLicense()` can be called anywhere — from a Nuxt plugin,
say.

The package is ESM-only, with no CommonJS build. Vite, Nuxt, webpack 5 and
modern Jest configurations handle that; a CJS-only test runner will need its
usual ESM arrangements.

## Troubleshooting

**Nothing renders / the table is zero pixels tall.** In the default
`scroll="container"` mode the component fills its parent. Give it a height, or
use `scroll="page"`.

**The bars are missing but the rows are there.** `item.resourceId` has to match a
`resource.id` exactly; unmatched items are dropped without a warning. Check also
that the item overlaps `range` at all — `end` is exclusive, so an item ending on
the first day of the range is entirely before it.

**A one-day event does not show.** It needs `end` one day after `start`, not
equal to it.

**No column is highlighted as today.** Pass the `today` prop; the component does
not read the clock.

**Column width is ignored.** `slotWidth` is a minimum and columns stretch into
spare space. Pass `:stretch="false"` for exact widths.

**Dragging does nothing.** Three usual causes: the plugin was added to `plugins`
after mount (change the component `key`), no `onMove` / `onResize` handler was
given (a gesture with no handler never starts), or `canMove` returns false.

**On touch, nothing happens until I hold.** That is the design: the hold is what
lets the page keep its scrolling. Tune it with `longPress`.

**Printing only shows what was on screen.** Call `timeline.print()` rather than
the browser's own print.

**Styles look unstyled.** `import "lanesjs/style.css"` once, anywhere.

## Size on the wire

Measured on the published build, minified and gzipped:

| | Raw | Gzipped |
|---|---|---|
| `lanesjs` (component, axis, layout) | 24.2 kB | 7.5 kB |
| `lanesjs/style.css` | 5.6 kB | 1.5 kB |
| `lanesjs/pro` (all four plugins) | 18.0 kB | 5.5 kB |

Two entry points, not one: if you never import `lanesjs/pro`, you never bundle
it. `vue` is a peer dependency and stays external — a second copy in the bundle
would break reactivity. There are no other dependencies, and no locale files:
day and week labels come from `Intl`, so every language the browser knows is
supported and none of them weighs anything. Where a label needs to be something
else entirely, the `slot-label` slot replaces it.

## What it does

- **Virtualized rows and axis.** Three hundred resources over a year cost three
  hundred rows in the DOM, not ninety thousand cells — there is no DOM element
  per grid cell at all: the grid is a gradient, and day states are full-height
  overlays.
- **Day and week steps**, with a range label per week (`12–18 Mar`) produced by
  `Intl.DateTimeFormat.formatRange`, which knows how each language abbreviates
  that.
- **Two scroll modes**, inside a fixed height or down the page.
- **Keyboard and screen readers**, including keyboard equivalents for the paid
  gestures.
- **Printing** the whole table, not just the visible rows.
- **Device-pixel snapping**, so grid lines stay even at 125% display scaling.
- **No ceilings.** Speed is free: there is no row limit, no axis-length limit,
  and no paid tier for scale. What is paid is behaviour.

## Browser support

Any browser with ES2020, CSS custom properties and `ResizeObserver` — in
practice, everything since 2020. `Intl.DateTimeFormat.formatRange` is used where
available and falls back to two dates and a dash where it is not. Node 20+ if
you build from source.

## Licence

The core is free to use. The `lanesjs/pro` plugins are commercial, and a licence
key is one string — see [Licence key](#licence-key) above.

Read [LICENSE.md](./LICENSE.md) for the terms; the short version is that you may
build anything with the free half, including commercial products, but may not
republish it as a library of its own, and that shipping the Pro plugins to
production needs a key, priced per developer.

See [polkilof.github.io/lanesjs](https://polkilof.github.io/lanesjs/) for the
live demo. Until the store is up, keys are issued by hand — open an issue at
[github.com/Polkilof/lanesjs](https://github.com/Polkilof/lanesjs/issues).

## Status

`0.1.0` — in production in one application, API still allowed to move before
`1.0`. Decisions and their reasons are written down in [BRIEF.md](./BRIEF.md),
in Ukrainian.
