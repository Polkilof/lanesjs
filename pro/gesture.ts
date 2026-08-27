/**
 * Спільна механіка платних жестів: натиснули, провезли більше за поріг, ведемо,
 * відпустили. Кожен жест відрізняється лише трьома відповідями — чи брати
 * початок, куди веде вказівник і що робити на відпусканні.
 *
 * Винесено, бо перетягування й створення виділенням однакові в усьому, крім
 * цих трьох відповідей, а розкладені по різних плагінах вони мають бути:
 * застосунок може дозволити створювати, не дозволяючи тягати.
 */
import type { Geometry } from "../core/types";

/** Прямокутник, який показує привид; усі жести зводяться до нього. */
export interface Target {
    slotIndex: number;
    slotSpan: number;
    resourceIndex: number;
}

export interface Ghost {
    show(target: Target, geometry: Geometry): void;
    remove(): void;
}

/**
 * Привид у шарі накладок. Базовий вигляд інлайном: він має бути видимий і
 * тоді, коли застосунок про нього ще нічого не знає.
 */
export function makeGhost(overlay: HTMLElement, className?: string): Ghost {
    let element: HTMLElement | null = null;

    return {
        show(target, geometry) {
            if (element === null) {
                element = document.createElement("div");
                element.className = ["rt__ghost", className].filter(Boolean).join(" ");
                element.style.cssText =
                    "position:absolute;border:1px dashed currentColor;border-radius:var(--rt-radius);" +
                    "background:rgba(127,127,127,0.12);pointer-events:none";
                overlay.appendChild(element);
            }

            const top = geometry.rowOffsets[target.resourceIndex];
            element.style.left = `${target.slotIndex * geometry.slotWidth}px`;
            element.style.width = `${target.slotSpan * geometry.slotWidth}px`;
            element.style.top = `${top}px`;
            element.style.height = `${geometry.rowOffsets[target.resourceIndex + 1] - top}px`;
        },
        remove() {
            element?.remove();
            element = null;
        },
    };
}

export interface PointerGesture<S> {
    root: HTMLElement;
    /**
     * Скільки пікселів треба провезти, перш ніж це вважатиметься жестом. Без
     * порога кожен клік починав би тягнення, і клік зникав би.
     */
    threshold: number;
    /** Взяти початок жесту або відмовитись. */
    press(event: MouseEvent): S | null;
    /** Куди веде вказівник зараз; null — лишити попереднє. */
    track(state: S, event: MouseEvent): Target | null;
    /** Відпустили. Викликається лише тоді, коли жест справді почався. */
    commit(state: S, target: Target): void;
}

/**
 * Підписка на вказівник; повертає функцію зняття. Рух і відпускання слухаємо
 * на вікні, а не на корені: жест не має уриватись, щойно курсор вийшов за межі
 * таблиці — саме туди його й ведуть, коли тягнуть до краю.
 */
export function trackPointer<S>(gesture: PointerGesture<S>, ghost: Ghost, geometry: () => Geometry): () => void {
    const { root, threshold } = gesture;

    let state: S | null = null;
    let origin = { x: 0, y: 0 };
    let active = false;
    let target: Target | null = null;

    function reset() {
        ghost.remove();
        state = null;
        target = null;
        active = false;
        root.style.userSelect = "";
    }

    function onPointerDown(event: MouseEvent) {
        if (event.button !== 0) return;

        const next = gesture.press(event);
        if (next === null) return;

        state = next;
        origin = { x: event.clientX, y: event.clientY };
        active = false;
        target = null;
    }

    function onPointerMove(event: MouseEvent) {
        if (state === null) return;

        if (!active) {
            const moved = Math.abs(event.clientX - origin.x) + Math.abs(event.clientY - origin.y);
            if (moved < threshold) return;

            active = true;
            // Інакше тягнення виділяє підписи барів і рядків
            root.style.userSelect = "none";
        }

        const next = gesture.track(state, event);
        if (next === null) return;

        target = next;
        ghost.show(next, geometry());
    }

    function onPointerUp() {
        const finished = state;
        const finishedTarget = target;
        reset();

        if (finished !== null && finishedTarget !== null) gesture.commit(finished, finishedTarget);
    }

    root.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
        root.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        reset();
    };
}
