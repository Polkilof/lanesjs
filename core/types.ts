/**
 * The public contract of Lanes. This file is an RFC on the API: everything
 * exported here is seen by an outside developer, so a change here costs more
 * than a change anywhere else in the folder.
 *
 * Zero imports - no "@/" alias, no FullCalendar, no Vue.
 */

/**
 * A "wall" date in YYYY-MM-DD form, with no time zone (decision 05).
 * The zone is the formatter's business in the vue layer; the core knows
 * nothing about it.
 */
export type IsoDate = string;

/** A range of dates. `end` is exclusive, as in FullCalendar (decision 03). */
export interface DateRange {
    start: IsoDate;
    end: IsoDate;
}

/** The step of the time axis. Hours and finer steps are the paid layer. */
export type SlotStep = "day" | "week";

/**
 * A row of the timeline. Everything application-specific - an avatar, a job
 * title, a leaving date - lives in `meta` and is rendered by a slot; the core
 * never looks inside `meta`.
 */
export interface Resource<M = unknown> {
    id: string;
    title: string;
    meta?: M;
}

/**
 * `bar` - an ordinary event, takes a lane in its row.
 * `background` - a backdrop under the grid, taking no part in lane packing:
 * periods when the resource is unavailable at all, days off, working hours.
 */
export type ItemDisplay = "bar" | "background";

/** An event on the timeline. Colour, icon, status go in `meta`, not the core. */
export interface Item<M = unknown> {
    id: string;
    resourceId: string;
    start: IsoDate;
    /** Exclusive: a one-day event is start=01, end=02. */
    end: IsoDate;
    /** Defaults to "bar". */
    display?: ItemDisplay;
    meta?: M;
}

/** One column of the axis. */
export interface Slot {
    index: number;
    start: IsoDate;
    /** Exclusive. */
    end: IsoDate;
    /** Local midnight of the slot's start - only for formatters in the vue layer. */
    date: Date;
    isToday: boolean;
    isWeekend: boolean;
}

/**
 * An event placed on the grid. Coordinates are in slots, not pixels
 * (decision 06).
 *
 * At the "week" step they are fractional: an event lasts days while a column is
 * a week, so a three-day booking takes 3/7 of a column and starts where it
 * actually starts. These are not indices into `slots`: whoever needs the column
 * takes Math.floor.
 */
export interface PlacedItem<M = unknown> {
    item: Item<M>;
    /** Where the event begins within the visible window, in slot units. */
    slotIndex: number;
    /** How many slots it takes in the visible window; always greater than zero. */
    slotSpan: number;
    /** The lane inside the row: 0 when nothing overlaps. */
    lane: number;
    /** The event starts before / ends after the visible range. */
    clippedStart: boolean;
    clippedEnd: boolean;
}

/** A row of the layout result. */
export interface Row<R = unknown, I = unknown> {
    resource: Resource<R>;
    bars: PlacedItem<I>[];
    /** Backdrops: no lanes, drawn under the grid. */
    backgrounds: PlacedItem<I>[];
    /** How many lanes the row takes; at least 1. Row height = f(laneCount). */
    laneCount: number;
}

/** The full layout result - everything the vue layer needs in order to render. */
export interface Layout<R = unknown, I = unknown> {
    range: DateRange;
    step: SlotStep;
    slots: Slot[];
    rows: Row<R, I>[];
}

/**
 * The layout input. The component is controlled (decision 04): the order of
 * `resources` is the order of the rows, and the core neither sorts nor filters.
 */
export interface LayoutInput<R = unknown, I = unknown> {
    range: DateRange;
    step: SlotStep;
    resources: Resource<R>[];
    items: Item<I>[];
    /** What counts as "today". Passed explicitly to keep tests deterministic. */
    today?: IsoDate;
    /** Which weekdays are weekend days, 0 is Sunday. Defaults to [0, 6]. */
    weekendDays?: number[];
    /** Which day a week starts on at step: "week". Defaults to 1 (Monday). */
    weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

/** Timeline events. Both the application and the plugins subscribe to these. */
export interface TimelineEvents<R = unknown, I = unknown> {
    /**
     * The picture changed: the layout or the geometry was recomputed. A signal
     * for whoever draws in the overlay layer - time to repaint.
     */
    layout: (layout: Layout<R, I>) => void;
    /** A click on an empty cell. */
    cellClick: (payload: { date: IsoDate; resource: Resource<R> }) => void;
    /** A click on an event. */
    itemClick: (payload: { item: Item<I>; resource: Resource<R> }) => void;
    /** A click on a column label. */
    slotClick: (payload: { slot: Slot }) => void;
    /** The visible range changed - the application loads data. */
    rangeChange: (range: DateRange) => void;
}

/**
 * The geometry of the grid, in pixels. A plugin has no business measuring it
 * itself: the width of a day and the heights of the rows are the result of
 * alignment to device pixels, and measuring again would give numbers other than
 * the ones the component draws by.
 */
export interface Geometry {
    slotWidth: number;
    /** The top of each row from the start of the body; one element longer. */
    rowOffsets: number[];
    /**
     * The height of a bar and the gap between lanes. Without them there is no
     * working out where a bar sits inside a row, and everyone who draws along
     * bars needs that.
     */
    barHeight: number;
    barGap: number;
}

/** What lies under a point. Empty places are hits too - events are created there. */
export interface HitTest<R = unknown> {
    resource: Resource<R>;
    resourceIndex: number;
    slot: Slot;
    date: IsoDate;
}

/**
 * What a plugin is handed at startup. A minimal surface: read the layout,
 * listen to events, ask for a recomputation.
 */
export interface PluginContext<R = unknown, I = unknown> {
    getLayout(): Layout<R, I>;
    /** The root element; always null in the core, filled in by the vue layer. */
    getRoot(): HTMLElement | null;
    /**
     * The layer for a plugin's own overlays - drag ghosts, selection outlines.
     * It sits in grid coordinates and does not catch the pointer, so a plugin
     * can draw in it without getting in the way of clicks on bars.
     */
    getOverlay(): HTMLElement | null;
    getGeometry(): Geometry;
    /**
     * The resource and the day under a point in viewport coordinates - the same
     * ones a pointer event gives. Outside the grid, null.
     */
    hitTest(point: { x: number; y: number }): HitTest<R> | null;
    /** Subscribe; returns the unsubscribe function. */
    on<K extends keyof TimelineEvents<R, I>>(
        event: K,
        handler: TimelineEvents<R, I>[K],
    ): () => void;
    /** Ask for the layout to be recomputed. */
    requestUpdate(): void;
}

/**
 * The extension point (decision 01). The paid layer is a set of plugins:
 * dragging, virtualization, zoom. The core knows nothing about them.
 */
export interface Plugin<R = unknown, I = unknown> {
    name: string;
    /** The returned function is called when the timeline is destroyed. */
    setup(ctx: PluginContext<R, I>): void | (() => void);
}

/**
 * What the application gets through a `ref` on the component.
 *
 * Declared here rather than derived from the component, because a consumer
 * cannot derive it: `Timeline` is a generic SFC, that is a function rather than
 * a constructor, and the usual `InstanceType<typeof Timeline>` does not compile
 * on it at all. Without a named type the only options left would be pulling in
 * `vue-component-type-helpers` or rewriting this shape locally - both worse
 * than a single export.
 *
 * `layout` here is the layout already unwrapped, not a `ComputedRef`: refs are
 * unwrapped by the proxy Vue builds from `defineExpose`.
 */
export interface TimelineInstance<R = unknown, I = unknown> {
    layout: Layout<R, I>;
    /** Measure the viewport again - after resizing the container yourself. */
    syncViewport(): void;
    scrollToDate(date: IsoDate, align?: "start" | "center"): void;
    /** Draw the whole table, print it, and put virtualization back. */
    print(): Promise<void>;
}
