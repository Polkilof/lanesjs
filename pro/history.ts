/**
 * Undo and redo for gestures. The plugin does not own the data, so it cannot
 * know how to put it back. The application therefore puts a pair of closures on
 * the stack: how to undo and how to redo. That is the only honest option with a
 * controlled component, and at the same time the most flexible one - any action
 * of the application can go on the stack, not only our gestures.
 *
 * The plugin is the handle: the object passed into `plugins` also carries the
 * stack methods. That way the application does not have to keep two references
 * to one thing.
 *
 * The `pro/` folder imports from `core/` and `vue/`; never the other way round.
 */
import { guard } from "./license";
import type { Plugin } from "../core/types";

export interface HistoryEntry {
    /** A human-readable name - for the tooltip on a button. */
    label?: string;
    undo(): void;
    redo(): void;
}

export interface HistoryOptions {
    /** How many steps to keep; the oldest ones fall off. */
    limit?: number;
    /**
     * The Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z shortcuts. Turn them off if the
     * application has its own: the listener sits on the window, and two stacks
     * on the same keys are guaranteed confusion.
     */
    keys?: boolean;
    /**
     * The stack changed. The plugin deliberately does not pull in the
     * framework's reactivity, so the application updates its undo buttons
     * itself.
     */
    onChange?: () => void;
}

export interface HistoryPlugin<R = unknown, I = unknown> extends Plugin<R, I> {
    push(entry: HistoryEntry): void;
    undo(): HistoryEntry | null;
    redo(): HistoryEntry | null;
    clear(): void;
    canUndo(): boolean;
    canRedo(): boolean;
}

export function history<R = unknown, I = unknown>(options: HistoryOptions = {}): HistoryPlugin<R, I> {
    const limit = options.limit ?? 50;
    const past: HistoryEntry[] = [];
    const future: HistoryEntry[] = [];

    function push(entry: HistoryEntry) {
        past.push(entry);
        if (past.length > limit) past.shift();

        // A new action cuts the future off: there is nothing left to redo
        future.length = 0;
        options.onChange?.();
    }

    function undo(): HistoryEntry | null {
        const entry = past.pop();
        if (entry === undefined) return null;

        entry.undo();
        future.push(entry);
        options.onChange?.();
        return entry;
    }

    function redo(): HistoryEntry | null {
        const entry = future.pop();
        if (entry === undefined) return null;

        entry.redo();
        past.push(entry);
        options.onChange?.();
        return entry;
    }

    function clear() {
        past.length = 0;
        future.length = 0;
        options.onChange?.();
    }

    /**
     * Keys are listened for on the window, because the table takes no focus.
     * Input fields are skipped: there Ctrl+Z belongs to the browser, and taking
     * it away is the fastest way to break a form standing next to the table.
     */
    function onKeyDown(event: KeyboardEvent) {
        if (!event.ctrlKey && !event.metaKey) return;

        const target = event.target as HTMLElement | null;
        if (target?.closest?.("input, textarea, select, [contenteditable='true']") != null) return;

        const key = event.key.toLowerCase();
        const isRedo = key === "y" || (key === "z" && event.shiftKey);
        const isUndo = key === "z" && !event.shiftKey;
        if (!isRedo && !isUndo) return;

        // preventDefault only when something was actually done: an empty stack
        // must not swallow undo in the application around us.
        if ((isRedo ? redo() : undo()) !== null) event.preventDefault();
    }

    return {
        name: "history",
        setup(ctx) {
            // The stack is paid behaviour too, so the check does not depend on
            // whether we are listening for keys.
            const unguard = guard(ctx.getRoot());
            if (options.keys === false) return unguard;

            window.addEventListener("keydown", onKeyDown);
            return () => {
                window.removeEventListener("keydown", onKeyDown);
                unguard();
            };
        },
        push,
        undo,
        redo,
        clear,
        canUndo: () => past.length > 0,
        canRedo: () => future.length > 0,
    };
}
