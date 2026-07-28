import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import {
    equalTo,
    endAt,
    get,
    limitToLast,
    orderByChild,
    orderByKey,
    query,
    ref,
    set,
    startAt,
    update
} from "firebase/database";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rules = fs.readFileSync(path.join(projectRoot, "database.rules.json"), "utf8");
const projectId = "demo-nchm";
const requestIdA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const requestIdB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const payloadHashA = "a".repeat(64);
const payloadHashB = "b".repeat(64);
const date = "2026-07-24";
let environment;

function anonymousDb(uid = "anonymous-user") {
    return environment.authenticatedContext(uid, {
        firebase: { sign_in_provider: "anonymous" }
    }).database();
}

function adminDb() {
    return environment.authenticatedContext("admin-user", {
        email: "shneunggok@gmail.com",
        firebase: { sign_in_provider: "password" }
    }).database();
}

function requestClaim(uid, type, requestId, payloadHash, createdAt) {
    return {
        ownerUid: uid,
        type,
        payloadHash,
        date,
        status: "pending",
        createdAt
    };
}

function visitLog(uid, requestId, payloadHash, createdAt) {
    return {
        date,
        time: "10:30",
        name: "테스트",
        gender: "남",
        age: "청년(20~24세)",
        purposes: ["독서"],
        requestId,
        payloadHash,
        ownerUid: uid,
        createdAt
    };
}

before(async () => {
    environment = await initializeTestEnvironment({
        projectId,
        database: {
            host: "127.0.0.1",
            port: 9000,
            rules
        }
    });
});

beforeEach(async () => {
    await environment.clearDatabase();
});

after(async () => {
    await environment.cleanup();
});

test("the same visit request can be replayed without creating another log", async () => {
    const uid = "anonymous-user";
    const database = anonymousDb(uid);
    const createdAt = Date.now();
    await assertSucceeds(set(
        ref(database, `requestClaims/${requestIdA}`),
        requestClaim(uid, "visit", requestIdA, payloadHashA, createdAt)
    ));
    await assertSucceeds(update(ref(database, `requestClaims/${requestIdA}`), {
        status: "complete",
        completedAt: createdAt
    }));
    await assertSucceeds(update(ref(database, `requestClaims/${requestIdA}`), {
        status: "pending",
        completedAt: null
    }));

    const updates = {
        [`visitLogs/${requestIdA}-0`]: visitLog(uid, requestIdA, payloadHashA, createdAt),
        [`requestClaims/${requestIdA}/status`]: "complete",
        [`requestClaims/${requestIdA}/completedAt`]: createdAt
    };
    await assertSucceeds(update(ref(database), updates));
    const completedClaim = await assertSucceeds(get(ref(database, `requestClaims/${requestIdA}`)));
    assert.equal(completedClaim.val().status, "complete");

    const snapshot = await assertSucceeds(get(query(
        ref(database, "visitLogs"),
        orderByChild("date"),
        equalTo(date),
        limitToLast(100)
    )));
    assert.equal(snapshot.size, 1);
});

test("two users cannot reserve the same AR slot", async () => {
    const firstDb = anonymousDb("user-one");
    const secondDb = anonymousDb("user-two");
    const createdAt = Date.now();
    await set(
        ref(firstDb, `requestClaims/${requestIdA}`),
        requestClaim("user-one", "ar", requestIdA, payloadHashA, createdAt)
    );
    await set(
        ref(secondDb, `requestClaims/${requestIdB}`),
        requestClaim("user-two", "ar", requestIdB, payloadHashB, createdAt)
    );

    await assertSucceeds(set(ref(firstDb, "arSlotLocks/2026-07-24_10:00"), requestIdA));
    await assertFails(set(ref(secondDb, "arSlotLocks/2026-07-24_10:00"), requestIdB));
    const boundedLocks = await assertSucceeds(get(query(
        ref(firstDb, "arSlotLocks"),
        orderByKey(),
        startAt("2026-07-24_"),
        endAt("2026-07-24_\uf8ff"),
        limitToLast(50)
    )));
    assert.equal(boundedLocks.size, 1);
    await assertFails(get(ref(firstDb, "arSlotLocks")));
});

test("anonymous reads need a bounded date query while admins can read all", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
        await set(ref(context.database(), "visitLogs/legacy"), {
            date,
            time: "09:00",
            name: "기존",
            gender: "여",
            age: "성인(40세 이상)",
            purposes: ["휴식"]
        });
    });

    const database = anonymousDb();
    await assertFails(get(ref(database, "visitLogs")));
    const snapshot = await assertSucceeds(get(query(
        ref(database, "visitLogs"),
        orderByChild("date"),
        equalTo(date),
        limitToLast(100)
    )));
    assert.equal(snapshot.size, 1);
    await assertSucceeds(get(ref(adminDb(), "visitLogs")));
});

test("admin date-index query accepts the 401-record aggregation page size", async () => {
    const records = {};
    for (let index = 0; index < 410; index += 1) {
        records[`legacy-${String(index).padStart(4, "0")}`] = {
            date: index % 2 ? "2026-07-01" : "2026-07-31",
            time: "09:00",
            name: "기존",
            gender: "여",
            age: "성인(40세 이상)",
            purposes: ["휴식"]
        };
    }
    await environment.withSecurityRulesDisabled(async (context) => {
        await set(ref(context.database(), "visitLogs"), records);
    });

    const snapshot = await assertSucceeds(get(query(
        ref(adminDb(), "visitLogs"),
        orderByChild("date"),
        startAt("2026-07-01"),
        endAt("2026-07-31"),
        limitToLast(401)
    )));
    assert.equal(snapshot.size, 401);
});

test("malformed or unauthorized log writes are rejected and admin delete succeeds", async () => {
    const uid = "anonymous-user";
    const database = anonymousDb(uid);
    const createdAt = Date.now();
    await set(
        ref(database, `requestClaims/${requestIdA}`),
        requestClaim(uid, "visit", requestIdA, payloadHashA, createdAt)
    );
    const malformed = visitLog(uid, requestIdA, payloadHashA, createdAt);
    malformed.name = { unexpected: true };
    await assertFails(set(ref(database, `visitLogs/${requestIdA}-0`), malformed));

    const valid = visitLog(uid, requestIdA, payloadHashA, createdAt);
    await assertSucceeds(set(ref(database, `visitLogs/${requestIdA}-0`), valid));
    await assertFails(update(ref(database, `visitLogs/${requestIdA}-0`), { name: "변조" }));
    await assertSucceeds(set(ref(adminDb(), `visitLogs/${requestIdA}-0`), null));
});
