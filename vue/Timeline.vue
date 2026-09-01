<template>
    <div
        ref="rootRef"
        class="rt"
        :class="[themeClass, modeClass]"
        :style="rootStyle"
        role="group"
        :aria-label="props.label"
    >
        <!--
            The header is a band of its own above the scroller, not a row inside
            it. Then nothing travels underneath it, and in page mode it can
            stick to the window: inside a scroller that is impossible, because
            any overflow creates its own scroll context and intercepts sticky.
        -->
        <div class="rt__header" :style="headerStyle">
            <div class="rt__corner">
                <slot name="corner" />
            </div>

            <!-- The window in which the date axis travels with the grid; the corner stays put -->
            <div class="rt__axis-viewport">
                <div ref="headerTrackRef" class="rt__axis">
                    <div
                        v-for="slot in visibleSlots"
                        :key="slot.start"
                        class="rt__axis-cell"
                        :class="[
                            { 'rt__axis-cell--today': slot.isToday, 'rt__axis-cell--weekend': slot.isWeekend },
                            props.slotClass?.(slot),
                        ]"
                        :style="{ gridColumnStart: slot.index + 1 }"
                        @click="onSlotLabelClick($event, slot)"
                    >
                        <slot name="slot-label" :slot-data="slot">
                            <span v-if="props.step === 'week'" class="rt__axis-range">
                                {{ rangeLabel(slot) }}
                            </span>
                            <template v-else>
                                <span class="rt__axis-day">{{ slot.date.getDate() }}</span>
                                <span class="rt__axis-weekday">{{ weekdayLabel(slot) }}</span>
                            </template>
                        </slot>
                    </div>
                </div>
            </div>
        </div>


        <div ref="scrollerRef" class="rt__scroller" @scroll.passive="onScroll">
            <div ref="gridRef" class="rt__grid">
                <div ref="resourcesRef" class="rt__resources" :style="{ height: totalHeight + 'px' }">
                <div
                    v-for="visible in visibleRows"
                    :key="visible.row.resource.id"
                    class="rt__resource"
                    :class="{ 'rt__resource--last': visible.isLast }"
                    :style="rowStyle(visible)"
                >
                    <slot name="resource" :resource="visible.row.resource">
                        {{ visible.row.resource.title }}
                    </slot>
                </div>
            </div>

            <div ref="bodyRef" class="rt__body" :style="{ height: totalHeight + 'px' }" @click="onBodyClick">
                <!-- Full-height overlays: one element per marked column rather
                     than one per cell (decision 09). -->
                <div
                    v-for="slot in markedSlots"
                    :key="slot.start"
                    class="rt__column"
                    :class="[
                        { 'rt__column--today': slot.isToday, 'rt__column--weekend': slot.isWeekend },
                        props.slotClass?.(slot),
                    ]"
                    :style="{ left: px(slot.index), width: px(1) }"
                    aria-hidden="true"
                />

                <div
                    v-for="visible in visibleRows"
                    :key="visible.row.resource.id"
                    class="rt__row"
                    :class="{ 'rt__row--last': visible.isLast }"
                    :style="rowStyle(visible)"
                    :data-resource="visible.row.resource.id"
                    role="group"
                    :aria-label="String(visible.row.resource.title)"
                >
                    <div
                        v-for="placed in visible.row.backgrounds"
                        :key="placed.item.id"
                        class="rt__background"
                        :class="props.itemClass?.(placed, visible.row.resource)"
                        :style="[
                            { left: px(placed.slotIndex), width: px(placed.slotSpan) },
                            props.itemStyle?.(placed, visible.row.resource),
                        ]"
                        aria-hidden="true"
                    >
                        <slot name="background" :placed="placed" />
                    </div>

                    <div
                        v-for="placed in visible.row.bars"
                        :key="placed.item.id"
                        class="rt__bar"
                        :class="[
                            {
                                'rt__bar--clipped-start': placed.clippedStart,
                                'rt__bar--clipped-end': placed.clippedEnd,
                            },
                            props.itemClass?.(placed, visible.row.resource),
                        ]"
                        :style="[barStyle(placed), props.itemStyle?.(placed, visible.row.resource)]"
                        :data-item="placed.item.id"
                        role="button"
                        :tabindex="placed.item.id === entryItem ? 0 : -1"
                        :aria-label="barLabel(placed, visible.row.resource)"
                        @click.stop="onBarClick($event, placed.item, visible.row.resource)"
                        @keydown="onBarKeydown($event, placed, visible.row.resource)"
                        @focus="focusedItem = placed.item.id"
                    >
                        <slot name="item" :placed="placed" :resource="visible.row.resource">
                            {{ placed.item.id }}
                        </slot>
                        </div>
                    </div>

                    <!-- The plugin overlay layer: drag ghosts, selection
                         outlines. It does not catch the pointer, so clicks on
                         bars pass straight through it. -->
                    <div ref="overlayRef" class="rt__overlay" aria-hidden="true" />
                </div>
            </div>
        </div>

        <!--
            A scrollbar stuck to the bottom of the window: in page mode the real
            one lies at the end of the table, which you still have to scroll to.
            This is an empty scroller of the same width, synchronized with the
            grid in both directions.
        -->
        <div v-if="pageScroll" ref="scrollbarRef" class="rt__scrollbar" @scroll.passive="onScrollbarScroll">
            <div class="rt__scrollbar-track" :style="{ width: contentWidth + 'px' }" />
        </div>
    </div>
</template>

<script setup lang="ts" generic="R = unknown, I = unknown">
/**
 * The render layer. All the arithmetic lives in the core; here there is only
 * the conversion of slots into pixels and the slice of visible rows.
 *
 * Sizes arrive as numbers rather than strings: virtualization needs to know the
 * heights in order to match the scroll position to rows. Decision 06 does not
 * suffer from this - a bar's geometry still measures no DOM, and virtualization
 * reads only scrollTop and the viewport height, that is, what there is no other
 * way to learn.
 */
import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    shallowRef,
    watch,
    type ComputedRef,
} from "vue";
import { buildLayout } from "../core/layout";
import { rowAt, rowOffsets, visibleSlice } from "../core/virtual";
import type {
    DateRange,
    Geometry,
    HitTest,
    IsoDate,
    Item,
    Layout,
    PlacedItem,
    Plugin,
    Resource,
    Row,
    Slot,
    SlotStep,
    TimelineEvents,
    TimelineInstance,
} from "../core/types";

const props = withDefaults(
    defineProps<{
        resources: Resource<R>[];
        items: Item<I>[];
        range: DateRange;
        step?: SlotStep;
        /**
         * The language of the axis labels. We ship no locale files: everything
         * needed is already in `Intl`, and all we do is pass the language on.
         * Without it the browser's language is used, and for markup of your own
         * there is the `slot-label` slot.
         */
        locale?: string;
        /** The name of the table for those who cannot see it: "Team schedule". */
        label?: string;
        /**
         * The name of a bar for a screen reader. By default the resource and
         * the dates; the application almost always knows better, since its
         * `meta` holds a person and a status as well.
         */
        itemLabel?: (placed: PlacedItem<I>, resource: Resource<R>) => string | undefined;
        today?: IsoDate;
        weekendDays?: number[];
        weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
        plugins?: Plugin<R, I>[];
        /** Classes on a bar - for states known in advance. */
        itemClass?: (placed: PlacedItem<I>, resource: Resource<R>) => string | string[] | undefined;
        /**
         * Styles on a bar - for arbitrary values coming from data: when the
         * colour arrives from an API, a class cannot carry it. This is also
         * where --rt-bar-* is overridden.
         */
        itemStyle?: (placed: PlacedItem<I>, resource: Resource<R>) => Record<string, string> | undefined;
        /**
         * Classes on a column - days off, blackouts, sprint boundaries. A slot
         * with a class gets a full-height overlay on a par with "today" and
         * weekends.
         */
        slotClass?: (slot: Slot) => string | string[] | undefined;
        /**
         * Sizes in pixels; colours and the rest of the styling go through the
         * --rt-* tokens. The slot width is a minimum: if there is more room,
         * the columns stretch into it.
         */
        slotWidth?: number;
        resourceWidth?: number;
        barHeight?: number;
        barGap?: number;
        /** A floor on row height, whatever the number of lanes. */
        minRowHeight?: number;
        /** Turn stretching off when exactly the given day width is required. */
        stretch?: boolean;
        /** Scroll the axis to this date: on mount and on every change. */
        scrollTo?: IsoDate;
        /**
         * "container" - the table scrolls inside a height you set.
         * "page" - it grows to its full height, the page scrolls vertically,
         * and the header and the scrollbar stick to the window.
         */
        scroll?: "container" | "page";
        /** The height of the application's own sticky header; only for scroll: "page". */
        stickyOffset?: number;
        /** How many rows to keep beyond the viewport so scrolling does not flicker. */
        overscan?: number;
        /**
         * "auto" follows the system theme. Applications with a switch of their
         * own pass "light"/"dark", or simply override the tokens.
         */
        theme?: "auto" | "light" | "dark";
    }>(),
    {
        step: "day",
        slotWidth: 40,
        resourceWidth: 253,
        barHeight: 28,
        barGap: 4,
        minRowHeight: 0,
        stretch: true,
        overscan: 4,
        theme: "auto",
        scroll: "container",
        stickyOffset: 0,
    },
);

/**
 * Formatters are created once per language rather than per slot:
 * `Intl.DateTimeFormat` is expensive, and an axis can have a thousand slots.
 */
const weekdayFormat = computed(() => new Intl.DateTimeFormat(props.locale, { weekday: "short" }));
const dayMonthFormat = computed(() =>
    new Intl.DateTimeFormat(props.locale, { day: "numeric", month: "short" }),
);

function weekdayLabel(slot: Slot): string {
    return weekdayFormat.value.format(slot.date);
}

/**
 * A span from date to date: "12-18 Mar". `formatRange` decides by itself how to
 * shorten it in this language and when to spell out a month boundary. The types
 * do not know about it yet while browsers already can; where they cannot, two
 * dates and a dash, which is worse only to look at.
 */
function formatSpan(from: Date, to: Date): string {
    const format = dayMonthFormat.value as Intl.DateTimeFormat & {
        formatRange?: (from: Date, to: Date) => string;
    };

    return typeof format.formatRange === "function"
        ? format.formatRange(from, to)
        : `${format.format(from)} – ${format.format(to)}`;
}

/** A week is labelled with a span, not with the number of its Monday. */
function rangeLabel(slot: Slot): string {
    const last = new Date(`${slot.end}T00:00:00`);
    last.setDate(last.getDate() - 1);

    return formatSpan(slot.date, last);
}

const pageScroll = computed(() => props.scroll === "page");
const modeClass = computed(() => (pageScroll.value ? "rt--page-scroll" : "rt--container-scroll"));
/**
 * The offset for someone else's header is a multiple of a device pixel too:
 * when our header sticks, it is what decides where its bottom edge lands.
 */
const headerStyle = computed(() =>
    pageScroll.value ? { top: `${snapToDevice(props.stickyOffset, Math.ceil)}px` } : undefined,
);

/**
 * The payload carries both the event and `target` - the element a popup or a
 * menu can be anchored to. The separate field is not redundant:
 * `event.currentTarget` is nulled the moment dispatch finishes, so a stored
 * event would hand back null.
 */
const emit = defineEmits<{
    "cell-click": [payload: { date: IsoDate; resource: Resource<R>; event: MouseEvent; target: HTMLElement }];
    "item-click": [payload: { item: Item<I>; resource: Resource<R>; event: MouseEvent; target: HTMLElement }];
    "slot-click": [payload: { slot: Slot; event: MouseEvent; target: HTMLElement }];
    /** The actual range of the axis - at the week step, wider than the one in props. */
    "range-change": [range: DateRange];
}>();

const rootRef = ref<HTMLElement | null>(null);
const bodyRef = ref<HTMLElement | null>(null);
const gridRef = ref<HTMLElement | null>(null);
const overlayRef = ref<HTMLElement | null>(null);
const resourcesRef = ref<HTMLElement | null>(null);
const scrollerRef = ref<HTMLElement | null>(null);
const headerTrackRef = ref<HTMLElement | null>(null);
const scrollbarRef = ref<HTMLElement | null>(null);
/** A counter for requestUpdate() coming from plugins. */
const revision = shallowRef(0);

/**
 * Plugin subscriptions. Declared here rather than next to the rest of the
 * plugin code: the first watcher has immediate, that is, it dispatches while
 * setup is still running.
 */
const handlers = new Map<string, Set<(payload: never) => void>>();

const layout = computed<Layout<R, I>>(() => {
    void revision.value;
    return buildLayout<R, I>({
        range: props.range,
        step: props.step,
        resources: props.resources,
        items: props.items,
        today: props.today,
        weekendDays: props.weekendDays,
        weekStartsOn: props.weekStartsOn,
    });
});

/**
 * The application loads data on this event rather than on a change of
 * props.range: at the week step the axis is wider, and what has to be loaded is
 * exactly the visible window. A string key is watched, because the range object
 * is new on every recomputation.
 */
watch(
    () => `${layout.value.range.start}|${layout.value.range.end}`,
    () => {
        emit("range-change", layout.value.range);
        notify("rangeChange", layout.value.range);
    },
    { immediate: true },
);


/**
 * Only marked columns reach the DOM - the rest of the grid is drawn with a
 * gradient. A class of the application's own also makes a column marked;
 * otherwise there would be nothing to draw days off and blackouts with.
 */
function hasSlotClass(slot: Slot): boolean {
    const value = props.slotClass?.(slot);
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

const markedSlots = computed(() =>
    layout.value.slots.filter((slot) => slot.isToday || slot.isWeekend || hasSlotClass(slot)),
);

/* == Row virtualization ================================================= */

const scrollTop = ref(0);
const viewportHeight = ref(0);
/** The measured width for the resource pane together with the columns. */
const totalWidth = ref(0);

/**
 * Device pixels per CSS pixel. At 125% zoom this is 1.25, and that is exactly
 * where "whole width = crisp lines" breaks down: 31 CSS pixels are 38.75 device
 * pixels, so each following line lands a quarter of a pixel further along, and
 * every fourth one lands exactly on the boundary. Three lines blurred, the
 * fourth sharp, and the eye reads that as uneven thickness.
 */
const pixelRatio = ref(1);

/** A size that is a multiple of a device pixel: every line lands the same way. */
function snapToDevice(size: number, round: (value: number) => number): number {
    const snapped = round(Math.round(size * pixelRatio.value * 1e4) / 1e4) / pixelRatio.value;
    // Fractional division leaves a tail in the 15th digit; CSS has no use for it
    return Math.round(snapped * 1e4) / 1e4;
}

/** How much a size is short of having its edge land exactly on a device pixel. */
function deviceDrift(size: number): number {
    return snapToDevice(size, Math.ceil) - size;
}

/**
 * The given slot width is a minimum. If room is left in the container, the
 * columns stretch into it: an empty strip to the right of the grid looks like
 * an unfinished component rather than a deliberate decision.
 *
 * The width is a multiple of a device pixel rather than of a whole CSS pixel:
 * it is the former that aligns the lines, and the latter coincides with it only
 * at 100% zoom. The stretch rounds down so as to fit, the minimum rounds up so
 * as not to fall below what was asked for.
 */
const slotWidth = computed(() => {
    const count = layout.value.slots.length;
    if (!props.stretch || totalWidth.value <= 0 || count === 0) return props.slotWidth;

    return Math.max(
        snapToDevice(props.slotWidth, Math.ceil),
        snapToDevice((totalWidth.value - props.resourceWidth) / count, Math.floor),
    );
});

/**
 * The remainder of the division is taken by the resource pane: a few extra
 * pixels there go unnoticed, while uneven lines in the grid are noticed at once.
 *
 * Along with the remainder, the pane also takes the fractional offset. A day
 * width that is a multiple is not enough: it makes the lines identical to each
 * other, but identically blurred, if the grid itself starts on half a pixel -
 * and where it starts is decided by the application's layout. Shifting the pane
 * by that fraction costs less than leaving a whole month hanging between device
 * pixels.
 */
const paneWidth = computed(() => {
    const count = layout.value.slots.length;
    if (!props.stretch || totalWidth.value <= 0 || count === 0) return props.resourceWidth;

    // The remainder rounds down so as to fit; the minimum rounds up so as not
    // to fall below what was asked for. Both edges are aligned, so a fraction
    // has nowhere to come from even when the pane has hit its minimum and there
    // is nothing left to take.
    const rest = alignPane(totalWidth.value - slotWidth.value * count, Math.floor);

    return Math.max(alignPane(props.resourceWidth, Math.ceil), rest);
});

/**
 * The nearest pane width at which the grid starts exactly on a device pixel.
 * It is the pane that gets aligned: there is one of it, and thirty-one columns.
 */
function alignPane(width: number, round: (value: number) => number): number {
    const offset = Math.round((contentOrigin.value + width) * pixelRatio.value * 1e4) / 1e4;
    const aligned = width + (round(offset) - offset) / pixelRatio.value;

    return Math.round(aligned * 1e4) / 1e4;
}

const availableWidth = computed(() => Math.max(0, totalWidth.value - paneWidth.value));

/**
 * The left edge of the grid without our pane: everything the application put
 * there - page padding, a side menu, the gap between cards. The pane is aligned
 * against exactly this, and that is precisely why its own width is absent here:
 * otherwise the measurement would be chasing its own result.
 */
const contentOrigin = ref(0);

/**
 * Heights are multiples of a device pixel too - for the same reason as widths:
 * otherwise each following row's divider would land on a different fraction of
 * a pixel. Rounded up, so that bars are not pressed against the edge.
 */
const rowHeights = computed(() =>
    layout.value.rows.map((row) =>
        snapToDevice(
            Math.max(props.minRowHeight, row.laneCount * props.barHeight + (row.laneCount + 1) * props.barGap),
            Math.ceil,
        ),
    ),
);

/**
 * The horizontal window. Kept apart from the imperative shift of the header:
 * that one has to be instant and must not wait for a Vue repaint, while this is
 * the state deciding which cells exist at all.
 */
const scrollLeft = ref(0);
const viewportWidth = ref(0);

/**
 * How many header cells are really in the markup. Slots are of equal width, so
 * there is no need to count them one by one - dividing is enough. While the
 * viewport width is unknown (SSR, tests), everything is drawn: better extra DOM
 * than an empty header - the same rule that already applies to rows.
 */
const visibleSlots = computed<Slot[]>(() => {
    const slots = layout.value.slots;
    const width = slotWidth.value;
    if (viewportWidth.value <= 0 || width <= 0) return slots;

    const first = Math.max(0, Math.floor(scrollLeft.value / width) - props.overscan);
    const last = Math.min(
        slots.length,
        Math.ceil((scrollLeft.value + viewportWidth.value) / width) + props.overscan,
    );

    return slots.slice(first, last);
});

const offsets = computed(() => rowOffsets(rowHeights.value));
const totalHeight = computed(() => offsets.value[offsets.value.length - 1] ?? 0);

/**
 * The whole table goes to print, not the viewport. This is the only place where
 * virtualization is turned off: there is no scrolling on paper, so "visible
 * rows" there means all of them.
 */
const printing = ref(false);

const slice = computed(() =>
    printing.value
        ? { start: 0, end: layout.value.rows.length }
        : visibleSlice(offsets.value, scrollTop.value, viewportHeight.value, props.overscan),
);

/**
 * A signal for whoever draws in the overlay layer. Both the layout and the
 * geometry are watched: after a change of day width the picture is different
 * even though the layout is the same. flush: "post" so that a plugin draws
 * against the already updated DOM.
 */
watch([layout, slotWidth, offsets], () => notify("layout", layout.value), { flush: "post" });

interface VisibleRow {
    row: Row<R, I>;
    top: number;
    height: number;
    /** The last row draws no bottom divider - the edge of the container is there. */
    isLast: boolean;
}

const visibleRows = computed<VisibleRow[]>(() =>
    layout.value.rows.slice(slice.value.start, slice.value.end).map((row, position) => {
        const index = slice.value.start + position;
        return {
            row,
            top: offsets.value[index],
            height: rowHeights.value[index],
            isLast: index === layout.value.rows.length - 1,
        };
    }),
);

/**
 * One horizontal scroll for everyone: the header is shifted with a transform
 * rather than with a scroller of its own. Two real scrollers would have to be
 * kept in sync, and this is exactly the spot where FullCalendar keeps the most
 * code.
 */
function onScroll() {
    const scroller = scrollerRef.value;
    if (scroller === null) return;

    if (!pageScroll.value) scrollTop.value = scroller.scrollTop;

    const offset = scroller.scrollLeft;
    scrollLeft.value = offset;
    if (headerTrackRef.value !== null) {
        headerTrackRef.value.style.transform = `translateX(${-offset}px)`;
    }
    // The same clipping the header gets from its viewport: the body travels
    // under the resource pane, and a gap is left between the panes through
    // which the grid lines would otherwise show - the calendar looking as if it
    // were crawling out from under its own card.
    if (bodyRef.value !== null) {
        bodyRef.value.style.clipPath = offset > 0 ? `inset(0 0 0 ${offset}px)` : "";
    }
    if (scrollbarRef.value !== null && scrollbarRef.value.scrollLeft !== offset) {
        scrollbarRef.value.scrollLeft = offset;
    }
}

/** The stuck bar leads the grid; the guard against echo is checking the current value. */
function onScrollbarScroll() {
    const scroller = scrollerRef.value;
    const scrollbar = scrollbarRef.value;
    if (scroller === null || scrollbar === null) return;
    if (scroller.scrollLeft === scrollbar.scrollLeft) return;

    scroller.scrollLeft = scrollbar.scrollLeft;
}

/**
 * In page mode the scroll viewport is the window itself: we compute how far the
 * grid body has travelled up past the application's sticky header.
 */
function syncPageViewport() {
    const body = bodyRef.value;
    if (body === null || !pageScroll.value) return;

    const top = body.getBoundingClientRect().top;
    const visibleTop = props.stickyOffset + headerHeight.value;

    scrollTop.value = Math.max(0, visibleTop - top);
    viewportHeight.value = Math.max(0, window.innerHeight - visibleTop);
}

const headerHeight = ref(0);
/**
 * The width of the grid's content - the stuck scrollbar is fitted to it. Read
 * after relayout rather than in the same pass that sets the columns: otherwise
 * the bar would remember the width from before the fitting and would offer a
 * scroll range where there is nothing left to scroll.
 */
const contentWidth = ref(0);

/**
 * Two fractional offsets by which the vertical settles onto device pixels: the
 * first shifts the whole component, the second tops up the header's height.
 * Both are smaller than a pixel and invisible to the eye, but after them the
 * bottom edge of the header and every row divider land squarely rather than
 * between pixels.
 */
const lead = ref(0);
const headerPad = ref(0);

function syncViewport() {
    const scroller = scrollerRef.value;
    if (scroller === null) return;

    contentWidth.value = scroller.scrollWidth;
    viewportWidth.value = scroller.clientWidth;
    // Page zoom changes together with page size, so it is read right here
    pixelRatio.value = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
    measureVertical();
    totalWidth.value = measureGeometry();

    if (pageScroll.value) syncPageViewport();
    else viewportHeight.value = scroller.clientHeight;
}

/**
 * The vertical alignment offsets. Our own contribution is subtracted back out,
 * and not from our variables but from the markup: when both measurements come
 * from the DOM, they have no way to drift apart, whenever the resize observer
 * happens to wake us.
 */
function measureVertical() {
    const root = rootRef.value;
    const header = headerTrackRef.value;
    if (root === null || header === null) return;

    // The top of the component in document coordinates: scrolling converts it
    // into screen ones, and in a browser scrolling is a multiple of a device
    // pixel anyway.
    const top = root.getBoundingClientRect().top + window.scrollY;
    lead.value = deviceDrift(top);

    const applied = parseFloat(getComputedStyle(header).paddingBottom) || 0;
    const natural = header.getBoundingClientRect().height - applied;
    headerPad.value = deviceDrift(natural);
    headerHeight.value = natural + headerPad.value;
}

/**
 * How much room the resource pane and the columns get between them - and at the
 * same time where the grid starts. It cannot be computed from props: the
 * application adds a gap between the panes, borders and padding, and the grid
 * would stick out by exactly that difference. So the real edges are measured.
 *
 * There is no feedback loop: the left edge of the grid and the gap between the
 * panes do not depend on what widths we give the pane and the columns.
 */
function measureGeometry(): number {
    const root = scrollerRef.value;
    const grid = gridRef.value;
    const body = bodyRef.value;
    if (root === null) return 0;

    // jsdom and a hidden container cannot be measured - the estimate from props stands
    if (grid === null || body === null || body.offsetLeft === 0) return root.clientWidth;

    // Everything fractional rather than through offsetWidth: rounding to a
    // whole number wanders by a pixel, and a pixel here costs a whole step of
    // day width - the columns would twitch.
    const styles = getComputedStyle(body);
    const borders = (parseFloat(styles.borderLeftWidth) || 0) + (parseFloat(styles.borderRightWidth) || 0);

    // To the left of the grid lie the pane, its borders and the gap. The pane's
    // own width is subtracted back out, leaving only what belongs to someone
    // else - what the application controls. That quantity does not depend on
    // our columns, so there is no loop. The rectangles are taken from the grid
    // and the body: the pane is sticky and, on horizontal scroll, travels right
    // along with the viewport, that is, it lies about where it is.
    const bodyLeft = body.getBoundingClientRect().left;
    const chrome = bodyLeft - grid.getBoundingClientRect().left - paneWidth.value;

    // The scroll is added back: the count has to start from the unscrolled
    // state, or the columns would be recomputed on every horizontal move.
    contentOrigin.value = bodyLeft + root.scrollLeft - paneWidth.value;

    // A whole pixel of slack: clientWidth is rounded, and at fractional zoom
    // levels (125%, 150%) the right-edge border would otherwise land exactly on
    // the scroll boundary and disappear. An extra pixel of background on the
    // right goes unnoticed; a vanished border does not.
    return root.clientWidth - chrome - borders - 1;
}

/**
 * Scroll the axis to a date. By default the date ends up in the middle of the
 * visible part - exactly what "show today" needs.
 */
function scrollToDate(date: IsoDate, align: "start" | "center" = "center") {
    if (scrollerRef.value === null) return;

    const index = layout.value.slots.findIndex((slot) => slot.start <= date && date < slot.end);
    if (index < 0) return;

    const position = index * slotWidth.value;
    const left = align === "center" ? position - availableWidth.value / 2 + slotWidth.value / 2 : position;

    scrollerRef.value.scrollLeft = Math.max(0, left);
    onScroll();
}

watch(
    () => [props.scrollTo, layout.value.range.start] as const,
    async ([date]) => {
        if (date === undefined) return;
        await nextTick();
        scrollToDate(date);
    },
);

let observer: ResizeObserver | null = null;

/* == Styling ============================================================ */

const themeClass = computed(() => {
    if (props.theme === "dark") return "rt--dark";
    if (props.theme === "light") return "rt--light";
    return null;
});

const rootStyle = computed(() => ({
    "--rt-slot-width": `${slotWidth.value}px`,
    "--rt-resource-width": `${paneWidth.value}px`,
    "--rt-slot-count": String(layout.value.slots.length),
    // The internal machinery of alignment, not tokens: these values are
    // measured, and setting them from outside makes no sense - the application
    // knows neither the zoom level nor what fraction of a pixel its own page
    // started on.
    "--rt-lead": `${lead.value}px`,
    "--rt-header-pad": `${headerPad.value}px`,
}));

/** Slots -> pixels. The only place where this conversion happens. */
function px(slots: number): string {
    return `calc(var(--rt-slot-width) * ${slots})`;
}

function rowStyle(visible: VisibleRow) {
    return {
        height: `${visible.height}px`,
        transform: `translateY(${visible.top}px)`,
    };
}

function barStyle(placed: PlacedItem<I>) {
    return {
        left: px(placed.slotIndex),
        width: px(placed.slotSpan),
        height: `${props.barHeight}px`,
        top: `${(props.barHeight + props.barGap) * placed.lane + props.barGap}px`,
    };
}

function onSlotLabelClick(event: MouseEvent, slot: Slot) {
    emit("slot-click", { slot, event, target: event.currentTarget as HTMLElement });
    notify("slotClick", { slot });
}

function onBarClick(event: MouseEvent, item: Item<I>, resource: Resource<R>) {
    emit("item-click", { item, resource, event, target: event.currentTarget as HTMLElement });
    notify("itemClick", { item, resource });
}

/* == Keyboard =========================================================== */

/**
 * The bar currently holding the tab focus. Tab enters the table once and lands
 * here, and from there the arrows take over: otherwise thirty bookings would
 * mean thirty presses of Tab just to get past it.
 */
const focusedItem = ref<string | null>(null);

/** The first bar is the way in, until the user picks another. */
const entryItem = computed(() => {
    const found = focusedItem.value;
    if (found !== null && layout.value.rows.some((row) => row.bars.some((bar) => bar.item.id === found))) {
        return found;
    }
    return layout.value.rows.find((row) => row.bars.length > 0)?.bars[0]?.item.id ?? null;
});

/**
 * The name of a bar for those who cannot see it. By default the resource and
 * the dates: "Room 101, 2-5 Mar". The application almost always knows better,
 * so it can supply its own through `itemLabel`.
 */
function barLabel(placed: PlacedItem<I>, resource: Resource<R>): string {
    const custom = props.itemLabel?.(placed, resource);
    if (custom !== undefined) return custom;

    // A bar's coordinates are fractional at the week step, while what is needed
    // here is the column itself: the label reads its date.
    const slots = layout.value.slots;
    const first = slots[Math.floor(placed.slotIndex)];
    const last = slots[Math.ceil(placed.slotIndex + placed.slotSpan) - 1];
    if (first === undefined || last === undefined) return String(resource.title);

    return `${resource.title}, ${formatSpan(first.date, last.date)}`;
}

/** Where the focus is: the row, and the bar's place within it. */
function locate(id: string): { row: number; bar: number } | null {
    const rows = layout.value.rows;
    for (let row = 0; row < rows.length; row++) {
        const bar = rows[row].bars.findIndex((candidate) => candidate.item.id === id);
        if (bar !== -1) return { row, bar };
    }
    return null;
}

/**
 * Move the focus to a bar. The neighbouring row is always drawn -
 * virtualization keeps a margin beyond the viewport - so it is enough to wait
 * for the repaint and ask the browser to scroll to it.
 */
async function focusBar(id: string) {
    focusedItem.value = id;
    await nextTick();

    // Found by scanning rather than by selector: in a selector the id would
    // have to be escaped, and it may contain anything - it is foreign data.
    const bars = bodyRef.value?.querySelectorAll<HTMLElement>(".rt__bar") ?? [];
    for (const bar of bars) {
        if (bar.dataset.item !== id) continue;

        bar.focus();
        bar.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        return;
    }
}

/**
 * Arrows along a row lead from bar to bar rather than day by day: nobody wants
 * to count the empty days between bookings. Up and down look for the bar
 * nearest in time - rows are not aligned with each other, and "the same column"
 * here is empty.
 */
function step(id: string, direction: "left" | "right" | "up" | "down"): string | null {
    const at = locate(id);
    if (at === null) return null;

    const rows = layout.value.rows;

    if (direction === "left" || direction === "right") {
        const next = at.bar + (direction === "right" ? 1 : -1);
        return rows[at.row].bars[next]?.item.id ?? null;
    }

    const from = rows[at.row].bars[at.bar].slotIndex;
    const way = direction === "down" ? 1 : -1;

    for (let row = at.row + way; row >= 0 && row < rows.length; row += way) {
        const bars = rows[row].bars;
        if (bars.length === 0) continue;

        let nearest = bars[0];
        for (const bar of bars) {
            if (Math.abs(bar.slotIndex - from) < Math.abs(nearest.slotIndex - from)) nearest = bar;
        }
        return nearest.item.id;
    }

    return null;
}

function onBarKeydown(event: KeyboardEvent, placed: PlacedItem<I>, resource: Resource<R>) {
    // Arrows with modifiers are not ours: the paid layer moves a bar with them,
    // and claiming them would shift the focus instead of the booking.
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;

    const id = placed.item.id;

    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        emit("item-click", {
            item: placed.item,
            resource,
            event: new MouseEvent("click"),
            target: event.currentTarget as HTMLElement,
        });
        notify("itemClick", { item: placed.item, resource });
        return;
    }

    const moves: Record<string, "left" | "right" | "up" | "down"> = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
    };

    if (event.key === "Home" || event.key === "End") {
        const at = locate(id);
        const bars = at === null ? [] : layout.value.rows[at.row].bars;
        const target = event.key === "Home" ? bars[0] : bars[bars.length - 1];
        if (target !== undefined) {
            event.preventDefault();
            void focusBar(target.item.id);
        }
        return;
    }

    const direction = moves[event.key];
    if (direction === undefined) return;

    const next = step(id, direction);
    if (next === null) return;

    // The arrow is taken only when there really is somewhere to go: otherwise
    // at the edge of the table the page would stop scrolling, and that would
    // look like a freeze.
    event.preventDefault();
    void focusBar(next);
}

/**
 * The resource and the day under a point. The only place where geometry is read
 * backwards - from pixels into data - and that is why everyone uses it: both the
 * click on empty space and the plugins. Two implementations of the same thing
 * would drift apart at the very first alignment.
 */
function hitTest(point: { x: number; y: number }): HitTest<R> | null {
    const body = bodyRef.value;
    const slots = layout.value.slots;
    const rows = layout.value.rows;
    if (body === null || slots.length === 0 || rows.length === 0) return null;

    // The resource pane is sticky and sits on top of the grid: what is under it
    // the user does not see, so that is not a hit either.
    const pane = resourcesRef.value?.getBoundingClientRect();
    if (pane !== undefined && point.x < pane.right) return null;

    const rect = body.getBoundingClientRect();
    const x = point.x - rect.left;
    const y = point.y - rect.top;
    if (x < 0 || y < 0 || x >= slotWidth.value * slots.length || y >= totalHeight.value) return null;

    const resourceIndex = rowAt(offsets.value, y);
    const slot = slots[Math.floor(x / slotWidth.value)];

    return { resource: rows[resourceIndex].resource, resourceIndex, slot, date: slot.start };
}

/** A click on empty space. */
function onBodyClick(event: MouseEvent) {
    const rowEl = (event.target as HTMLElement).closest<HTMLElement>(".rt__row");
    if (rowEl === null) return;

    const hit = hitTest({ x: event.clientX, y: event.clientY });
    if (hit === null) return;

    emit("cell-click", { date: hit.date, resource: hit.resource, event, target: rowEl });
    notify("cellClick", { date: hit.date, resource: hit.resource });
}

/* == Plugins (decision 01) ============================================== */

/**
 * The subscription store. The typing is held by the `on` signature in the
 * contract; inside, the types are erased, or a mapped type would not let a Set
 * into the cell.
 */
type ErasedHandler = (payload: never) => void;

const teardowns: Array<() => void> = [];

/**
 * Dispatch an event to the plugins. The source is the same as for the Vue
 * events: they cannot drift apart, because they are called side by side.
 * Subscriptions used to be collected and delivered nowhere - nobody noticed,
 * because gestures listen to the DOM and history to the keyboard.
 */
function notify<K extends keyof TimelineEvents<R, I>>(event: K, payload: Parameters<TimelineEvents<R, I>[K]>[0]) {
    const bucket = handlers.get(event);
    if (bucket === undefined) return;

    for (const handler of bucket) (handler as (value: unknown) => void)(payload);
}

function subscribe(event: string, handler: ErasedHandler): () => void {
    const bucket = handlers.get(event) ?? new Set<ErasedHandler>();
    handlers.set(event, bucket);
    bucket.add(handler);

    return () => {
        bucket.delete(handler);
    };
}

onMounted(() => {
    syncViewport();

    if (pageScroll.value) {
        window.addEventListener("scroll", syncPageViewport, { passive: true });
        window.addEventListener("resize", syncViewport, { passive: true });
    }

    if (props.scrollTo !== undefined) {
        nextTick(() => scrollToDate(props.scrollTo as IsoDate));
    }

    if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(syncViewport);
        // The scroller says how much room there is; the grid, how much is
        // taken. The second observation is required, because we set the column
        // width ourselves: in the pass that changes it the content is still the
        // old one, and the real width is known only at the next layout. There
        // is no loop - the measurement rests on the gap and the borders, and
        // those do not depend on our columns.
        if (scrollerRef.value !== null) observer.observe(scrollerRef.value);
        if (gridRef.value !== null) observer.observe(gridRef.value);
    }

    for (const plugin of props.plugins ?? []) {
        const teardown = plugin.setup({
            getLayout: () => layout.value,
            getRoot: () => rootRef.value,
            getOverlay: () => overlayRef.value,
            getGeometry: (): Geometry => ({
                slotWidth: slotWidth.value,
                rowOffsets: offsets.value,
                barHeight: props.barHeight,
                barGap: props.barGap,
            }),
            hitTest,
            on: (event, handler) => subscribe(event, handler as ErasedHandler),
            requestUpdate: () => {
                revision.value += 1;
            },
        });
        if (typeof teardown === "function") teardowns.push(teardown);
    }

    // The first signal right after the subscriptions: otherwise a plugin that
    // draws would wait for the first data change to draw what is already on the
    // screen.
    if (props.plugins !== undefined && props.plugins.length > 0) notify("layout", layout.value);
});

onBeforeUnmount(() => {
    window.removeEventListener("scroll", syncPageViewport);
    window.removeEventListener("resize", syncViewport);

    observer?.disconnect();
    observer = null;

    for (const teardown of teardowns) teardown();
    teardowns.length = 0;
});

/**
 * Print the whole table. Ctrl+P prints only what is on the screen, and that is
 * not an oversight: the markup really does hold the visible rows alone. So
 * printing is three steps, and the first two are the component's to take: draw
 * everything, wait for the repaint, and only then call the browser.
 */
async function print() {
    printing.value = true;
    await nextTick();

    try {
        window.print();
    } finally {
        printing.value = false;
    }
}

/**
 * `satisfies` rather than an annotation: otherwise inference would disappear
 * for anyone taking a ref without our `TimelineInstance`. The unwrapped
 * `layout` in the contract and the `ComputedRef` here are the same field: refs
 * are unwrapped by the proxy Vue builds.
 */
defineExpose(
    { layout, syncViewport, scrollToDate, print } satisfies {
        layout: ComputedRef<Layout<R, I>>;
    } & Omit<TimelineInstance<R, I>, "layout">,
);
</script>

<style>
/**
 * The public tokens (decision 02). Declared through :where() so that any
 * override from outside wins without !important and without a specificity race.
 *
 * Three levels, and the order of the rules here is the priority (all of them
 * carry zero weight):
 *   1. the light palette - the base;
 *   2. system dark - only if the application did not insist on light;
 *   3. an explicit theme="dark" - overrides even a light system.
 * An application with a switch of its own (like [data-bs-theme] in Bootstrap)
 * may leave theme alone entirely and simply redefine the tokens in its own
 * block.
 */
:where(.rt) {
    /* The line on the right edge of a slot rather than the left: otherwise the
       first would coincide with the container's border and read as a double
       one. One declaration for the header and the grid, so they cannot drift
       apart. */
    --rt-grid-lines: repeating-linear-gradient(
        to right,
        transparent 0,
        transparent calc(var(--rt-slot-width) - 1px),
        var(--rt-grid-line) calc(var(--rt-slot-width) - 1px),
        var(--rt-grid-line) var(--rt-slot-width)
    );
    /* The gap between the resource pane and the grid; the header and the body take it together. */
    --rt-pane-gap: 0px;
    --rt-radius: 4px;
    --rt-surface: #ffffff;
    --rt-header-bg: #ffffff;
    --rt-text: #1d1127;
    --rt-muted: #6b7280;
    --rt-grid-line: #e5e7eb;
    --rt-today-bg: rgba(79, 45, 197, 0.08);
    --rt-weekend-bg: rgba(107, 114, 128, 0.06);
    --rt-bar-bg: #4f2dc5;
    --rt-bar-text: #ffffff;
    /* The focus ring: it has to be visible both on a bar and against the grid. */
    --rt-focus: #1d4ed8;
    /* How wide the edge of a bar is. The drag plugin overwrites this with the
       number it actually measures by, so the handle covers the zone that
       responds and not a pixel more. */
    --rt-edge-size: 6px;
    /* The gesture ghost: where the bar will land if released here. A dashed
       outline and a transparent fill, so the days it covers stay visible
       underneath. */
    --rt-ghost-bg: rgba(29, 17, 39, 0.07);
    --rt-ghost-line: rgba(29, 17, 39, 0.4);
    --rt-ghost-invalid-bg: rgba(214, 69, 69, 0.12);
    --rt-ghost-invalid-line: #d64545;
}

@media (prefers-color-scheme: dark) {
    :where(.rt:not(.rt--light)) {
        --rt-surface: #161f25;
        --rt-header-bg: #1b252c;
        --rt-text: #e4ecef;
        --rt-muted: #8ea0aa;
        --rt-grid-line: rgba(255, 255, 255, 0.12);
        --rt-today-bg: rgba(141, 112, 255, 0.16);
        --rt-weekend-bg: rgba(255, 255, 255, 0.05);
        --rt-bar-bg: #7c5cf0;
        --rt-bar-text: #ffffff;
        --rt-focus: #a8c7ff;
        --rt-ghost-bg: rgba(255, 255, 255, 0.1);
        --rt-ghost-line: rgba(255, 255, 255, 0.45);
        --rt-ghost-invalid-bg: rgba(255, 107, 107, 0.18);
        --rt-ghost-invalid-line: #ff8a8a;
    }
}

:where(.rt--dark) {
    --rt-surface: #161f25;
    --rt-header-bg: #1b252c;
    --rt-text: #e4ecef;
    --rt-muted: #8ea0aa;
    --rt-grid-line: rgba(255, 255, 255, 0.12);
    --rt-today-bg: rgba(141, 112, 255, 0.16);
    --rt-weekend-bg: rgba(255, 255, 255, 0.05);
    --rt-bar-bg: #7c5cf0;
    --rt-bar-text: #ffffff;
    --rt-focus: #a8c7ff;
    --rt-ghost-bg: rgba(255, 255, 255, 0.1);
    --rt-ghost-line: rgba(255, 255, 255, 0.45);
    --rt-ghost-invalid-bg: rgba(255, 107, 107, 0.18);
    --rt-ghost-invalid-line: #ff8a8a;
}

.rt {
    position: relative;
    display: flex;
    flex-direction: column;
    /* The fraction of a pixel by which the component settles onto the device grid */
    padding-top: var(--rt-lead, 0px);
    background: var(--rt-surface);
    color: var(--rt-text);
}

/* The consumer sets the height; scrolling lives inside */
.rt--container-scroll {
    overflow: hidden;
}

/**
 * The header stands above the scroller rather than inside it. That is the only
 * way to let it stick to the window: any overflow creates its own scroll
 * context, and sticky inside it latches onto the container rather than the page.
 *
 * Horizontally the date axis is led by a transform, not by a second scroller:
 * two real scrollers would have to be synchronized with events, and that is
 * exactly where components like this pick up the most code and the most jitter.
 */
.rt__header {
    position: relative;
    z-index: 2;
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: var(--rt-resource-width) minmax(0, 1fr);
    column-gap: var(--rt-pane-gap);
}

.rt--page-scroll .rt__header {
    position: sticky;
}

.rt__axis-viewport {
    overflow: hidden;
}

.rt__scroller {
    flex: 1 1 auto;
    min-height: 0;
    overflow-x: auto;
}

.rt--container-scroll .rt__scroller {
    overflow-y: auto;
}

/**
 * In page mode the scroller's real bar lies at the end of the table: scroll all
 * the way down and you see two in a row - it and the stuck one. The real one is
 * hidden; scrolling by wheel, trackpad and keyboard does not go away, and only
 * one bar remains visible.
 */
.rt--page-scroll .rt__scroller {
    scrollbar-width: none;
}

.rt--page-scroll .rt__scroller::-webkit-scrollbar {
    display: none;
}

/**
 * A scrollbar stuck to the bottom of the window: in page mode the real one lies
 * at the end of the table, that is off-screen until you scroll right down.
 */
.rt__scrollbar {
    position: sticky;
    bottom: 0;
    z-index: 3;
    flex: 0 0 auto;
    overflow-x: auto;
    overflow-y: hidden;
}

.rt__scrollbar-track {
    height: 1px;
}

.rt__grid {
    display: grid;
    grid-template-columns: var(--rt-resource-width) max-content;
    column-gap: var(--rt-pane-gap);
    width: max-content;
    min-width: 100%;
    /* A pixel at the tail of the content: scrolled to the end, the right-edge
       border would otherwise land exactly on the scroller's clipping boundary
       and the browser simply would not draw it. This eats no width - the
       measurement leaves slack of exactly this one pixel. */
    padding-right: 1px;
}

.rt__corner,
.rt__axis {
    background-color: var(--rt-header-bg);
    border-bottom: 1px solid var(--rt-grid-line);
}

.rt__corner {
    border-right: 1px solid var(--rt-grid-line);
}

/**
 * The header's dividers are the same gradient as the grid's, not cell borders.
 * The browser rounds grid columns to 1/64 of a pixel, the error accumulates
 * along a month, and a cell border drifted away from the grid line by a visible
 * pixel. A shared gradient cannot drift by construction.
 */
.rt__axis {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: var(--rt-slot-width);
    /* The width is computed rather than measured from content: the markup holds
       only the visible cells, and max-content would shrink the axis to them.
       Every cell knows its own column, so the empty places hold themselves. */
    width: calc(var(--rt-slot-width) * var(--rt-slot-count));
    /* The same as in the grid and the resource pane: the width given is exactly
       the columns, and the application's border is added outside. Without this,
       under someone else's reset (Bootstrap hands border-box to absolutely
       everything) the header's borders eat two of its own pixels, and the axis
       becomes narrower than the grid beneath it. While the width was measured
       from content the question did not arise: it came with the computed
       width. */
    box-sizing: content-box;
    /* Topping the height up to a whole device pixel: otherwise the header's
       bottom edge is split between two rows of pixels and, on a light line,
       simply disappears. */
    padding-bottom: var(--rt-header-pad, 0px);
    background-image: var(--rt-grid-lines);
    background-size: calc(100% - 2px) 100%;
    background-repeat: no-repeat;
    will-change: transform;
}

.rt__axis-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 6px 2px;
    font-size: 12px;
    line-height: 1.2;
    text-align: center;
    white-space: nowrap;
    cursor: default;
}

.rt__axis-weekday {
    color: var(--rt-muted);
    font-size: 11px;
}

.rt__axis-cell--today {
    background: var(--rt-today-bg);
    font-weight: 700;
}

/* "Today" stands out by its number; the weekday under it stays secondary. */
.rt__axis-cell--today .rt__axis-weekday {
    font-weight: 400;
}

.rt__axis-cell--weekend {
    color: var(--rt-muted);
}

/**
 * Both columns are positioned containers of equal height, and the rows inside
 * them are absolute with the same offset. That is why the resource pane and the
 * grid cannot fall out of sync: they render one and the same slice.
 */
.rt__resources {
    position: sticky;
    left: 0;
    z-index: 1;
    /* As in the grid: the height given is the rows, and the application's
       border is added outside. Otherwise the panes end at different heights. */
    box-sizing: content-box;
    background: var(--rt-surface);
    border-right: 1px solid var(--rt-grid-line);
}

.rt__resource {
    position: absolute;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    box-sizing: border-box;
    padding: 0 12px;
    overflow: hidden;
    border-bottom: 1px solid var(--rt-grid-line);
}

/**
 * The vertical grid lines are a gradient, not DOM per cell (decision 09):
 * 300 resources over a month cost 300 rows rather than 9300 cells.
 */
.rt__body {
    position: relative;
    /* The width is exactly the columns: the application's border has to be
       added outside, or the grid becomes narrower than the header by the
       thickness of the borders. */
    box-sizing: content-box;
    width: calc(var(--rt-slot-width) * var(--rt-slot-count));
    /* The grid paints its own background, as the resource pane and the header
       do. Relying on the root's background will not do: an application that
       splits the panes into two cards makes the root transparent - and then the
       grid would be left as the one hole. */
    background-color: var(--rt-surface);
    /* The last line is not drawn - the right edge is covered by a border, like the left. */
    background-image: var(--rt-grid-lines);
    background-size: calc(100% - 2px) 100%;
    background-repeat: no-repeat;
}

.rt__column {
    position: absolute;
    top: 0;
    bottom: 0;
    pointer-events: none;
}

/**
 * The plugin overlays. Above the rows and the bars - a ghost has to lie on top
 * of what is being dragged - and completely transparent to the pointer, or the
 * very first ghost would cover the event it is being drawn for.
 */
.rt__overlay {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
}

.rt__column--weekend {
    background: var(--rt-weekend-bg);
}

.rt__column--today {
    background: var(--rt-today-bg);
}

.rt__row {
    position: absolute;
    left: 0;
    right: 0;
    box-sizing: border-box;
    border-bottom: 1px solid var(--rt-grid-line);
}

/**
 * The last row is marked with a class, but the border stays: whether to remove
 * it is the application's decision - where it has a border of its own the line
 * would double, and where there is none (a pane resting on a shadow alone) that
 * line is the bottom edge of the card.
 */

.rt__background {
    position: absolute;
    top: 0;
    bottom: 0;
    pointer-events: none;
}

.rt__bar {
    position: absolute;
    display: flex;
    align-items: center;
    box-sizing: border-box;
    padding: 0 6px;
    overflow: hidden;
    font-size: 12px;
    white-space: nowrap;
    background: var(--rt-bar-bg);
    color: var(--rt-bar-text);
    border-radius: var(--rt-radius);
    cursor: pointer;
}

/**
 * What tells the user a bar can be taken at all. Nothing here knows about the
 * paid layer: the drag plugin writes `data-gestures` on the root, and these
 * rules only react to it. With no plugin the attribute never appears and a bar
 * stays exactly as it was.
 *
 * The handles are drawn by the component rather than by the plugin, for the
 * same reason the ghost is: appearance kept in a plugin can only be inline, and
 * inline beats every selector an application could write.
 */
.rt[data-gestures~="move"] .rt__bar {
    cursor: grab;
}

.rt[data-gestures~="resize"] .rt__bar::before,
.rt[data-gestures~="resize"] .rt__bar::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    /* Never wider than a third, exactly as the plugin clamps its own zone. */
    width: min(var(--rt-edge-size), 33.3333%);
    cursor: ew-resize;
    /* currentColor, not a colour of its own: an application repaints a bar
       through --rt-bar-bg and --rt-bar-text, and the handle has to stay
       readable on whatever it repainted it to. */
    background: linear-gradient(currentColor, currentColor) center / 2px 55% no-repeat;
    opacity: 0;
    transition: opacity 120ms ease-out;
}

.rt[data-gestures~="resize"] .rt__bar::before {
    left: 0;
}

.rt[data-gestures~="resize"] .rt__bar::after {
    right: 0;
}

.rt[data-gestures~="resize"] .rt__bar:hover::before,
.rt[data-gestures~="resize"] .rt__bar:hover::after,
.rt[data-gestures~="resize"] .rt__bar:focus-visible::before,
.rt[data-gestures~="resize"] .rt__bar:focus-visible::after {
    opacity: 0.55;
}

/**
 * A finger has no hover, so there is nothing to reveal the handles - and the
 * edge zone is wider there than under a mouse, that is, there is more invisible
 * surface behaving specially. So on touch they are simply always visible.
 */
@media (hover: none) {
    .rt[data-gestures~="resize"] .rt__bar::before,
    .rt[data-gestures~="resize"] .rt__bar::after {
        width: min(max(var(--rt-edge-size), 12px), 33.3333%);
        opacity: 0.55;
    }
}

@media (prefers-reduced-motion: reduce) {
    .rt[data-gestures~="resize"] .rt__bar::before,
    .rt[data-gestures~="resize"] .rt__bar::after {
        transition: none;
    }
}

/**
 * The ring outside the bar rather than inside: a bar is narrow, and a border on
 * the inner edge would eat the label. `outline` takes no space, so the
 * neighbours do not move.
 */
.rt__bar:focus-visible {
    outline: 2px solid var(--rt-focus);
    outline-offset: 2px;
    z-index: 3;
}

/**
 * The ghost is drawn by a plugin but dressed by the component - and only
 * through :where, so that any rule of the application's weighs more. Keeping
 * this appearance in the plugin would mean keeping it inline, and inline cannot
 * be beaten by anything but !important: the application would be left without a
 * say on the one thing visible during a gesture.
 */
:where(.rt__ghost) {
    box-sizing: border-box;
    background: var(--rt-ghost-bg);
    border: 1px dashed var(--rt-ghost-line);
    border-radius: var(--rt-radius);
}

:where(.rt__ghost--invalid) {
    background: var(--rt-ghost-invalid-bg);
    border-color: var(--rt-ghost-invalid-line);
}

/**
 * The bar being dragged dims: during a gesture what matters is where it will
 * land, not where it came from. Hiding it entirely is out of the question -
 * comparing "from" and "to" is exactly what shows how far it moved.
 */
:where(.rt__bar--dragging) {
    opacity: 0.4;
}

/**
 * On paper there is neither a theme nor scrolling. The light tokens here are
 * not mercy towards the toner: grey on dark grey disappears entirely in print.
 * The selectors carry the same weight as the on-screen ones, so an application
 * overrides them without `!important` just the same - simply in a `@media
 * print` block of its own.
 */
@media print {
    .rt {
        --rt-surface: #ffffff;
        --rt-header-bg: #ffffff;
        --rt-text: #000000;
        --rt-muted: #444444;
        --rt-grid-line: #999999;
        --rt-today-bg: transparent;
        --rt-weekend-bg: #f0f0f0;
    }

    /* A scrollbar on a sheet of paper is just a grey line out of nowhere. */
    .rt .rt__scrollbar {
        display: none;
    }

    /* Nothing is dragged on paper, and the handles would print as stray ticks. */
    .rt .rt__bar::before,
    .rt .rt__bar::after {
        display: none;
    }

    .rt .rt__scroller,
    .rt .rt__axis-viewport {
        overflow: visible;
    }

    .rt .rt__row {
        break-inside: avoid;
    }

    /* Otherwise the browser prints the bars grey and the schedule becomes unreadable. */
    .rt .rt__bar,
    .rt .rt__background {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
}

/** A clipped edge is square, so it is visible that the event continues. */
.rt__bar--clipped-start {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
}

.rt__bar--clipped-end {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
}
</style>
