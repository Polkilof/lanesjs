/**
 * Dragging bars and stretching their edges - paid behaviour on free hooks. The
 * plugin mutates nothing: it computes what changed and hands that to the
 * application. The data stays where it was - the component is controlled, and a
 * plugin has no right to keep a store of its own (decision 04).
 *
 * Both gestures live in one plugin, because both start from the same grab on a
 * bar: what has begun is decided by the place - an edge or the middle.
 * Select-to-create, by contrast, starts from empty space, so it lives apart.
 *
 * The `pro/` folder imports from `core/` and `vue/`; never the other way round.
 */
import { clamp, dayAxis, dayUnder } from "./days";
import { guard } from "./license";
import { makeGhost, trackPointer } from "./gesture";
import type { Target } from "./gesture";
import type { IsoDate, Item, PlacedItem, Plugin, PluginContext, Resource } from "../core/types";

export type DragEdge = "start" | "end";

/** The width of the edge zone for a finger; a mouse does with a far narrower one. */
const TOUCH_EDGE = 12;

export interface DragMove<R = unknown, I = unknown> {
    item: Item<I>;
    /** The resource it was taken from, and the one it was put into. */
    from: Resource<R>;
    to: Resource<R>;
    /** The item's new bounds; `end` is exclusive, as everywhere in the contract. */
    start: IsoDate;
    end: IsoDate;
    /** The shift in days; negative means to the left. */
    days: number;
}

export interface DragResize<R = unknown, I = unknown> {
    item: Item<I>;
    resource: Resource<R>;
    /** Which edge was dragged; the opposite one stays put. */
    edge: DragEdge;
    start: IsoDate;
    end: IsoDate;
}

export interface DragOptions<R = unknown, I = unknown> {
    /**
     * Called on release, if something really changed. Accepting or refusing is
     * the application's business: it owns the data, we only do the arithmetic.
     * A gesture with no handler does not start at all: otherwise the user would
     * drag a bar that will go nowhere.
     */
    onMove?: (move: DragMove<R, I>) => void;
    onResize?: (resize: DragResize<R, I>) => void;
    /**
     * Whether such a target is allowed. Asked on every movement, so a forbidden
     * place is visible while the gesture is still going - and releasing on it
     * does nothing. The application knows the rules: overlapping someone else's
     * event, the wrong row, the past.
     */
    canMove?: (move: DragMove<R, I>) => boolean;
    canResize?: (resize: DragResize<R, I>) => boolean;
    /**
     * Whether this item may be taken at all. Asked before the gesture starts,
     * so an item nobody may drag behaves like the grid around it: no ghost, no
     * dimmed bar, nothing to release. `canMove` and `canResize` answer a
     * different question - whether *this target* is allowed - and answering
     * "never" with them still drags a crossed-out ghost after the pointer,
     * which reads as "not here" rather than "not this one".
     *
     * Items a timeline only displays are the usual reason: a birthday, an
     * anniversary, someone else's row. The cursor over them stays the
     * application's business - it draws bars through `item-class` and knows
     * which ones it refuses.
     */
    canDrag?: (item: Item<I>, resource: Resource<R>) => boolean;
    /** A class on the ghost - so the application can style it its own way. */
    className?: string;
    /** How many pixels to travel before this counts as a gesture. */
    threshold?: number;
    /** How long to hold a finger for a touch gesture to begin; 400 ms by default. */
    longPress?: number;
    /** The width of the edge grab zone. */
    edgeSize?: number;
}

interface Grab<R, I> {
    placed: PlacedItem<I>;
    resource: Resource<R>;
    resourceIndex: number;
    /** The edge, if an edge is being dragged; null means the whole bar moves. */
    edge: DragEdge | null;
    /**
     * The item's bounds in axis days; the end is exclusive. A negative start
     * means a bar clipped by the left edge of the range - and that is exactly
     * why they are kept here rather than derived from the visible rectangle:
     * what is clipped does not fit into it.
     */
    startDay: number;
    endDay: number;
    /** The axis day the bar was grabbed by. */
    grabDay: number;
}

export function drag<R = unknown, I = unknown>(options: DragOptions<R, I> = {}): Plugin<R, I> {
    return {
        name: "drag",
        setup(ctx: PluginContext<R, I>) {
            const rootEl = ctx.getRoot();
            const overlayEl = ctx.getOverlay();
            if (rootEl === null || overlayEl === null) return;

            // Separate names after the check: narrowing does not survive
            // function declarations - they are hoisted, so as far as the
            // compiler is concerned they may run before it.
            const root: HTMLElement = rootEl;
            const overlay: HTMLElement = overlayEl;
            const edgeSize = options.edgeSize ?? 6;

            /**
             * Tell the component which gestures are on, so it can show that a
             * bar can be taken. Without a sign there is nothing to guess it
             * from: the bar looks exactly like one in a timeline that moves
             * nothing.
             *
             * It goes on the root as a data attribute rather than as a class on
             * each bar, and not for tidiness: `class` on a bar is bound, so Vue
             * rewrites it on every repaint and anything we added from outside
             * would be gone with the first scroll. Nothing is bound to this
             * attribute, so nobody rewrites it.
             *
             * The width of the edge zone travels the same way. The plugin owns
             * that number - it is what `edgeAt` measures by - and the component
             * has to draw the handle exactly that wide, or the eye and the
             * gesture would disagree about where the edge is.
             */
            const gestures: string[] = [];
            if (options.onMove !== undefined) gestures.push("move");
            if (options.onResize !== undefined) gestures.push("resize");

            root.dataset.gestures = gestures.join(" ");
            root.style.setProperty("--rt-edge-size", `${edgeSize}px`);

            function findBar(id: string): Grab<R, I> | undefined {
                const layout = ctx.getLayout();
                const axis = dayAxis(layout);
                const rows = layout.rows;

                for (let index = 0; index < rows.length; index++) {
                    const placed = rows[index].bars.find((candidate) => candidate.item.id === id);
                    if (placed !== undefined) {
                        return {
                            placed,
                            resource: rows[index].resource,
                            resourceIndex: index,
                            edge: null,
                            startDay: axis.dayOf(placed.item.start),
                            endDay: axis.dayOf(placed.item.end),
                            grabDay: 0,
                        };
                    }
                }
                return undefined;
            }

            /**
             * The edge under the cursor. The zone is never wider than a third
             * of the bar: on a 30-pixel day two six-pixel strips still leave a
             * middle from which the bar can be taken whole.
             *
             * Six pixels is no good for a finger: it covers a dozen and would
             * hit the edge at random - stretched one time, moved the next. So
             * on touch the zone is wider; a third stays the ceiling, so a
             * middle always exists.
             */
            function edgeAt(bar: HTMLElement, x: number, touch = false): DragEdge | null {
                if (options.onResize === undefined) return null;

                const rect = bar.getBoundingClientRect();
                const zone = Math.min(touch ? Math.max(edgeSize, TOUCH_EDGE) : edgeSize, rect.width / 3);
                if (x - rect.left <= zone) return "start";
                if (rect.right - x <= zone) return "end";
                return null;
            }

            /**
             * The bar's visible rectangle, in days. What the edge of the range
             * clipped is not part of it - the ghost draws only what is visible -
             * but the dates are computed from the item itself, not from this.
             */
            function visible(grab: Grab<R, I>): { from: number; to: number } {
                const axis = dayAxis(ctx.getLayout());
                return { from: Math.max(grab.startDay, 0), to: Math.min(grab.endDay, axis.length) };
            }

            /** The rectangle for the ghost. Columns are fractional: it counts pixels. */
            function rect(from: number, to: number, resourceIndex: number): Target {
                const axis = dayAxis(ctx.getLayout());
                return {
                    slotIndex: axis.slotOf(from),
                    slotSpan: axis.slotOf(to - from),
                    resourceIndex,
                };
            }

            /**
             * What this target will come to. Pure functions, because they are
             * needed twice: first to ask for permission during the movement,
             * then to hand over the result. Computing along two different paths
             * would sooner or later allow one thing and apply another.
             */
            function moveOf(grab: Grab<R, I>, target: Target): DragMove<R, I> | null {
                const layout = ctx.getLayout();
                const to = layout.rows[target.resourceIndex]?.resource;
                if (to === undefined) return null;

                const axis = dayAxis(layout);
                const item = grab.placed.item;
                const days = axis.dayOfSlot(target.slotIndex) - visible(grab).from;

                return {
                    item,
                    from: grab.resource,
                    to,
                    start: axis.dateAt(grab.startDay + days),
                    end: axis.dateAt(grab.endDay + days),
                    days,
                };
            }

            /**
             * Stretching is counted in days and from the item's own bounds, not
             * from the visible columns. Otherwise at the "week" step an edge had
             * nowhere to move inside a week, and once it jumped one it turned
             * the event inside out: the end landed before the start.
             *
             * The minimum is one day, and that is not advice but the edge of the
             * contract: `end` is exclusive, so an event shorter than a day does
             * not exist.
             */
            function resizeOf(grab: Grab<R, I>, target: Target): DragResize<R, I> | null {
                if (grab.edge === null) return null;

                const axis = dayAxis(ctx.getLayout());
                const item = grab.placed.item;

                if (grab.edge === "start") {
                    const day = Math.min(axis.dayOfSlot(target.slotIndex), grab.endDay - 1);
                    return {
                        item,
                        resource: grab.resource,
                        edge: "start",
                        start: axis.dateAt(day),
                        end: item.end,
                    };
                }

                const day = Math.max(axis.dayOfSlot(target.slotIndex + target.slotSpan), grab.startDay + 1);
                return {
                    item,
                    resource: grab.resource,
                    edge: "end",
                    start: item.start,
                    end: axis.dateAt(day),
                };
            }

            /** Whether the target differs from what is already there at all. */
            function changed(grab: Grab<R, I>, target: Target): boolean {
                const axis = dayAxis(ctx.getLayout());
                const box = visible(grab);

                return (
                    axis.dayOfSlot(target.slotIndex) !== box.from ||
                    axis.dayOfSlot(target.slotIndex + target.slotSpan) !== box.to ||
                    target.resourceIndex !== grab.resourceIndex
                );
            }

            const ghost = makeGhost(overlay, options.className);
            const untrack = trackPointer<Grab<R, I>>(
                {
                    root,
                    threshold: options.threshold ?? 4,
                    longPress: options.longPress,

                    press(event) {
                        const bar = (event.target as HTMLElement).closest<HTMLElement>(".rt__bar");
                        const id = bar?.dataset.item;
                        if (bar === null || bar === undefined || id === undefined) return null;

                        const grab = findBar(id);
                        const hit = ctx.hitTest({ x: event.clientX, y: event.clientY });
                        if (grab === undefined || hit === null) return null;
                        if (!(options.canDrag?.(grab.placed.item, grab.resource) ?? true)) return null;

                        const edge = edgeAt(bar, event.clientX, event.pointerType === "touch");
                        // A gesture with no handler does not start: dragging a
                        // bar that will go nowhere is worse than not dragging
                        // it at all.
                        if (edge === null && options.onMove === undefined) return null;

                        const axis = dayAxis(ctx.getLayout());
                        grab.edge = edge;
                        grab.grabDay = dayUnder(
                            event.clientX,
                            overlay,
                            ctx.getGeometry().slotWidth,
                            axis.perSlot,
                        );

                        // The ghost knows whose reflection it is: it takes its
                        // height and its place in the row from the bar being
                        // dragged.
                        ghost.fit(bar);
                        return grab;
                    },

                    track(grab, event) {
                        const hit = ctx.hitTest({ x: event.clientX, y: event.clientY });
                        if (hit === null) return null;

                        const axis = dayAxis(ctx.getLayout());
                        const day = dayUnder(event.clientX, overlay, ctx.getGeometry().slotWidth, axis.perSlot);
                        const box = visible(grab);

                        if (grab.edge === "start") {
                            // One day minimum: an edge cannot jump past the opposite one.
                            const next = clamp(day, 0, grab.endDay - 1);
                            return rect(next, box.to, grab.resourceIndex);
                        }

                        if (grab.edge === "end") {
                            // The end is exclusive, so the day under the pointer
                            // is still part of the event - hence the +1.
                            const next = clamp(day + 1, grab.startDay + 1, axis.length);
                            return rect(box.from, next, grab.resourceIndex);
                        }

                        // A move: a bar carried past the edge of the axis does
                        // not get shorter - it simply comes up against it.
                        const span = box.to - box.from;
                        const next = clamp(day - (grab.grabDay - box.from), 0, axis.length - span);
                        return rect(next, next + span, hit.resourceIndex);
                    },

                    validate(grab, target) {
                        // There is nothing to forbid about returning to the same
                        // place: the gesture will simply do nothing.
                        if (!changed(grab, target)) return true;

                        if (grab.edge === null) {
                            const move = moveOf(grab, target);
                            return move === null ? false : (options.canMove?.(move) ?? true);
                        }

                        const resize = resizeOf(grab, target);
                        return resize === null ? false : (options.canResize?.(resize) ?? true);
                    },

                    commit(grab, target) {
                        if (!changed(grab, target)) return;

                        if (grab.edge === null) {
                            const move = moveOf(grab, target);
                            if (move !== null) options.onMove?.(move);
                            return;
                        }

                        const resize = resizeOf(grab, target);
                        if (resize !== null) options.onResize?.(resize);
                    },
                },
                ghost,
                () => ctx.getGeometry(),
            );

            /**
             * The same as a gesture, but from the keyboard. Without this,
             * everything the mouse can do simply does not exist for the
             * keyboard - and that is no longer an inconvenience but
             * inaccessibility: the user sees a bar, hears its name and can do
             * nothing with it.
             *
             * Shift moves the whole bar, Alt drags its edge: the same pair as
             * the middle and the edge under the pointer. Bare arrows are not
             * ours - focus travels by them.
             */
            function onKeydown(event: KeyboardEvent) {
                if (!event.shiftKey && !event.altKey) return;

                const bar = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(".rt__bar");
                const id = bar?.dataset.item;
                if (id === undefined) return;

                const days = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                const rows = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
                if (days === 0 && rows === 0) return;

                const grab = findBar(id);
                if (grab === undefined) return;
                // The keyboard is the same gesture by other means, so it is
                // refused on the same ground.
                if (!(options.canDrag?.(grab.placed.item, grab.resource) ?? true)) return;

                const layout = ctx.getLayout();
                const axis = dayAxis(layout);
                const box = visible(grab);

                if (event.altKey) {
                    if (options.onResize === undefined || days === 0) return;

                    // One day minimum, the edge of the axis the limit: the same
                    // rules as in the gesture, and likewise in days rather than
                    // in columns.
                    const next = box.to + days;
                    if (next <= grab.startDay || next > axis.length) return;

                    grab.edge = "end";
                    const resize = resizeOf(grab, rect(box.from, next, grab.resourceIndex));
                    if (resize === null || !(options.canResize?.(resize) ?? true)) return;

                    event.preventDefault();
                    options.onResize(resize);
                    return;
                }

                if (options.onMove === undefined) return;

                const span = box.to - box.from;
                const from = clamp(box.from + days, 0, axis.length - span);
                const target = {
                    ...rect(from, from + span, 0),
                    resourceIndex: Math.min(Math.max(grab.resourceIndex + rows, 0), layout.rows.length - 1),
                };
                if (!changed(grab, target)) return;

                const move = moveOf(grab, target);
                if (move === null || !(options.canMove?.(move) ?? true)) return;

                event.preventDefault();
                options.onMove(move);
            }

            root.addEventListener("keydown", onKeydown);
            const unguard = guard(root);

            return () => {
                root.removeEventListener("keydown", onKeydown);
                delete root.dataset.gestures;
                root.style.removeProperty("--rt-edge-size");
                untrack();
                unguard();
            };
        },
    };
}
