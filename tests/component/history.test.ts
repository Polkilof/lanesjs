import { describe, it, expect } from "vitest";
import { history } from "@/lanes/pro/history";

/** Пара замикань, які лише позначаються в журналі. */
function step(log: string[], name: string) {
    return {
        label: name,
        undo: () => log.push(`-${name}`),
        redo: () => log.push(`+${name}`),
    };
}

function press(key: string, extra: KeyboardEventInit = {}) {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, ...extra }));
}

/**
 * Стек живе без розмітки, але контекст плагіна — не порожнеча: корінь у нього
 * питає перевірка ліцензії. Тут кореня немає, і це теж відповідь.
 */
function context() {
    return { getRoot: () => null } as unknown as Parameters<ReturnType<typeof history>["setup"]>[0];
}

describe("історія дій (pro)", () => {
    it("відкочує в зворотному порядку, повторює у прямому", () => {
        const log: string[] = [];
        const stack = history();

        stack.push(step(log, "a"));
        stack.push(step(log, "b"));

        stack.undo();
        stack.undo();
        expect(log).toEqual(["-b", "-a"]);

        stack.redo();
        stack.redo();
        expect(log).toEqual(["-b", "-a", "+a", "+b"]);
    });

    it("нова дія обриває майбутнє", () => {
        const log: string[] = [];
        const stack = history();

        stack.push(step(log, "a"));
        stack.undo();
        expect(stack.canRedo()).toBe(true);

        // Після нової дії повторювати вже нема чого
        stack.push(step(log, "b"));
        expect(stack.canRedo()).toBe(false);
        expect(stack.redo()).toBeNull();
    });

    it("тримає задану глибину, найдавніші випадають", () => {
        const log: string[] = [];
        const stack = history({ limit: 2 });

        stack.push(step(log, "a"));
        stack.push(step(log, "b"));
        stack.push(step(log, "c"));

        stack.undo();
        stack.undo();
        expect(stack.canUndo()).toBe(false);
        expect(log).toEqual(["-c", "-b"]);
    });

    it("порожній стек нічого не робить", () => {
        const stack = history();

        expect(stack.undo()).toBeNull();
        expect(stack.redo()).toBeNull();
        expect(stack.canUndo()).toBe(false);
    });

    it("повідомляє про зміни, щоб застосунок оновив кнопки", () => {
        const log: string[] = [];
        let changes = 0;
        const stack = history({ onChange: () => (changes += 1) });

        stack.push(step(log, "a"));
        stack.undo();
        stack.redo();
        stack.clear();

        expect(changes).toBe(4);
    });

    it("ловить Ctrl+Z і Ctrl+Shift+Z, поки плагін підключений", () => {
        const log: string[] = [];
        const stack = history();
        const teardown = stack.setup(context());

        stack.push(step(log, "a"));
        press("z");
        expect(log).toEqual(["-a"]);

        press("z", { shiftKey: true });
        expect(log).toEqual(["-a", "+a"]);

        // Після демонтажу клавіші вже не наші
        if (typeof teardown === "function") teardown();
        press("z");
        expect(log).toEqual(["-a", "+a"]);
    });

    it("не забирає Ctrl+Z у полів вводу", () => {
        const log: string[] = [];
        const stack = history();
        const teardown = stack.setup(context());
        stack.push(step(log, "a"));

        const input = document.createElement("input");
        document.body.appendChild(input);
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));

        expect(log).toEqual([]);

        input.remove();
        if (typeof teardown === "function") teardown();
    });

    it("не чіпає клавіші, коли їх вимкнули", () => {
        const log: string[] = [];
        const stack = history({ keys: false });
        stack.setup(context());
        stack.push(step(log, "a"));

        press("z");
        expect(log).toEqual([]);
    });
});
