/**
 * Видача ліцензійних ключів Lanes. Не частина збірки: запускається руками,
 * коли хтось купив.
 *
 * Ключ — це підписаний payload, а не пароль: у пакет їде лише публічний ключ,
 * тож підробити ключ не можна, навіть маючи весь наш код. Приватний ключ у
 * репозиторії не лежить і лежати не буде — тільки у файлі, шлях до якого
 * знаєш ти.
 *
 *   node scripts/lanes-license.mjs keypair
 *   node scripts/lanes-license.mjs sign --licensee "Acme GmbH" --until 2027-08-31
 *
 * Перше друкує публічний ключ, який треба вставити в src/lanes/pro/license.ts.
 * Друге друкує ключ, який віддаємо покупцю, і дописує рядок у журнал видач.
 *
 * Журнал — це вся наша база даних, поки справжньої немає: без нього нічим
 * відповісти тому, хто загубив ключ. Лежить він поруч із приватним ключем,
 * тобто там, де репозиторію немає й не буде, і зберігає сам виданий ключ — щоб
 * перевипуск був копіюванням рядка, а не новим підписом з іншим id.
 */
import { webcrypto } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const DEFAULT_KEY_PATH = join(homedir(), ".lanes", "license-private.key");

const args = process.argv.slice(2);
const command = args[0];

/** Значення іменованого аргументу: --licensee "Acme". */
function option(name, fallback = null) {
    const at = args.indexOf(`--${name}`);
    return at === -1 || args[at + 1] === undefined ? fallback : args[at + 1];
}

function toBase64Url(bytes) {
    return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
    return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

async function keypair() {
    const path = option("out", DEFAULT_KEY_PATH);
    const pair = await webcrypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"],
    );

    const priv = await webcrypto.subtle.exportKey("pkcs8", pair.privateKey);
    const pub = await webcrypto.subtle.exportKey("spki", pair.publicKey);

    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, toBase64Url(priv), { encoding: "utf8", mode: 0o600 });

    console.log(`Приватний ключ записано: ${path}`);
    console.log("Він не має потрапити в репозиторій. Втратиш — старі ключі лишаться дійсними,");
    console.log("але видати нові буде нічим, і доведеться міняти публічний ключ у пакеті.\n");
    console.log("Публічний ключ — у src/lanes/pro/license.ts, константа PUBLIC_KEY:\n");
    console.log(toBase64Url(pub));
}

/**
 * Рядок у журнал. Формат — JSON на рядок, а не таблиця з комами: назви
 * покупців приходять з комами, лапками й переносами, і будь-який роздільник
 * рано чи пізно опиниться всередині значення.
 */
function record(ledger, entry) {
    mkdirSync(dirname(ledger), { recursive: true });
    appendFileSync(ledger, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
}

async function sign() {
    const path = option("key", DEFAULT_KEY_PATH);
    const licensee = option("licensee");
    const until = option("until");
    const edition = option("edition", "pro");
    const id = option("id", `lic-${Date.now().toString(36)}`);
    const order = option("order");
    // Журнал ходить за ключем: указали інший ключ — і записи лягають поруч із
    // ним, а не в чуже місце.
    const ledger = option("ledger", join(dirname(path), "issued.jsonl"));

    if (licensee === null || until === null) {
        console.error('Треба: --licensee "Назва покупця" --until РРРР-ММ-ДД');
        process.exit(1);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) {
        console.error(`--until має бути датою РРРР-ММ-ДД, а не "${until}"`);
        process.exit(1);
    }

    const key = await webcrypto.subtle.importKey(
        "pkcs8",
        fromBase64Url(readFileSync(path, "utf8").trim()),
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"],
    );

    // Підписуємо саме закодований payload, а не розібраний об'єкт: інакше
    // підпис залежав би від того, як саме JSON.stringify розставив ключі.
    const payload = toBase64Url(Buffer.from(JSON.stringify({ id, licensee, edition, updatesUntil: until })));
    const signature = await webcrypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        Buffer.from(payload, "utf8"),
    );

    const license = `LANES.${payload}.${toBase64Url(signature)}`;

    console.log(`Ліцензія для ${licensee}, оновлення до ${until}:\n`);
    console.log(license);

    // Ключі для тестів і демонстрацій у журнал не йдуть: він має відповідати
    // на питання «кому ми що продали», а не «що ми колись підписували».
    if (args.includes("--no-ledger")) {
        console.log("\nУ журнал не записано: --no-ledger");
        return;
    }

    record(ledger, {
        issuedAt: new Date().toISOString(),
        id,
        licensee,
        edition,
        updatesUntil: until,
        order,
        key: license,
    });

    console.log(`\nЗаписано в журнал: ${ledger}`);
}

if (command === "keypair") {
    await keypair();
} else if (command === "sign") {
    await sign();
} else {
    console.error("Команди: keypair | sign");
    console.error('  node scripts/lanes-license.mjs sign --licensee "Acme GmbH" --until 2027-08-31');
    console.error("");
    console.error("Ще в sign: --order номер замовлення, --edition, --id, --key шлях,");
    console.error("--ledger шлях до журналу, --no-ledger не записувати (тести й демо).");
    process.exit(1);
}
