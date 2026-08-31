// @vitest-environment node
/**
 * Перевірка ключів. Середовище node, а не jsdom: тут потрібен справжній
 * crypto.subtle, а не той, якого в jsdom може й не бути.
 *
 * Пара ключів народжується в самому тесті — саме для цього verifyLicense і
 * бере публічний ключ параметром. Інакше перевірити її можна було б лише
 * справжнім ключем, а справжній приватний ключ у репозиторії — це вже не
 * ліцензія, а лише її вигляд.
 */
import { describe, it, expect, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { verifyLicense } from "@/lanes/pro/license";

const LICENSE = { id: "lic-1", licensee: "Acme GmbH", edition: "pro", updatesUntil: "2027-01-01" };

function b64url(bytes: ArrayBuffer | Uint8Array): string {
    return Buffer.from(bytes as ArrayBuffer)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function keypair(): Promise<CryptoKeyPair> {
    return webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
        "sign",
        "verify",
    ]) as Promise<CryptoKeyPair>;
}

async function publicOf(pair: CryptoKeyPair): Promise<string> {
    return b64url(await webcrypto.subtle.exportKey("spki", pair.publicKey));
}

async function issue(pair: CryptoKeyPair, license: object = LICENSE): Promise<string> {
    const payload = b64url(Buffer.from(JSON.stringify(license)));
    const signature = await webcrypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        pair.privateKey,
        Buffer.from(payload, "utf8"),
    );
    return `LANES.${payload}.${b64url(signature)}`;
}

describe("ліцензійний ключ", () => {
    it("наш ключ визнає і віддає, що в ньому написано", async () => {
        const pair = await keypair();
        const key = await issue(pair);

        const check = await verifyLicense(key, { publicKey: await publicOf(pair) });

        expect(check.status).toBe("licensed");
        expect(check.license?.licensee).toBe("Acme GmbH");
    });

    it("підписаний чужою парою — не наш", async () => {
        const ours = await keypair();
        const theirs = await keypair();
        const key = await issue(theirs);

        const check = await verifyLicense(key, { publicKey: await publicOf(ours) });

        expect(check.status).toBe("invalid");
        expect(check.license).toBeNull();
    });

    it("підправлений payload ламає підпис", async () => {
        const pair = await keypair();
        const key = await issue(pair);

        // Той самий підпис, але дата оновлень на десять років уперед
        const forged = b64url(Buffer.from(JSON.stringify({ ...LICENSE, updatesUntil: "2037-01-01" })));
        const parts = key.split(".");
        const check = await verifyLicense(`LANES.${forged}.${parts[2]}`, { publicKey: await publicOf(pair) });

        expect(check.status).toBe("invalid");
    });

    it("сміття замість ключа — не привід падати", async () => {
        for (const key of ["", "ключ", "LANES.abc", "LANES..", "LANES.###.###"]) {
            const check = await verifyLicense(key);
            expect(check.status).toBe("invalid");
        }
    });

    it("збірка, старша за вікно оновлень, лишається ліцензованою", async () => {
        const pair = await keypair();
        const key = await issue(pair);

        const check = await verifyLicense(key, { publicKey: await publicOf(pair), builtAt: "2026-06-01" });

        expect(check.status).toBe("licensed");
    });

    it("збірка, випущена після кінця вікна, просить поновити", async () => {
        const pair = await keypair();
        const key = await issue(pair);

        const check = await verifyLicense(key, { publicKey: await publicOf(pair), builtAt: "2028-03-01" });

        // Ключ наш, і ми це кажемо: не «підробка», а «оновлення скінчились»
        expect(check.status).toBe("outdated");
        expect(check.license?.updatesUntil).toBe("2027-01-01");
    });

    it("без вихідних даних про збірку вікно не перевіряється", async () => {
        const pair = await keypair();
        const key = await issue(pair);

        const check = await verifyLicense(key, { publicKey: await publicOf(pair), builtAt: "" });

        expect(check.status).toBe("licensed");
    });

    it("нема чим перевірити — мовчимо, а не звинувачуємо", async () => {
        const pair = await keypair();
        const key = await issue(pair);

        // Незахищений контекст: crypto.subtle браузер не дає
        vi.stubGlobal("crypto", {});
        const check = await verifyLicense(key, { publicKey: await publicOf(pair) });
        vi.unstubAllGlobals();

        expect(check.status).toBe("unverifiable");
    });
});
