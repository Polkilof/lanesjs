/**
 * The mechanics shared by the paid gestures: pressed, travelled past the
 * threshold, kept going, released. A gesture differs only in four answers -
 * whether to take the start, where the pointer leads, whether it may be
 * released there, and what to do next.
 *
 * Pulled out because dragging and select-to-create are identical in everything
 * but those answers, while they do have to live in separate plugins: an
 * application may allow creating without allowing dragging.
 */
import type { Geometry } from "../core/types";

/** The rectangle the ghost shows; every gesture comes down to it. */
export interface Target {
    slotIndex: number;
    slotSpan: number;
    resourceIndex: number;
}

export interface Ghost {
    show(target: Target, geometry: Geometry, valid: boolean): void;
    /**
     * Fit the ghost to the bar that was grabbed: it takes the same height and
     * the same place in the row, and the bar itself dims - but only once the
     * gesture has really begun.
     */
    fit(bar: HTMLElement): void;
    remove(): void;
}

/**
 * The ghost in the overlay layer. Only what it would end up in the wrong place
 * without stays inline: position and transparency to the pointer. Its
 * appearance lives in the component stylesheet, under the --rt-ghost-* tokens:
 * inline beats any selector, so while the colour sat here an application could
 * not recolour the ghost at all, and the className the plugins promised stayed
 * a half-empty promise.
 */
export function makeGhost(overlay: HTMLElement, className?: string): Ghost {
    let element: HTMLElement | null = null;
    let source: HTMLElement | null = null;
    let box: { top: number; height: number } | null = null;

    return {
        fit(bar) {
            source = bar;
            box = { top: bar.offsetTop, height: bar.offsetHeight };
        },

        show(target, geometry, valid) {
            if (element === null) {
                element = document.createElement("div");
                element.className = ["rt__ghost", className].filter(Boolean).join(" ");
                element.style.cssText = "position:absolute;pointer-events:none";
                overlay.appendChild(element);

                // The bar dims here rather than in fit: fitting happens on the
                // press, while the gesture begins on the movement threshold or
                // on a hold. Otherwise every click on a bar would flash.
                source?.classList.add("rt__bar--dragging");
            }

            const top = geometry.rowOffsets[target.resourceIndex];
            const rowHeight = geometry.rowOffsets[target.resourceIndex + 1] - top;

            element.style.left = `${target.slotIndex * geometry.slotWidth}px`;
            element.style.width = `${target.slotSpan * geometry.slotWidth}px`;

            // The ghost repeats the silhouette of the bar rather than the whole
            // row band: a rectangle twice as tall as the thing being dragged
            // shows the row, not the place. Where there is no bar - a selection
            // on empty space - the row band is exactly right; zero height means
            // an environment without layout (jsdom), and there the row is taken
            // as well.
            const fitted = box !== null && box.height > 0;
            element.style.top = `${top + (fitted && box !== null ? box.top : 0)}px`;
            element.style.height = `${fitted && box !== null ? box.height : rowHeight}px`;

            // A forbidden target is visible at once rather than after release:
            // otherwise the gesture silently does nothing, and that reads as
            // broken.
            element.classList.toggle("rt__ghost--invalid", !valid);
        },

        remove() {
            source?.classList.remove("rt__bar--dragging");
            element?.remove();
            element = null;
            source = null;
            box = null;
        },
    };
}

/** How long to hold a finger before a touch gesture begins. */
const LONG_PRESS = 400;

/** How far a finger may travel during the hold and still not be a scroll. */
const TOUCH_SLOP = 10;

export interface PointerGesture<S> {
    root: HTMLElement;
    /**
     * How many pixels to travel before this counts as a gesture. Without a
     * threshold every click would start a drag, and the click would disappear.
     */
    threshold: number;
    /**
     * How long to hold a finger for a touch gesture to begin. A movement
     * threshold does not do there - why exactly is explained above
     * `trackPointer`.
     */
    longPress?: number;
    /** Take the start of the gesture, or refuse it. */
    press(event: PointerEvent): S | null;
    /** Where the pointer leads right now; null keeps the previous answer. */
    track(state: S, event: PointerEvent): Target | null;
    /**
     * Whether it may be released here. A forbidden target is shown crossed out
     * but not applied: the user should see the edge of the rule during the
     * gesture rather than learn about it from silence.
     */
    validate?(state: S, target: Target): boolean;
    /** Released. Called only for an allowed target. */
    commit(state: S, target: Target): void;
}

/**
 * Subscribing to the pointer; returns the teardown function. Movement and
 * release are listened for on the window rather than on the root: a gesture
 * must not break off the moment the cursor leaves the table - that is exactly
 * where it is led when something is dragged to the edge.
 *
 * A mouse and a finger begin a gesture differently, and that is not a whim.
 * With a mouse, movement begins it: a threshold of a few pixels separates a
 * drag from a click. With a finger, that same movement is taken first by the
 * browser - it starts scrolling from it and sends us `pointercancel`, and the
 * gesture is cut off before it began. So on touch a hold begins it: the finger
 * is still, scrolling has not started, and while it has not started it can
 * still be refused - `preventDefault` on `touchmove`. After that there is
 * nothing left to refuse: the event arrives with `cancelable: false`.
 *
 * Why not `touch-action: none` on bars, the way half of such components do:
 * then the table could not be scrolled with a finger starting from a bar, and a
 * bar covers half a row. A CSS rule cannot say "stay out of the way until they
 * hold".
 */
export function trackPointer<S>(gesture: PointerGesture<S>, ghost: Ghost, geometry: () => Geometry): () => void {
    const { root, threshold } = gesture;
    const longPress = gesture.longPress ?? LONG_PRESS;

    let state: S | null = null;
    /** jsdom has no PointerEvent, so there may be no id at all. */
    let pointerId: number | null = null;
    let touch = false;
    let origin = { x: 0, y: 0 };
    let active = false;
    let target: Target | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    /** While a finger is leading a gesture, scrolling the page is not what is wanted. */
    function blockScroll(event: TouchEvent) {
        if (event.cancelable) event.preventDefault();
    }

    /** Not our pointer: a second finger does not interfere with someone else's gesture. */
    function foreign(event: PointerEvent): boolean {
        return pointerId !== null && event.pointerId !== pointerId;
    }

    function reset() {
        if (timer !== null) clearTimeout(timer);
        window.removeEventListener("touchmove", blockScroll);

        ghost.remove();
        timer = null;
        state = null;
        target = null;
        active = false;
        touch = false;
        pointerId = null;
        root.style.userSelect = "";
    }

    /**
     * Show where the pointer leads. `take` says whether to keep this target as
     * the result: a hold on its own changes nothing, movement does. Otherwise a
     * finger pressed and released in place would do what a mouse does not.
     */
    function show(event: PointerEvent, take: boolean) {
        if (state === null) return;

        const next = gesture.track(state, event);
        if (next === null) return;

        // A forbidden target is shown but not remembered: releasing on it must
        // not apply, while returning to an allowed one must still work.
        const valid = gesture.validate?.(state, next) ?? true;
        if (take) target = valid ? next : null;
        ghost.show(next, geometry(), valid);
    }

    function begin(event: PointerEvent, moved: boolean) {
        active = true;
        // Otherwise dragging selects the labels of bars and rows
        root.style.userSelect = "none";
        if (touch) window.addEventListener("touchmove", blockScroll, { passive: false });
        show(event, moved);
    }

    function onPointerDown(event: PointerEvent) {
        if (state !== null) return;
        if (event.button !== 0) return;

        const next = gesture.press(event);
        if (next === null) return;

        state = next;
        pointerId = typeof event.pointerId === "number" ? event.pointerId : null;
        touch = event.pointerType === "touch";
        origin = { x: event.clientX, y: event.clientY };
        active = false;
        target = null;

        if (touch) timer = setTimeout(() => begin(event, false), longPress);
    }

    function onPointerMove(event: PointerEvent) {
        if (state === null || foreign(event)) return;

        if (!active) {
            const moved = Math.abs(event.clientX - origin.x) + Math.abs(event.clientY - origin.y);

            // The finger moved before the hold was over - that is a scroll, and
            // we are not going to take it away from the user.
            if (touch) {
                if (moved > TOUCH_SLOP) reset();
                return;
            }

            if (moved < threshold) return;
            begin(event, true);
            return;
        }

        show(event, true);
    }

    function onPointerUp(event: PointerEvent) {
        if (state === null || foreign(event)) return;

        const finished = state;
        const finishedTarget = target;
        reset();

        if (finishedTarget !== null) gesture.commit(finished, finishedTarget);
    }

    /**
     * A cancel is not a release: the browser took the pointer for itself, and
     * there is no ground for applying what the user did not finish.
     */
    function onPointerCancel(event: PointerEvent) {
        if (state === null || foreign(event)) return;
        reset();
    }

    /** A long hold on touch would otherwise open the menu right on top of the gesture. */
    function onContextMenu(event: Event) {
        if (state !== null && touch) event.preventDefault();
    }

    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);

    return () => {
        root.removeEventListener("pointerdown", onPointerDown);
        root.removeEventListener("contextmenu", onContextMenu);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
        reset();
    };
}
