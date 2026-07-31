import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    deleteApp,
    initializeApp
} from "firebase/app";
import {
    connectAuthEmulator,
    createUserWithEmailAndPassword,
    getAuth,
    signInAnonymously,
    signOut
} from "firebase/auth";
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import {
    connectDatabaseEmulator,
    equalTo,
    endAt,
    get,
    getDatabase,
    goOffline,
    limitToLast,
    orderByChild,
    orderByKey,
    query,
    ref,
    runTransaction,
    serverTimestamp,
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

function arLog(uid, requestId, payloadHash, createdAt, timeSlot = "10:00", users = [{
    name: "테스트",
    gender: "남",
    age: "청년(20~24세)"
}]) {
    return {
        date,
        timeSlot,
        users,
        slotKey: `${date}_${timeSlot}`,
        requestId,
        payloadHash,
        ownerUid: uid,
        createdAt
    };
}

function claimRequest(database, uid, requestId, payloadHash, type = "visit") {
    return runTransaction(ref(database, `requestClaims/${requestId}`), (current) => {
        if (current === null) {
            return {
                ownerUid: uid,
                type,
                payloadHash,
                date,
                status: "pending",
                createdAt: serverTimestamp()
            };
        }
        if (current.ownerUid === uid
            && current.type === type
            && current.payloadHash === payloadHash) {
            return current;
        }
        return;
    }, { applyLocally: false });
}

async function reserveArRequest(database, uid, requestId, payloadHash, options = {}) {
    let stage = "requestClaims";
    const timeSlot = options.timeSlot || "10:00";
    const log = arLog(uid, requestId, payloadHash, 0, timeSlot, options.users);
    const claimResult = await claimRequest(database, uid, requestId, payloadHash, "ar");
    if (!claimResult.committed) {
        const error = new Error("REQUEST_ID_CONFLICT");
        error.code = "REQUEST_ID_CONFLICT";
        error.stage = stage;
        throw error;
    }
    const claim = (await get(ref(database, `requestClaims/${requestId}`))).val();
    if (claim.status === "complete") {
        return { requestId, claim, log: null, replayed: true };
    }

    stage = "arSlotLocks";
    const lockRef = ref(database, `arSlotLocks/${log.slotKey}`);
    const lockResult = await runTransaction(lockRef, (current) => {
        if (current === null) return requestId;
        if (current === requestId) return current;
        return;
    }, { applyLocally: false });
    if (!lockResult.committed) {
        const error = new Error("SLOT_TAKEN");
        error.code = "SLOT_TAKEN";
        error.stage = stage;
        throw error;
    }

    stage = "arLogs";
    log.createdAt = claim.createdAt;
    try {
        await update(ref(database), {
            [`arLogs/${requestId}`]: log,
            [`arSlotLocks/${log.slotKey}`]: requestId,
            [`requestClaims/${requestId}/status`]: "complete",
            [`requestClaims/${requestId}/completedAt`]: claim.createdAt
        });
    } catch (error) {
        await runTransaction(lockRef, (current) => current === requestId ? null : current);
        error.stage = stage;
        throw error;
    }
    return { requestId, claim, log, replayed: false };
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

test("a real claim transaction completes a visit write and retries without a duplicate", async () => {
    const uid = "anonymous-user";
    const database = anonymousDb(uid);
    const claimResult = await assertSucceeds(
        claimRequest(database, uid, requestIdA, payloadHashA)
    );
    assert.equal(claimResult.committed, true);
    const claim = (await assertSucceeds(
        get(ref(database, `requestClaims/${requestIdA}`))
    )).val();
    assert.equal(claim.ownerUid, uid);
    assert.equal(claim.status, "pending");
    assert.equal(typeof claim.createdAt, "number");

    const updates = {
        [`visitLogs/${requestIdA}-0`]: visitLog(uid, requestIdA, payloadHashA, claim.createdAt),
        [`requestClaims/${requestIdA}/status`]: "complete",
        [`requestClaims/${requestIdA}/completedAt`]: claim.createdAt
    };
    await assertSucceeds(update(ref(database), updates));
    const retryResult = await assertSucceeds(
        claimRequest(database, uid, requestIdA, payloadHashA)
    );
    assert.equal(retryResult.snapshot.val().status, "complete");

    const completedClaim = await assertSucceeds(get(ref(database, `requestClaims/${requestIdA}`)));
    assert.equal(completedClaim.val().status, "complete");
    assert.equal((await assertSucceeds(get(ref(adminDb(), `requestClaims/${requestIdA}`)))).val().ownerUid, uid);

    const snapshot = await assertSucceeds(get(query(
        ref(database, "visitLogs"),
        orderByChild("date"),
        equalTo(date),
        limitToLast(100)
    )));
    assert.equal(snapshot.size, 1);
});

test("claim transactions keep unauthenticated and cross-owner access blocked", async () => {
    const ownerUid = "claim-owner";
    const ownerDatabase = anonymousDb(ownerUid);
    const attackerDatabase = anonymousDb("claim-attacker");
    const unauthenticatedDatabase = environment.unauthenticatedContext().database();

    await assertFails(get(ref(unauthenticatedDatabase, `requestClaims/${requestIdA}`)));
    await assertFails(claimRequest(unauthenticatedDatabase, "not-authenticated", requestIdA, payloadHashA));
    await assertFails(runTransaction(
        ref(attackerDatabase, `requestClaims/${requestIdB}`),
        () => requestClaim(ownerUid, "visit", requestIdB, payloadHashB, serverTimestamp()),
        { applyLocally: false }
    ));
    await assertFails(set(ref(attackerDatabase, `requestClaims/${requestIdB}`), {
        ...requestClaim("claim-attacker", "visit", requestIdB, payloadHashB, Date.now()),
        unexpected: true
    }));

    await assertSucceeds(claimRequest(ownerDatabase, ownerUid, requestIdA, payloadHashA));
    await assertFails(get(ref(attackerDatabase, `requestClaims/${requestIdA}`)));
    await assertFails(set(ref(attackerDatabase, `requestClaims/${requestIdA}`), null));
    await assertFails(update(ref(attackerDatabase, `requestClaims/${requestIdA}`), { status: "complete" }));
    await assertFails(update(ref(ownerDatabase, `requestClaims/${requestIdA}`), { ownerUid: "claim-attacker" }));
    await assertFails(update(ref(ownerDatabase, `requestClaims/${requestIdA}`), { unexpected: true }));
    await assertFails(set(ref(ownerDatabase, `requestClaims/${requestIdA}`), null));
    await assertFails(get(ref(ownerDatabase, "requestClaims")));

    const adminSnapshot = await assertSucceeds(get(ref(adminDb(), `requestClaims/${requestIdA}`)));
    assert.equal(adminSnapshot.val().ownerUid, ownerUid);
});

test("two users racing for one requestId produce one owner and one visit log", async () => {
    const firstUid = "race-first";
    const secondUid = "race-second";
    const firstDatabase = anonymousDb(firstUid);
    const secondDatabase = anonymousDb(secondUid);
    const attempts = await Promise.allSettled([
        claimRequest(firstDatabase, firstUid, requestIdA, payloadHashA),
        claimRequest(secondDatabase, secondUid, requestIdA, payloadHashB)
    ]);
    const successes = attempts.filter((attempt) =>
        attempt.status === "fulfilled" && attempt.value.committed
    );
    const failures = attempts.filter((attempt) =>
        attempt.status === "rejected" || !attempt.value.committed
    );
    assert.equal(successes.length, 1);
    assert.equal(failures.length, 1);

    const claimSnapshot = await assertSucceeds(get(ref(adminDb(), `requestClaims/${requestIdA}`)));
    const claim = claimSnapshot.val();
    const winnerUid = claim.ownerUid;
    const winnerHash = winnerUid === firstUid ? payloadHashA : payloadHashB;
    const loserUid = winnerUid === firstUid ? secondUid : firstUid;
    const loserHash = winnerUid === firstUid ? payloadHashB : payloadHashA;
    const winnerDatabase = winnerUid === firstUid ? firstDatabase : secondDatabase;
    const loserDatabase = winnerUid === firstUid ? secondDatabase : firstDatabase;

    assert.ok([firstUid, secondUid].includes(winnerUid));
    await assertFails(set(
        ref(loserDatabase, `visitLogs/${requestIdA}-loser`),
        visitLog(loserUid, requestIdA, loserHash, claim.createdAt)
    ));

    await assertSucceeds(update(ref(winnerDatabase), {
        [`visitLogs/${requestIdA}-0`]: visitLog(winnerUid, requestIdA, winnerHash, claim.createdAt),
        [`requestClaims/${requestIdA}/status`]: "complete",
        [`requestClaims/${requestIdA}/completedAt`]: claim.createdAt
    }));
    await assertSucceeds(claimRequest(winnerDatabase, winnerUid, requestIdA, winnerHash));

    const finalClaim = (await assertSucceeds(get(ref(adminDb(), `requestClaims/${requestIdA}`)))).val();
    assert.equal(finalClaim.ownerUid, winnerUid);
    const logs = await assertSucceeds(get(query(
        ref(adminDb(), "visitLogs"),
        orderByChild("requestId"),
        equalTo(requestIdA),
        limitToLast(10)
    )));
    assert.equal(logs.size, 1);
});

test("the real AR claim, slot transaction, and atomic log flow succeeds", async () => {
    const database = anonymousDb("ar-user");
    const result = await reserveArRequest(
        database,
        "ar-user",
        requestIdA,
        payloadHashA,
        {
            users: [
                { name: "첫째", gender: "남", age: "청년(20~24세)" },
                { name: "둘째", gender: "여", age: "성인(40세 이상)" }
            ]
        }
    );
    assert.equal(result.replayed, false);
    const claim = (await assertSucceeds(get(ref(adminDb(), `requestClaims/${requestIdA}`)))).val();
    const savedLog = (await assertSucceeds(get(ref(adminDb(), `arLogs/${requestIdA}`)))).val();
    assert.equal(claim.status, "complete");
    assert.equal(savedLog.users.length, 2);
    assert.equal(savedLog.createdAt, claim.createdAt);
    assert.equal((await assertSucceeds(get(ref(adminDb(), `arSlotLocks/${date}_10:00`)))).val(), requestIdA);
    const todaySchedule = await assertSucceeds(get(query(
        ref(database, "arLogs"),
        orderByChild("date"),
        equalTo(date),
        limitToLast(50)
    )));
    assert.equal(todaySchedule.size, 1);

    const replay = await reserveArRequest(database, "ar-user", requestIdA, payloadHashA);
    assert.equal(replay.replayed, true);
    const logs = await assertSucceeds(get(query(
        ref(adminDb(), "arLogs"),
        orderByChild("requestId"),
        equalTo(requestIdA),
        limitToLast(10)
    )));
    assert.equal(logs.size, 1);
});

test("two users cannot reserve the same AR slot through the real flow", async () => {
    const firstDb = anonymousDb("user-one");
    const secondDb = anonymousDb("user-two");
    const attempts = await Promise.allSettled([
        reserveArRequest(firstDb, "user-one", requestIdA, payloadHashA),
        reserveArRequest(secondDb, "user-two", requestIdB, payloadHashB)
    ]);
    const successes = attempts.filter((attempt) => attempt.status === "fulfilled");
    const failures = attempts.filter((attempt) => attempt.status === "rejected");
    assert.equal(successes.length, 1);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].reason.code, "SLOT_TAKEN");
    assert.equal(failures[0].reason.stage, "arSlotLocks");
    
    const winnerId = successes[0].value.requestId;
    const loserId = winnerId === requestIdA ? requestIdB : requestIdA;
    assert.equal((await assertSucceeds(get(ref(adminDb(), `arSlotLocks/${date}_10:00`)))).val(), winnerId);
    assert.equal((await assertSucceeds(get(ref(firstDb, `arSlotLocks/${date}_10:00`)))).val(), winnerId);
    await assertFails(get(ref(environment.unauthenticatedContext().database(), `arSlotLocks/${date}_10:00`)));
    assert.equal((await assertSucceeds(get(ref(adminDb(), `arLogs/${winnerId}`)))).exists(), true);
    assert.equal((await assertSucceeds(get(ref(adminDb(), `arLogs/${loserId}`)))).exists(), false);
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

test("a rejected AR log releases only its own lock and allows a later reservation", async () => {
    const database = anonymousDb("invalid-ar-user");
    await assert.rejects(
        reserveArRequest(database, "invalid-ar-user", requestIdA, payloadHashA, {
            users: [{ name: { invalid: true }, gender: "남", age: "청년(20~24세)" }]
        }),
        (error) => error?.stage === "arLogs"
    );
    assert.equal((await assertSucceeds(get(ref(adminDb(), `arSlotLocks/${date}_10:00`)))).exists(), false);
    assert.equal((await assertSucceeds(get(ref(adminDb(), `arLogs/${requestIdA}`)))).exists(), false);

    const retryDatabase = anonymousDb("retry-ar-user");
    await reserveArRequest(retryDatabase, "retry-ar-user", requestIdB, payloadHashB);
    assert.equal((await assertSucceeds(get(ref(adminDb(), `arSlotLocks/${date}_10:00`)))).val(), requestIdB);
    assert.equal((await assertSucceeds(get(ref(adminDb(), `arLogs/${requestIdB}`)))).exists(), true);
});

test("real auth transition restores anonymous access to the bounded reservation query", async () => {
    const app = initializeApp({
        apiKey: "demo-api-key",
        authDomain: `${projectId}.firebaseapp.com`,
        databaseURL: `https://${projectId}.firebaseio.com`,
        projectId
    }, `auth-transition-${Date.now()}`);
    const auth = getAuth(app);
    const database = getDatabase(app);
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectDatabaseEmulator(database, "127.0.0.1", 9000);
    const reservationQuery = () => query(
        ref(database, "arSlotLocks"),
        orderByKey(),
        startAt(`${date}_`),
        endAt(`${date}_\uf8ff`),
        limitToLast(50)
    );

    try {
        const initialAnonymous = await signInAnonymously(auth);
        assert.equal(initialAnonymous.user.isAnonymous, true);
        await assertSucceeds(get(reservationQuery()));

        await signOut(auth);
        await assertFails(get(reservationQuery()));

        const admin = await createUserWithEmailAndPassword(
            auth,
            "shneunggok@gmail.com",
            "emulator-admin-password"
        );
        assert.equal(admin.user.isAnonymous, false);
        await signOut(auth);

        const restoredAnonymous = await signInAnonymously(auth);
        assert.equal(restoredAnonymous.user.isAnonymous, true);
        await assertSucceeds(get(reservationQuery()));
        const reservation = await reserveArRequest(
            database,
            restoredAnonymous.user.uid,
            requestIdA,
            payloadHashA,
            { timeSlot: "11:00" }
        );
        assert.equal(reservation.replayed, false);
        assert.equal((await assertSucceeds(get(ref(database, `requestClaims/${requestIdA}`)))).val().status, "complete");
    } finally {
        if (auth.currentUser) {
            await signOut(auth);
        }
        goOffline(database);
        await deleteApp(app);
    }
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

test("admin createdAt index query keeps timestamp boundaries, key ties, and legacy lookup", async () => {
    const start = new Date(2026, 6, 15, 0, 0, 0, 0).getTime();
    const sameTime = new Date(2026, 6, 15, 10, 5, 0, 0).getTime();
    const end = new Date(2026, 6, 15, 23, 59, 59, 999).getTime();
    await environment.withSecurityRulesDisabled(async (context) => {
        await set(ref(context.database(), "visitLogs"), {
            before: { date: "2026-07-14", createdAt: start - 1 },
            "at-start": { date: "2026-07-15", createdAt: start },
            "same-a": { date: "2026-07-15", createdAt: sameTime },
            "same-b": { date: "2026-07-15", createdAt: sameTime },
            latest: { date: "2026-07-15", createdAt: end - 1 },
            "at-end": { date: "2026-07-15", createdAt: end },
            after: { date: "2026-07-16", createdAt: end + 1 },
            legacy: { date: "2026-07-15", time: "09:05" }
        });
    });

    const createdAtAdminDatabase = adminDb();
    const boundedQuery = query(
        ref(createdAtAdminDatabase, "visitLogs"),
        orderByChild("createdAt"),
        startAt(start),
        endAt(end),
        limitToLast(100)
    );
    const snapshot = await assertSucceeds(get(boundedQuery));
    const keys = [];
    snapshot.forEach((child) => {
        keys.push(child.key);
    });
    assert.deepEqual(keys, ["at-start", "same-a", "same-b", "latest", "at-end"]);

    const cursorSnapshot = await assertSucceeds(get(query(
        ref(createdAtAdminDatabase, "visitLogs"),
        orderByChild("createdAt"),
        startAt(start),
        endAt(sameTime, "same-b"),
        limitToLast(3)
    )));
    const cursorKeys = [];
    cursorSnapshot.forEach((child) => {
        cursorKeys.push(child.key);
    });
    assert.deepEqual(cursorKeys, ["at-start", "same-a", "same-b"]);

    const legacySnapshot = await assertSucceeds(get(query(
        ref(createdAtAdminDatabase, "visitLogs"),
        orderByChild("createdAt"),
        equalTo(null)
    )));
    assert.deepEqual(Object.keys(legacySnapshot.val()), ["legacy"]);
    await assertFails(get(query(
        ref(anonymousDb(), "visitLogs"),
        orderByChild("createdAt"),
        startAt(start),
        endAt(end),
        limitToLast(100)
    )));
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
