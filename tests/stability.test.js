const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const projectRoot = path.resolve(__dirname, "..");

function runScript(relativePath, contextValues = {}) {
    const context = vm.createContext({
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        ...contextValues
    });
    const source = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
    vm.runInContext(source, context, { filename: relativePath });
    return context;
}

function createDocumentStub() {
    const element = () => ({
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        style: { setProperty() {} },
        dataset: {},
        appendChild() {},
        querySelector() { return null; },
        querySelectorAll() { return []; }
    });
    return {
        createElement() {
            return {
                textContent: "",
                get innerHTML() { return this.textContent; }
            };
        },
        getElementById() { return element(); },
        querySelectorAll() { return []; }
    };
}

test("shared utilities reject impossible dates and normalize Firebase collections", () => {
    const context = runScript("js/utils.js", {
        document: createDocumentStub(),
        window: {},
        AGE_GROUPS: ["성인"],
        lucide: null
    });

    assert.equal(context.isValidDateKey("2024-02-29"), true);
    assert.equal(context.isValidDateKey("2025-02-29"), false);
    assert.equal(context.isValidDateKey("not-a-date"), false);
    assert.deepEqual(Array.from(context.toArray({ a: 1, b: 2 })), [1, 2]);
    assert.deepEqual(Array.from(context.toArray("invalid")), []);
});

test("multi-person visit submission uses one atomic root update", async () => {
    let updateCalls = 0;
    let receivedUpdates;
    const request = {
        requestId: "0123456789abcdef0123456789abcdef",
        payloadHash: "a".repeat(64),
        type: "visit",
        createdAt: 123
    };
    const context = runScript("js/visit.js", {
        auth: { currentUser: { uid: "anon-1" } },
        claimIdempotentRequest: async () => ({ createdAt: 123 }),
        isRequestComplete: async () => false,
        db: {
            ref() {
                return {
                    update(updates) {
                        updateCalls += 1;
                        receivedUpdates = updates;
                        return Promise.resolve();
                    }
                };
            }
        }
    });

    await context.saveVisitLogs([
        { name: "첫째", date: "2026-07-24" },
        { name: "둘째", date: "2026-07-24" }
    ], request);

    assert.equal(updateCalls, 1);
    assert.equal(receivedUpdates["visitLogs/0123456789abcdef0123456789abcdef-0"].name, "첫째");
    assert.equal(receivedUpdates["visitLogs/0123456789abcdef0123456789abcdef-1"].createdAt, 123);
    assert.equal(receivedUpdates["requestClaims/0123456789abcdef0123456789abcdef/status"], "complete");
});

test("a completed requestId returns success without writing the logs again", async () => {
    let updateCalls = 0;
    const request = {
        requestId: "0123456789abcdef0123456789abcdef",
        payloadHash: "a".repeat(64),
        type: "visit",
        createdAt: 123
    };
    const context = runScript("js/visit.js", {
        auth: { currentUser: { uid: "anon-1" } },
        claimIdempotentRequest: async () => ({ createdAt: 123, status: "complete" }),
        isRequestComplete: async () => true,
        db: { ref() { return { update() { updateCalls += 1; } }; } }
    });

    const result = await context.saveVisitLogs([
        { name: "재시도", date: "2026-07-24" }
    ], request);
    assert.equal(result.requestId, request.requestId);
    assert.equal(updateCalls, 0);
});

test("failed AR writes wait for slot-lock cleanup before allowing a retry", async () => {
    let releaseCleanup;
    const cleanupFinished = new Promise((resolve) => { releaseCleanup = resolve; });
    let transactionCalls = 0;
    const request = {
        requestId: "0123456789abcdef0123456789abcdef",
        payloadHash: "a".repeat(64),
        type: "ar",
        createdAt: 123
    };
    const context = runScript("js/ar.js", {
        auth: { currentUser: { uid: "anon-1" } },
        claimIdempotentRequest: async () => ({ createdAt: 123 }),
        isRequestComplete: async () => false,
        createSlotKey() { return "2026-07-24_10:00"; },
        logError() {},
        arSlotLocksRef: {
            child() {
                return {
                    transaction() {
                        transactionCalls += 1;
                        if (transactionCalls === 1) return Promise.resolve({ committed: true });
                        return cleanupFinished.then(() => ({ committed: true }));
                    }
                };
            }
        },
        db: {
            ref() {
                return {
                    update() {
                        return Promise.reject(Object.assign(new Error("write failed"), { code: "write_failed" }));
                    }
                };
            }
        }
    });

    let settled = false;
    const reservation = context.reserveSlotAndSaveArLog(
        "2026-07-24", "10:00", { users: [] }, request
    )
        .finally(() => { settled = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false);
    releaseCleanup();
    await assert.rejects(reservation, /write failed/);
    assert.equal(settled, true);
});

test("AR transaction rejects a simultaneous reservation for the same slot", async () => {
    const request = {
        requestId: "0123456789abcdef0123456789abcdef",
        payloadHash: "a".repeat(64),
        type: "ar",
        createdAt: 123
    };
    const context = runScript("js/ar.js", {
        auth: { currentUser: { uid: "anon-1" } },
        claimIdempotentRequest: async () => ({ createdAt: 123 }),
        isRequestComplete: async () => false,
        createSlotKey() { return "2026-07-24_10:00"; },
        logError() {},
        arSlotLocksRef: {
            child() {
                return {
                    transaction() { return Promise.resolve({ committed: false }); }
                };
            }
        },
        db: { ref() { return { update() { throw new Error("must not write"); } }; } }
    });

    await assert.rejects(
        context.reserveSlotAndSaveArLog("2026-07-24", "10:00", { users: [] }, request),
        (error) => error && error.code === "SLOT_TAKEN"
    );
});

test("standalone statistics skip malformed records instead of stopping the dashboard", () => {
    const context = runScript("admin-tool/modules/statistics.js", {
        window: {
            ADMIN_TOOL: {
                visitPurposes: ["독서", "스터디룸"],
                ageGroups: ["성인"]
            },
            AT_Utils: {
                toArray(value) {
                    if (Array.isArray(value)) return value;
                    if (value && typeof value === "object") return Object.values(value);
                    return [];
                },
                isValidDateKey(value) {
                    return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
                }
            }
        },
        document: createDocumentStub()
    });

    const visitStats = context.window.AT_Stats.computeVisitStats([
        { purposes: ["독서"], age: "성인", gender: "남" },
        { purposes: "잘못된 값", age: null, gender: null }
    ]);
    const arStats = context.window.AT_Stats.computeArStats([
        { users: { one: { age: "성인", gender: "여" }, broken: null } },
        { users: "잘못된 값" }
    ]);

    assert.equal(visitStats["독서"]["성인"]["남"], 1);
    assert.equal(arStats["AR 이용"]["성인"]["여"], 1);
});

test("TV attendance subscriptions are bounded to the selected event period", () => {
    const context = runScript("js/tv-attendance.js", {
        window: { setInterval, clearInterval },
        location: { search: "" },
        URLSearchParams,
        document: createDocumentStub(),
        formatLocalDate() { return "2026-07-24"; },
        isValidDateKey(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || ""); },
        escapeHtml(value) { return String(value || ""); }
    });
    const calls = [];
    const query = {
        orderByChild(key) { calls.push(["orderByChild", key]); return this; },
        startAt(value) { calls.push(["startAt", value]); return this; },
        endAt(value) { calls.push(["endAt", value]); return this; },
        limitToLast(value) { calls.push(["limitToLast", value]); return this; },
        on() { calls.push(["on"]); },
        off() { calls.push(["off"]); }
    };

    context.tvAttendanceState.events = {
        active: {
            type: "visit",
            enabled: true,
            startDate: "2026-07-01",
            endDate: "2026-07-31"
        }
    };
    context.subscribeAttendanceLogSource("visit", query);
    context.subscribeAttendanceLogSource("visit", query);

    assert.deepEqual(calls.slice(0, 5), [
        ["orderByChild", "date"],
        ["startAt", "2026-07-01"],
        ["endAt", "2026-07-31"],
        ["limitToLast", 5000],
        ["on"]
    ]);
    assert.equal(context.getAttendanceEventStatus({ startDate: "2026-07-25" }, "2026-07-24"), "upcoming");
    assert.equal(context.getAttendanceEventStatus({ startDate: "2026-07-01", endDate: "2026-07-31" }, "2026-07-24"), "active");
    assert.equal(context.getAttendanceEventStatus({ startDate: "2026-06-01", endDate: "2026-06-30" }, "2026-07-24"), "ended");
    assert.equal(calls.filter(([name]) => name === "on").length, 1);
    context.unsubscribeAttendanceBoards();
    assert.equal(calls.filter(([name]) => name === "off").length, 1);
});

test("pending requests reuse the same requestId across retries and separate dates", async () => {
    let stored = "";
    const context = runScript("js/requests.js", {
        TextEncoder,
        Date,
        window: {
            crypto: webcrypto,
            TextEncoder,
            navigator: {
                locks: {
                    request(_name, callback) { return Promise.resolve().then(callback); }
                }
            },
            localStorage: {
                getItem() { return stored || null; },
                setItem(_key, value) { stored = value; }
            }
        },
        logError() {}
    });

    const first = await context.preparePersistentRequest("visit", {
        date: "2026-07-24",
        logs: [{ name: "동일 요청", date: "2026-07-24" }]
    });
    const retry = await context.preparePersistentRequest("visit", {
        logs: [{ date: "2026-07-24", name: "동일 요청" }],
        date: "2026-07-24"
    });
    const nextDay = await context.preparePersistentRequest("visit", {
        date: "2026-07-25",
        logs: [{ name: "동일 요청", date: "2026-07-25" }]
    });

    assert.equal(first.requestId, retry.requestId);
    assert.notEqual(first.requestId, nextDay.requestId);
    context.completePersistentRequest(first.requestId);
    assert.equal(context.readPendingRequests().length, 1);
});

function createFirebasePageRef(records, options = {}) {
    return {
        orderByChild() {
            const state = { start: null, end: null, endKey: null, limit: null };
            const query = {
                startAt(value) { state.start = value; return query; },
                endAt(value, key) { state.end = value; state.endKey = key || null; return query; },
                limitToLast(value) { state.limit = value; return query; },
                once() {
                    if (options.onRead) options.onRead({ ...state });
                    let result = records.filter((record) => {
                        if (state.start && record.date < state.start) return false;
                        if (state.end && (record.date > state.end ||
                            (record.date === state.end && state.endKey && record._key > state.endKey))) return false;
                        return true;
                    });
                    if (state.limit) result = result.slice(-state.limit);
                    return Promise.resolve({
                        forEach(callback) {
                            result.forEach((record) => callback({
                                key: record._key,
                                val() {
                                    const { _key, ...value } = record;
                                    return value;
                                }
                            }));
                        }
                    });
                }
            };
            return query;
        }
    };
}

test("admin pagination keeps thousands of records out of memory and has no page overlap", async () => {
    const elements = new Map();
    const getElement = (id) => {
        if (!elements.has(id)) elements.set(id, { textContent: "", disabled: false });
        return elements.get(id);
    };
    const records = Array.from({ length: 5000 }, (_, index) => ({
        _key: `log-${String(index).padStart(5, "0")}`,
        date: `2026-07-${String(1 + (index % 24)).padStart(2, "0")}`,
        value: index
    })).sort((a, b) => a.date.localeCompare(b.date) || a._key.localeCompare(b._key));
    let dashboardUpdates = 0;
    const context = runScript("js/admin-data.js", {
        visitLogsRef: createFirebasePageRef(records),
        arLogsRef: createFirebasePageRef([]),
        visitLogs: [],
        arLogs: [],
        currentFilter: "all",
        dom: {},
        document: { getElementById: getElement },
        isAdminUser: true,
        updateAdminDashboard() { dashboardUpdates += 1; },
        showMessage() {},
        logError() {},
        formatLocalDate() { return "2026-07-31"; },
        isValidDateKey() { return true; }
    });

    await context.loadAdminLogPage("visit", { reset: true });
    const firstPageKeys = Array.from(context.visitLogs, (record) => record._key);
    assert.equal(firstPageKeys.length, 100);
    await context.moveAdminLogPage("visit", "next");
    const secondPageKeys = Array.from(context.visitLogs, (record) => record._key);
    assert.equal(secondPageKeys.length, 100);
    assert.equal(firstPageKeys.some((key) => secondPageKeys.includes(key)), false);
    assert.equal(dashboardUpdates, 2);
    assert.match(getElement("visit-page-status").textContent, /^2페이지 · 현재 100건$/);
});

test("an older admin response cannot overwrite a newer search result", async () => {
    const pending = [];
    const snapshot = (key) => ({
        forEach(callback) {
            callback({ key, val: () => ({ date: "2026-07-24", name: key }) });
        }
    });
    const refWithDeferredReads = {
        orderByChild() {
            return {
                limitToLast() { return this; },
                once() {
                    return new Promise((resolve, reject) => pending.push({ resolve, reject }));
                }
            };
        }
    };
    const elements = new Map();
    const context = runScript("js/admin-data.js", {
        visitLogsRef: refWithDeferredReads,
        arLogsRef: createFirebasePageRef([]),
        visitLogs: [],
        arLogs: [],
        currentFilter: "all",
        dom: {},
        document: {
            getElementById(id) {
                if (!elements.has(id)) elements.set(id, { textContent: "", disabled: false });
                return elements.get(id);
            }
        },
        isAdminUser: true,
        updateAdminDashboard() {},
        showMessage() {},
        logError() {},
        formatLocalDate() { return "2026-07-31"; },
        isValidDateKey() { return true; }
    });

    const oldRequest = context.loadAdminLogPage("visit", { reset: true });
    const newRequest = context.loadAdminLogPage("visit", { reset: true });
    pending[1].resolve(snapshot("new-result"));
    await newRequest;
    pending[0].resolve(snapshot("old-result"));
    await oldRequest;
    assert.equal(context.visitLogs[0]._key, "new-result");

    const retryRequest = context.loadAdminLogPage("visit", { reset: true });
    pending[2].reject(new Error("network failure"));
    await retryRequest;
    const successfulRetry = context.loadAdminLogPage("visit", { reset: true });
    pending[3].resolve(snapshot("retried-result"));
    await successfulRetry;
    assert.equal(context.visitLogs[0]._key, "retried-result");
});

function createSessionStorageStub() {
    const values = new Map();
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); }
    };
}

function createAdminStatsTestContext(options = {}) {
    const elements = new Map();
    const messages = [];
    const getElement = (id) => {
        if (!elements.has(id)) {
            elements.set(id, {
                textContent: "",
                innerText: "",
                disabled: false,
                dataset: {}
            });
        }
        return elements.get(id);
    };
    const dom = {
        startDate: { value: options.start || "2026-07-01" },
        endDate: { value: options.end || "2026-07-31" },
        filterYearSelect: { value: "2026" },
        filterMonthSelect: { value: "6" }
    };
    const context = runScript("js/admin-data.js", {
        visitLogsRef: options.visitRef || createFirebasePageRef(options.visits || [], {
            onRead: options.onVisitRead
        }),
        arLogsRef: options.arRef || createFirebasePageRef(options.ars || [], {
            onRead: options.onArRead
        }),
        visitLogs: [],
        arLogs: [],
        currentFilter: options.filter || "custom",
        dom,
        document: { getElementById: getElement },
        sessionStorage: options.sessionStorage || createSessionStorageStub(),
        isAdminUser: true,
        AGE_GROUPS: ["초등(9~13세)", "성인(40세 이상)"],
        PURPOSES: ["휴식", "독서", "스터디룸"],
        toArray(value) {
            if (Array.isArray(value)) return value;
            if (value && typeof value === "object") return Object.values(value);
            return [];
        },
        updateAdminDashboard() {},
        showMessage(message) { messages.push(message); },
        logError() {},
        formatLocalDate(date = new Date()) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
        },
        isValidDateKey(value) {
            return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
        }
    });
    return { context, elements, messages, dom };
}

function visitStatsRecord(index, overrides = {}) {
    return {
        _key: `visit-${String(index).padStart(5, "0")}`,
        date: "2026-07-15",
        age: "성인(40세 이상)",
        gender: index % 2 ? "여" : "남",
        purposes: ["독서"],
        ...overrides
    };
}

function arStatsRecord(index, userCount = 1, overrides = {}) {
    return {
        _key: `ar-${String(index).padStart(5, "0")}`,
        date: "2026-07-15",
        users: Array.from({ length: userCount }, (_, userIndex) => ({
            name: `이용자${userIndex}`,
            age: "성인(40세 이상)",
            gender: userIndex % 2 ? "여" : "남"
        })),
        ...overrides
    };
}

test("whole-period aggregation handles 0, 1, 100, and 101 records", async (t) => {
    for (const count of [0, 1, 100, 101]) {
        await t.test(`${count} records`, async () => {
            const { context } = createAdminStatsTestContext({
                visits: Array.from({ length: count }, (_, index) => visitStatsRecord(index)),
                ars: Array.from({ length: count }, (_, index) => arStatsRecord(index, 2))
            });
            assert.equal(await context.reloadAdminStatistics(), true);
            assert.equal(context.getAdminPeriodAggregate("visit").recordCount, count);
            assert.equal(context.getAdminPeriodAggregate("visit").peopleCount, count);
            assert.equal(context.getAdminPeriodAggregate("ar").recordCount, count);
            assert.equal(context.getAdminPeriodAggregate("ar").peopleCount, count * 2);
        });
    }
});

test("more than 500 records are aggregated without expanding the 100-row detail page", async () => {
    let visitReads = 0;
    const visits = Array.from({ length: 1001 }, (_, index) =>
        visitStatsRecord(index, { purposes: ["독서", "휴식"] })
    );
    const { context } = createAdminStatsTestContext({
        visits,
        onVisitRead() { visitReads += 1; }
    });

    await context.reloadAdminPages();
    const aggregate = context.getAdminPeriodAggregate("visit");
    assert.equal(aggregate.recordCount, 1001);
    assert.equal(aggregate.peopleCount, 1001);
    assert.equal(aggregate.purposeSelectionCount, 2002);
    assert.equal(context.visitLogs.length, 100);
    assert.ok(visitReads >= 4, "one detail read plus at least three aggregate reads");
});

test("visit purpose selections and AR users are counted separately from records", async () => {
    const visits = [
        visitStatsRecord(1, { purposes: ["독서", "스터디룸"] }),
        visitStatsRecord(2, { purposes: ["휴식"] })
    ];
    const ars = [
        arStatsRecord(1, 3),
        arStatsRecord(2, 1)
    ];
    const { context } = createAdminStatsTestContext({ visits, ars });

    await context.reloadAdminStatistics();
    const visit = context.getAdminPeriodAggregate("visit");
    const ar = context.getAdminPeriodAggregate("ar");
    assert.equal(visit.recordCount, 2);
    assert.equal(visit.peopleCount, 2);
    assert.equal(visit.purposeSelectionCount, 3);
    assert.equal(visit.studyStats["스터디룸"]["성인(40세 이상)"]["여"], 1);
    assert.equal(ar.recordCount, 2);
    assert.equal(ar.peopleCount, 4);
});

test("same-day ranges include both date boundaries and exclude neighboring dates", async () => {
    const visits = [
        visitStatsRecord(1, { date: "2026-07-14" }),
        visitStatsRecord(2, { date: "2026-07-15" }),
        visitStatsRecord(3, { date: "2026-07-15" }),
        visitStatsRecord(4, { date: "2026-07-16" })
    ];
    const { context } = createAdminStatsTestContext({
        visits,
        start: "2026-07-15",
        end: "2026-07-15"
    });
    await context.reloadAdminStatistics();
    assert.equal(context.getAdminPeriodAggregate("visit").recordCount, 2);
});

test("identical period queries use aggregate-only session cache and invalidation is type-specific", async () => {
    let visitReads = 0;
    let arReads = 0;
    const { context, elements } = createAdminStatsTestContext({
        visits: [visitStatsRecord(1)],
        ars: [arStatsRecord(1, 2)],
        onVisitRead() { visitReads += 1; },
        onArRead() { arReads += 1; }
    });

    await context.reloadAdminStatistics();
    const firstReadCounts = { visitReads, arReads };
    await context.reloadAdminStatistics();
    assert.deepEqual({ visitReads, arReads }, firstReadCounts);
    assert.match(elements.get("admin-stats-status").textContent, /세션 캐시 사용/);

    context.invalidateAdminStatsCache("visit");
    await context.reloadAdminStatistics();
    assert.ok(visitReads > firstReadCounts.visitReads);
    assert.equal(arReads, firstReadCounts.arReads);
});

function createDeferredStatsRef(firstRecords, laterRecords) {
    let readCount = 0;
    let resolveFirst;
    const firstRead = new Promise((resolve) => { resolveFirst = resolve; });
    const snapshot = (records) => ({
        forEach(callback) {
            records.forEach((record) => callback({
                key: record._key,
                val() {
                    const { _key, ...value } = record;
                    return value;
                }
            }));
        }
    });
    return {
        ref: {
            orderByChild() {
                const query = {
                    startAt() { return query; },
                    endAt() { return query; },
                    limitToLast() { return query; },
                    once() {
                        readCount += 1;
                        return readCount === 1
                            ? firstRead
                            : Promise.resolve(snapshot(laterRecords));
                    }
                };
                return query;
            }
        },
        resolveFirst() { resolveFirst(snapshot(firstRecords)); },
        getReadCount() { return readCount; }
    };
}

test("repeated clicks for the same in-flight range do not start duplicate aggregate reads", async () => {
    const visitDeferred = createDeferredStatsRef(
        [visitStatsRecord(1)],
        [visitStatsRecord(2)]
    );
    const arDeferred = createDeferredStatsRef(
        [arStatsRecord(1)],
        [arStatsRecord(2)]
    );
    const { context } = createAdminStatsTestContext({
        visitRef: visitDeferred.ref,
        arRef: arDeferred.ref
    });

    const firstRequest = context.reloadAdminStatistics();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(await context.reloadAdminStatistics(), false);
    assert.equal(visitDeferred.getReadCount(), 1);
    assert.equal(arDeferred.getReadCount(), 1);
    visitDeferred.resolveFirst();
    arDeferred.resolveFirst();
    assert.equal(await firstRequest, true);
});

test("a changed date range prevents older aggregate responses from overwriting the screen", async () => {
    const visitDeferred = createDeferredStatsRef(
        Array.from({ length: 5 }, (_, index) => visitStatsRecord(index)),
        [visitStatsRecord(100)]
    );
    const arDeferred = createDeferredStatsRef(
        Array.from({ length: 4 }, (_, index) => arStatsRecord(index)),
        [arStatsRecord(100), arStatsRecord(101)]
    );
    const { context, dom } = createAdminStatsTestContext({
        visitRef: visitDeferred.ref,
        arRef: arDeferred.ref,
        start: "2026-07-01",
        end: "2026-07-01"
    });

    const oldRequest = context.reloadAdminStatistics();
    await new Promise((resolve) => setImmediate(resolve));
    dom.startDate.value = "2026-07-02";
    dom.endDate.value = "2026-07-02";
    const newRequest = context.reloadAdminStatistics();
    await newRequest;
    visitDeferred.resolveFirst();
    arDeferred.resolveFirst();
    await oldRequest;

    assert.equal(context.getAdminPeriodAggregate("visit").recordCount, 1);
    assert.equal(context.getAdminPeriodAggregate("ar").recordCount, 2);
});

function createFailOncePageRef(records) {
    const base = createFirebasePageRef(records);
    let shouldFail = true;
    return {
        orderByChild() {
            const query = base.orderByChild("date");
            const originalOnce = query.once.bind(query);
            query.once = () => {
                if (shouldFail) {
                    shouldFail = false;
                    return Promise.reject(new Error("network failure"));
                }
                return originalOnce();
            };
            return query;
        }
    };
}

test("a failed aggregate query exits loading state and can be retried", async () => {
    const { context, elements, messages } = createAdminStatsTestContext({
        visitRef: createFailOncePageRef([visitStatsRecord(1)]),
        ars: [arStatsRecord(1)]
    });

    assert.equal(await context.reloadAdminStatistics(), false);
    assert.match(elements.get("admin-stats-status").textContent, /다시 시도/);
    assert.ok(messages.some((message) => message.includes("다시 눌러")));

    assert.equal(await context.reloadAdminStatistics(), true);
    assert.equal(context.getAdminPeriodAggregate("visit").recordCount, 1);
});
