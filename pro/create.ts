/**
 * Select-to-create: drag across an empty stretch of a row and get a range back.
 * A separate plugin from dragging, because it starts from something else - from
 * empty space rather than from a bar. So the two do not fight over one grab, and
 * an application can allow creating without allowing dragging.
 *
 * The plugin creates nothing itself: it computes the range and hands it to the
 * application, which decides whether to open a form or write straight to the
 * database.
 *
 * The `pro/` folder imports from `core/` and `vue/`; never the other way round.
 */
import { clamp, dayAxis, dayUnder } from "./days";
import { guard } from "./license";
import { makeGhost, trackPointer } from "./gesture";
import type { Target } from "./gesture";
import type { IsoDate, Plugin, PluginContext, Resource } from "../core/types";

export interface DragCreate<R = unknown> {
    resource: Resource<R>;
    /** The bounds of the selection; `end` is exclusive, as everywhere in the contract. */
    start: IsoDate;
    end: IsoDate;
    /** How many days are covered. */
    days: number;
}

export interface CreateOptions<R = unknown> {
    onCreate: (created: DragCreate<R>) => void;
    /**
     * Whether such a selection is allowed. Asked on every movement, so a
     * forbidden range is visible while the gesture is still going. The classic
     * rule is not to cross what already lies in the row.
     */
    canCreate?: (created: DragCreate<R>) => boolean;
    /** A class on the ghost - so the application can style it its own way. */
    className?: string;
    /** How many pixels to travel before this counts as a gesture. */
    threshold?: number;
    /** How long to hold a finger for a touch gesture to begin; 400 ms by default. */
    longPress?: number;
    /**
     * Create a one-day event on a double click as well. Off by default, and
     * that is deliberate: an application is free to open its own form on
     * `cell-click`, and turning this on by default would give it both at once -
     * a form and an event created behind it.
     */
    doubleClick?: boolean;
}

/** Where the drag started. The row is fixed at the start and never changes. */
interface Anchor {
    /** An axis day, not a column: a selection must be able to start on a Wednesday. */
    day: number;
    resourceIndex: number;
}

export function create<R = unknown, I = unknown>(options: CreateOptions<R>): Plugin<R, I> {
    return {
        name: "create",
        setup(ctx: PluginContext<R, I>) {
            const rootEl = ctx.getRoot();
            const overlayEl = ctx.getOverlay();
            if (rootEl === null || overlayEl === null) return;

            const root: HTMLElement = rootEl;
            const overlay: HTMLElement = overlayEl;

            const ghost = makeGhost(overlay, options.className);

            /**
             * What this selection will come to. One function for the permission
             * and for the result: computing it along two paths would sooner or
             * later allow one thing and create another.
             *
             * Counted in days rather than columns: at the "week" step a column
             * covers seven days, so a selection measured in columns could only
             * ever start on a Monday, and `days` would report a number of weeks
             * disguised as a number of days.
             */
            function rangeOf(anchor: Anchor, target: Target): DragCreate<R> | null {
                const layout = ctx.getLayout();
                const resource = layout.rows[anchor.resourceIndex]?.resource;
                if (resource === undefined) return null;

                const axis = dayAxis(layout);
                const from = axis.dayOfSlot(target.slotIndex);
                const to = axis.dayOfSlot(target.slotIndex + target.slotSpan);
                if (to <= from) return null;

                return { resource, start: axis.dateAt(from), end: axis.dateAt(to), days: to - from };
            }

            const unguard = guard(root);
            const untrack = trackPointer<Anchor>(
                {
                    root,
                    threshold: options.threshold ?? 4,
                    longPress: options.longPress,

                    press(event) {
                        // Creating on top of a bar is not allowed: something is
                        // already there, and that grab belongs to dragging.
                        if ((event.target as HTMLElement).closest(".rt__bar") !== null) return null;

                        const hit = ctx.hitTest({ x: event.clientX, y: event.clientY });
                        if (hit === null) return null;

                        const axis = dayAxis(ctx.getLayout());
                        const day = dayUnder(event.clientX, overlay, ctx.getGeometry().slotWidth, axis.perSlot);

                        return { day, resourceIndex: hit.resourceIndex };
                    },

                    track(anchor, event) {
                        const hit = ctx.hitTest({ x: event.clientX, y: event.clientY });
                        if (hit === null) return null;

                        const axis = dayAxis(ctx.getLayout());
                        const day = clamp(
                            dayUnder(event.clientX, overlay, ctx.getGeometry().slotWidth, axis.perSlot),
                            0,
                            axis.length - 1,
                        );

                        // The row is taken from the start of the gesture: an
                        // event belongs to one resource, and leading a selection
                        // diagonally would mean asking what it covers then.
                        const from = Math.min(anchor.day, day);
                        const to = Math.max(anchor.day, day) + 1;

                        return {
                            slotIndex: axis.slotOf(from),
                            slotSpan: axis.slotOf(to - from),
                            resourceIndex: anchor.resourceIndex,
                        };
                    },

                    validate(anchor, target) {
                        const created = rangeOf(anchor, target);
                        return created === null ? false : (options.canCreate?.(created) ?? true);
                    },

                    commit(anchor, target) {
                        const created = rangeOf(anchor, target);
                        if (created !== null) options.onCreate(created);
                    },
                },
                ghost,
                () => ctx.getGeometry(),
            );

            /**
             * A double click makes the shortest event there is - one day.
             * Dragging cannot do that: a gesture needs movement past a
             * threshold, and without it a click is a click. So this is not a
             * shortcut for the same thing but the only way to get one day
             * without aiming.
             *
             * The day is taken from under the pointer rather than from the
             * slot: at the week step a slot is the Monday, and a double click
             * on a Thursday would have created a Monday.
             */
            function onDoubleClick(event: MouseEvent) {
                if ((event.target as HTMLElement).closest(".rt__bar") !== null) return;

                const hit = ctx.hitTest({ x: event.clientX, y: event.clientY });
                if (hit === null) return;

                const axis = dayAxis(ctx.getLayout());
                const day = clamp(
                    dayUnder(event.clientX, overlay, ctx.getGeometry().slotWidth, axis.perSlot),
                    0,
                    Math.max(0, axis.length - 1),
                );

                const created: DragCreate<R> = {
                    resource: hit.resource,
                    start: axis.dateAt(day),
                    end: axis.dateAt(day + 1),
                    days: 1,
                };
                if (!(options.canCreate?.(created) ?? true)) return;

                options.onCreate(created);
            }

            if (options.doubleClick === true) root.addEventListener("dblclick", onDoubleClick);

            return () => {
                if (options.doubleClick === true) root.removeEventListener("dblclick", onDoubleClick);
                untrack();
                unguard();
            };
        },
    };
}
