/**
 * Скасувати й повторити для жестів. Плагін не володіє даними — отже, не може
 * знати, як їх повернути. Тому застосунок кладе в стек пару замикань: як
 * відкотити і як повторити. Це єдиний чесний варіант при керованому
 * компоненті, і заразом найгнучкіший: у стек лягає будь-яка дія застосунку,
 * не лише наші жести.
 *
 * Плагін і є ручкою: об'єкт, який передають у `plugins`, має ще й методи
 * стека. Так застосунку не треба тримати два посилання на одне й те саме.
 *
 * Тека `pro/` імпортує з `core/` і `vue/`; назад — ніколи (див. README).
 */
import type { Plugin } from "../core/types";

export interface HistoryEntry {
    /** Людська назва — для підказки на кнопці. */
    label?: string;
    undo(): void;
    redo(): void;
}

export interface HistoryOptions {
    /** Скільки кроків тримати; найдавніші випадають. */
    limit?: number;
    /**
     * Гарячі клавіші Ctrl/Cmd+Z і Ctrl/Cmd+Shift+Z. Вимкніть, якщо застосунок
     * має власні: слухач висить на вікні, і два стеки на одні клавіші —
     * гарантована плутанина.
     */
    keys?: boolean;
    /**
     * Стек змінився. Плагін навмисно не тягне реактивність фреймворка, тож
     * кнопки «скасувати» застосунок оновлює сам.
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

        // Нова дія обриває майбутнє: повторювати після неї нема чого
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
     * Клавіші слухаються на вікні, бо таблиця не фокусується. Поля вводу
     * пропускаємо: там Ctrl+Z належить браузеру, і забрати його — найшвидший
     * спосіб зіпсувати форму поруч із таблицею.
     */
    function onKeyDown(event: KeyboardEvent) {
        if (!event.ctrlKey && !event.metaKey) return;

        const target = event.target as HTMLElement | null;
        if (target?.closest?.("input, textarea, select, [contenteditable='true']") != null) return;

        const key = event.key.toLowerCase();
        const isRedo = key === "y" || (key === "z" && event.shiftKey);
        const isUndo = key === "z" && !event.shiftKey;
        if (!isRedo && !isUndo) return;

        // preventDefault лише тоді, коли справді щось зробили: порожній стек
        // не має ковтати скасування в застосунку навколо.
        if ((isRedo ? redo() : undo()) !== null) event.preventDefault();
    }

    return {
        name: "history",
        setup() {
            if (options.keys === false) return;

            window.addEventListener("keydown", onKeyDown);
            return () => window.removeEventListener("keydown", onKeyDown);
        },
        push,
        undo,
        redo,
        clear,
        canUndo: () => past.length > 0,
        canRedo: () => future.length > 0,
    };
}
