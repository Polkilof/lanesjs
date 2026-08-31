/**
 * Ліцензійний ключ. Рішення 08: код їде разом, працює без ключа, купують за
 * переконанням — тож перевірка тут нічого не вимикає й не ламає. Вона лише
 * каже вголос, чим користуються: раз у консоль і маленькою позначкою в кутку.
 *
 * Ключ підписаний, а не звірений із таблицею: у пакет їде тільки публічний
 * ключ, тож кейгена не існує навіть у того, хто має весь наш код. Перевірка
 * офлайн — жодного звернення до нас; хто купив компонент, не купував нагляду.
 *
 * Що ключ обмежує — вікно оновлень, а не роботу. Дату кінця порівнюємо з
 * датою збірки пакета, а не з годинником: куплена версія працює вічно, а
 * випущена після кінця вікна просить поновити. Годинник клієнта тут не
 * суддя — його переводять, і в обидва боки.
 */

/**
 * Публічний ключ пакета (SPKI, base64url). Приватний — поза репозиторієм;
 * видача ключів у scripts/lanes-license.mjs.
 */
const PUBLIC_KEY =
    "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEsoP0L5MEn0YDDwX6QCaqRiPdgqftDdW-HlbbwlRoFSaaKtJu1832nmd5J-DwTuMECjuBeQ8cs1x-LC7BOMUcOw";

// Підставляє збірка бібліотеки. Коли Lanes живиться вихідниками — а так
// живемо ми самі — їх немає, і вікно оновлень не перевіряється: власну збірку
// не ліцензують.
declare const __LANES_VERSION__: string;
declare const __LANES_BUILT__: string;

const VERSION = typeof __LANES_VERSION__ === "string" ? __LANES_VERSION__ : "";
const BUILT = typeof __LANES_BUILT__ === "string" ? __LANES_BUILT__ : "";

export type LicenseStatus =
    /** Ключа не давали. */
    | "unlicensed"
    /** Ключ наш і покриває цю збірку. */
    | "licensed"
    /** Ключ наш, але вікно оновлень скінчилось раніше за цю збірку. */
    | "outdated"
    /** Ключ не наш або зіпсований. */
    | "invalid"
    /** Немає чим перевірити (незахищений контекст) — і ми мовчимо. */
    | "unverifiable";

export interface License {
    id: string;
    licensee: string;
    edition: string;
    /** Доки покривають оновлення, РРРР-ММ-ДД. */
    updatesUntil: string;
}

export interface LicenseCheck {
    status: LicenseStatus;
    license: License | null;
}

function fromBase64Url(value: string): Uint8Array {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

function looksLikeLicense(value: unknown): value is License {
    const license = value as License;
    return (
        typeof license?.id === "string" &&
        typeof license.licensee === "string" &&
        typeof license.edition === "string" &&
        typeof license.updatesUntil === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(license.updatesUntil)
    );
}

/**
 * Перевірка ключа. Винесена окремо й параметризована навмисно: інакше її
 * можна було б перевірити хіба що справжнім ключем, а справжній ключ у тестах
 * означав би справжній приватний ключ у репозиторії.
 */
export async function verifyLicense(
    key: string,
    options: { publicKey?: string; builtAt?: string } = {},
): Promise<LicenseCheck> {
    const publicKey = options.publicKey ?? PUBLIC_KEY;
    const builtAt = options.builtAt ?? BUILT;

    const parts = key.trim().split(".");
    if (parts.length !== 3 || parts[0] !== "LANES") return { status: "invalid", license: null };

    // Незахищений контекст (звичайний http) crypto.subtle не дає. Це не привід
    // звинувачувати того, хто заплатив: без перевірки ми просто мовчимо.
    const subtle = globalThis.crypto?.subtle;
    if (subtle === undefined) return { status: "unverifiable", license: null };

    let license: unknown;
    try {
        license = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1])));
    } catch {
        return { status: "invalid", license: null };
    }
    if (!looksLikeLicense(license)) return { status: "invalid", license: null };

    let signed = false;
    try {
        const imported = await subtle.importKey(
            "spki",
            fromBase64Url(publicKey),
            { name: "ECDSA", namedCurve: "P-256" },
            false,
            ["verify"],
        );
        signed = await subtle.verify(
            { name: "ECDSA", hash: "SHA-256" },
            imported,
            fromBase64Url(parts[2]),
            new TextEncoder().encode(parts[1]),
        );
    } catch {
        signed = false;
    }

    if (!signed) return { status: "invalid", license: null };

    // Дати ISO порівнюються як рядки — на те й формат.
    if (builtAt !== "" && license.updatesUntil < builtAt) return { status: "outdated", license };

    return { status: "licensed", license };
}

let checking: Promise<LicenseCheck> = Promise.resolve({ status: "unlicensed", license: null });

/**
 * Віддати ключ бібліотеці. Викликати до того, як з'явиться перший таймлайн з
 * платними плагінами; спізнитись на секунду не страшно — стільки їй і дано.
 */
export function setLicense(key: string): void {
    checking = verifyLicense(key);
}

/** Чим усе скінчилось. Потрібне хіба що нам самим і тестам. */
export function licenseStatus(): Promise<LicenseCheck> {
    return checking;
}

/** Скільки чекати на ключ, перш ніж вирішити, що його не буде. */
const GRACE = 1000;

const NOTICE: Record<string, string> = {
    unlicensed:
        "Lanes Pro is running without a licence key. Nothing is disabled — the paid plugins work either way. " +
        "If this is a commercial project, please buy a licence and set it with setLicense(key).",
    invalid:
        "Lanes Pro does not recognise this licence key. Nothing is disabled, but the key is either mistyped or not ours.",
    outdated:
        "This Lanes Pro licence covers updates released earlier than this build. Nothing is disabled — " +
        "renew the licence to keep the notice away.",
};

const BADGE: Record<string, string> = {
    unlicensed: "Lanes Pro — unlicensed",
    invalid: "Lanes Pro — licence not recognised",
    outdated: "Lanes Pro — updates expired",
};

let announced = false;

interface Watch {
    /** Скільки платних плагінів стоїть на цьому таймлайні. */
    count: number;
    timer: ReturnType<typeof setTimeout> | null;
    badge: HTMLElement | null;
}

const watched = new Map<HTMLElement, Watch>();

/**
 * Позначку малює платний шар і тільки платний: безкоштовна половина про
 * ліцензію не знає нічого — інакше її не зібрати окремо (правило теки).
 */
function mark(root: HTMLElement, status: LicenseStatus): HTMLElement {
    const badge = document.createElement("div");
    badge.className = "rt__license";
    badge.textContent = BADGE[status] ?? BADGE.unlicensed;
    badge.style.cssText = [
        "position:absolute",
        "right:4px",
        "bottom:4px",
        "z-index:5",
        "padding:2px 6px",
        "border-radius:4px",
        "font:11px/1.4 system-ui,sans-serif",
        "color:#fff",
        "background:rgba(0,0,0,.55)",
        "pointer-events:none",
        "user-select:none",
    ].join(";");

    root.appendChild(badge);
    return badge;
}

/**
 * Ввімкнути перевірку для одного таймлайна; повертає зняття. Кличе кожен
 * платний плагін, а позначка й повідомлення — одні на всіх: чотири плагіни на
 * одному екрані не привід кричати чотири рази.
 */
export function guard(root: HTMLElement | null): () => void {
    if (root === null || typeof document === "undefined") return () => {};

    const watch: Watch = watched.get(root) ?? { count: 0, timer: null, badge: null };
    watch.count += 1;
    watched.set(root, watch);

    // Ключ часто дають після монтування — застосунок міг тягти його з
    // конфігу. Секунда мовчання дешевша за хибне звинувачення.
    if (watch.timer === null && watch.badge === null) {
        watch.timer = setTimeout(() => void settle(root), GRACE);
    }

    return () => {
        watch.count -= 1;
        if (watch.count > 0) return;

        if (watch.timer !== null) clearTimeout(watch.timer);
        watch.badge?.remove();
        watched.delete(root);
    };
}

async function settle(root: HTMLElement): Promise<void> {
    const { status, license } = await checking;

    const watch = watched.get(root);
    // Таймлайн могли зняти, поки ми перевіряли.
    if (watch === undefined) return;
    watch.timer = null;

    if (status === "licensed" || status === "unverifiable") return;

    if (!announced) {
        announced = true;
        const build = VERSION === "" ? "" : ` (build ${VERSION}${BUILT === "" ? "" : `, ${BUILT}`})`;
        const covered = license === null ? "" : ` Licence ${license.id} covers updates until ${license.updatesUntil}.`;
        console.warn(`${NOTICE[status] ?? NOTICE.unlicensed}${covered}${build}`);
    }

    watch.badge = mark(root, status);
}
