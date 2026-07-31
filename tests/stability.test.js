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
    assert.equal(context.escapeCsvCell('쉼표,줄바꿈\n"따옴표"'), '"쉼표,줄바꿈\n""따옴표"""');
    assert.deepEqual(
        Array.from(context.getArOperatingSchedule(new Date(2026, 6, 31)).slots, (slot) => slot.time),
        [
            "10:00", "10:30", "11:00", "11:30", "13:00", "13:30",
            "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
            "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00"
        ]
    );
    assert.deepEqual(
        Array.from(context.getArOperatingSchedule(new Date(2026, 7, 1)).slots, (slot) => slot.time),
        [
            "10:00", "10:30", "11:00", "11:30", "13:00", "13:30",
            "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"
        ]
    );
    assert.equal(context.getArTimeMinutes("9:00"), 540);
    assert.equal(context.getArTimeMinutes("10:00"), 600);
    assert.equal(context.getArTimeMinutes("25:00"), null);
    assert.equal(context.normalizeArTimeSlot("9:00"), "09:00");
    assert.equal(context.normalizeArTimeSlot("10:30"), "10:30");
    assert.equal(context.normalizeArTimeSlot("invalid"), "");
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

test("request claim permission conflicts and network errors have distinct user messages", async () => {
    const context = runScript("js/requests.js", {
        window: {},
        auth: { currentUser: { uid: "anon-1" } },
        db: {
            ref() {
                return {
                    transaction() {
                        return Promise.reject(Object.assign(
                            new Error("permission_denied"),
                            { code: "PERMISSION_DENIED" }
                        ));
                    }
                };
            }
        },
        firebase: { database: { ServerValue: { TIMESTAMP: 123 } } }
    });
    const request = {
        requestId: "0123456789abcdef0123456789abcdef",
        payloadHash: "a".repeat(64),
        type: "visit",
        payload: { date: "2026-07-28" }
    };

    await assert.rejects(
        context.claimIdempotentRequest(request),
        (error) => error?.code === "REQUEST_ID_CONFLICT"
    );
    assert.equal(
        context.requestSaveErrorMessage({ code: "REQUEST_ID_CONFLICT" }),
        "이미 처리된 요청입니다. 새로고침 후 다시 시도해 주세요."
    );
    assert.equal(
        context.requestSaveErrorMessage({ code: "NETWORK_ERROR" }),
        "네트워크 연결이 불안정합니다. 연결을 확인한 후 다시 시도해 주세요."
    );
});

test("request claims use the server-confirmed timestamp after a transaction", async () => {
    const committedClaim = {
        ownerUid: "anon-1",
        type: "visit",
        payloadHash: "a".repeat(64),
        date: "2026-07-28",
        status: "pending",
        createdAt: 456
    };
    const context = runScript("js/requests.js", {
        window: {},
        auth: { currentUser: { uid: "anon-1" } },
        db: {
            ref() {
                return {
                    transaction() {
                        return Promise.resolve({
                            committed: true,
                            snapshot: {
                                val() {
                                    return { ...committedClaim, createdAt: 123 };
                                }
                            }
                        });
                    },
                    once() {
                        return Promise.resolve({
                            val() {
                                return committedClaim;
                            }
                        });
                    }
                };
            }
        },
        firebase: { database: { ServerValue: { TIMESTAMP: { ".sv": "timestamp" } } } }
    });
    const request = {
        requestId: "0123456789abcdef0123456789abcdef",
        payloadHash: committedClaim.payloadHash,
        type: "visit",
        payload: { date: committedClaim.date }
    };

    const result = await context.claimIdempotentRequest(request);
    assert.equal(result.createdAt, 456);
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
        auth: { currentUser: { uid: "anon-1", isAnonymous: true } },
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
        auth: { currentUser: { uid: "anon-1", isAnonymous: true } },
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

test("failed AR save releases its own slot lock and the same request can retry", async () => {
    const request = {
        requestId: "0123456789abcdef0123456789abcdef",
        payloadHash: "a".repeat(64),
        type: "ar",
        createdAt: 123
    };
    let lockValue = null;
    let updateCalls = 0;
    const lockRef = {
        async transaction(callback) {
            const nextValue = callback(lockValue);
            if (nextValue === undefined) return { committed: false };
            lockValue = nextValue;
            return { committed: true };
        }
    };
    const context = runScript("js/ar.js", {
        auth: { currentUser: { uid: "anon-1", isAnonymous: true } },
        claimIdempotentRequest: async () => ({ createdAt: 123, status: "pending" }),
        isRequestComplete: async () => false,
        createSlotKey() { return "2026-07-24_10:00"; },
        logError() {},
        arSlotLocksRef: { child() { return lockRef; } },
        db: {
            ref() {
                return {
                    async update() {
                        updateCalls += 1;
                        if (updateCalls === 1) {
                            throw Object.assign(new Error("network failed"), { code: "NETWORK_ERROR" });
                        }
                    }
                };
            }
        }
    });

    await assert.rejects(
        context.reserveSlotAndSaveArLog(
            "2026-07-24",
            "10:00",
            { date: "2026-07-24", timeSlot: "10:00", users: [] },
            request
        ),
        /network failed/
    );
    assert.equal(lockValue, null);

    await context.reserveSlotAndSaveArLog(
        "2026-07-24",
        "10:00",
        { date: "2026-07-24", timeSlot: "10:00", users: [] },
        request
    );
    assert.equal(lockValue, request.requestId);
    assert.equal(updateCalls, 2);
});

test("AR save errors have distinct conflict, auth, network, and fallback messages", () => {
    const context = runScript("js/ar.js", {
        auth: { currentUser: { uid: "anon-1", isAnonymous: true } }
    });
    assert.equal(
        context.arReservationSaveErrorMessage({ code: "SLOT_TAKEN" }),
        "방금 다른 이용자가 같은 시간을 먼저 예약했습니다. 다른 시간을 선택해 주세요."
    );
    assert.equal(
        context.arReservationSaveErrorMessage({ code: "AUTH_REQUIRED" }),
        "사용자 인증에 실패했습니다. 새로고침 후 다시 시도해 주세요."
    );
    assert.equal(
        context.arReservationSaveErrorMessage({ code: "NETWORK_ERROR" }),
        "네트워크 연결을 확인한 후 다시 시도해 주세요."
    );
    assert.equal(
        context.arReservationSaveErrorMessage({ code: "UNKNOWN" }),
        "예약 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
    );
    assert.equal(
        context.arReservationSaveErrorMessage({ code: "permission_denied", arStage: "arSlotLocks" }),
        "예약 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
    );
});

test("AR reservation restores missing anonymous auth before claiming a slot", async () => {
    const request = {
        requestId: "0123456789abcdef0123456789abcdef",
        payloadHash: "a".repeat(64),
        type: "ar",
        createdAt: 123
    };
    let signInCalls = 0;
    const auth = {
        currentUser: null,
        async signInAnonymously() {
            signInCalls += 1;
            this.currentUser = { uid: "anon-restored", isAnonymous: true };
            return { user: this.currentUser };
        }
    };
    const context = runScript("js/ar.js", {
        auth,
        claimIdempotentRequest: async () => ({ createdAt: 123, status: "pending" }),
        createSlotKey() { return "2026-07-24_10:00"; },
        arSlotLocksRef: {
            child() {
                return {
                    async transaction(callback) {
                        return { committed: callback(null) === request.requestId };
                    }
                };
            }
        },
        db: { ref() { return { async update() {} }; } }
    });

    await context.reserveSlotAndSaveArLog(
        "2026-07-24",
        "10:00",
        { date: "2026-07-24", timeSlot: "10:00", users: [] },
        request
    );

    assert.equal(signInCalls, 1);
    assert.equal(auth.currentUser.uid, "anon-restored");
});

function createArReservationListenerContext() {
    const queries = [];
    const messages = [];
    const errors = [];
    const context = runScript("js/ar.js", {
        auth: { currentUser: { uid: "anonymous-user", isAnonymous: true } },
        arSlotLocksRef: {
            orderByKey() {
                const query = {
                    offCalls: 0,
                    startAt() { return query; },
                    endAt() { return query; },
                    limitToLast() { return query; },
                    on(_event, valueCallback, errorCallback) {
                        query.valueCallback = valueCallback;
                        query.errorCallback = errorCallback;
                    },
                    off() { query.offCalls += 1; }
                };
                queries.push(query);
                return query;
            }
        },
        formatLocalDate() { return "2026-07-28"; },
        dom: { sectionAr: { classList: { contains() { return true; } } } },
        generateTimeSlots() {},
        cancelAdminLogLoads() {},
        loadAdminLogPage() {},
        showMessage(message) { messages.push(message); },
        logError(scope, error) { errors.push({ scope, error }); }
    });
    return { context, queries, messages, errors };
}

test("today reservation listener stays single and admin cleanup does not reconnect it", () => {
    const { context, queries } = createArReservationListenerContext();

    assert.equal(context.subscribeArLogsToday(), true);
    assert.equal(context.subscribeArLogsToday(), true);
    assert.equal(queries.length, 2);
    assert.equal(queries[0].offCalls, 1);
    assert.equal(queries[1].offCalls, 0);

    context.unsubscribeArLogsAll();
    assert.equal(queries.length, 2);
    assert.equal(queries[1].offCalls, 0);

    context.unsubscribeArLogsToday();
    assert.equal(queries[1].offCalls, 1);
});

test("reservation listener suppresses auth-transition cancellation and separates errors", () => {
    const { context, queries, messages, errors } = createArReservationListenerContext();

    context.subscribeArLogsToday();
    context.setArAuthTransitioning(true);
    queries[0].errorCallback({ code: "permission_denied" });
    assert.equal(messages.length, 0);
    assert.equal(errors.length, 1);

    context.setArAuthTransitioning(false);
    queries[0].errorCallback({ code: "permission_denied" });
    assert.equal(
        messages.at(-1),
        "사용자 인증에 실패했습니다. 새로고침 후 다시 시도해 주세요."
    );

    context.subscribeArLogsToday();
    queries[1].errorCallback({ code: "NETWORK_ERROR" });
    assert.equal(
        messages.at(-1),
        "예약 현황을 불러오지 못했습니다. 네트워크 연결을 확인해 주세요."
    );
});

function createAdminExitContext(options = {}) {
    const order = [];
    const messages = [];
    const classList = {
        add() {},
        remove() {},
        replace() {}
    };
    let idleCallback = null;
    const auth = {
        currentUser: { uid: "admin-user", isAnonymous: false, email: "shneunggok@gmail.com" },
        async signOut() {
            order.push("signOut");
            if (options.signOutError) throw options.signOutError;
            auth.currentUser = null;
        },
        async signInAnonymously() {
            order.push("signInAnonymously");
            if (options.anonymousError) throw options.anonymousError;
            auth.currentUser = { uid: "anonymous-user", isAnonymous: true };
            return { user: auth.currentUser };
        }
    };
    const dom = {
        mainContentContainer: { classList },
        mainTabs: { classList },
        sectionVisit: { classList },
        sectionAr: { classList },
        adminTabs: { classList },
        sectionAdmin: { classList },
        exitAdminBtn: { classList },
        adminEntryBtn: { classList }
    };
    const context = runScript("js/admin.js", {
        ADMIN_EMAIL: "shneunggok@gmail.com",
        auth,
        dom,
        document: {
            body: { className: "" },
            addEventListener() {}
        },
        window: {
            setTimeout(callback) {
                idleCallback = callback;
                return 1;
            },
            clearTimeout() {}
        },
        clearTimeout() {},
        unsubscribeVisitLogs() { order.push("unsubscribeVisitLogs"); },
        unsubscribeArLogsToday() { order.push("unsubscribeArLogsToday"); },
        unsubscribeArLogsAll() { order.push("unsubscribeArLogsAll"); },
        cancelAdminStatisticsLoads() { order.push("cancelAdminStatisticsLoads"); },
        unloadTvManagement() { order.push("unloadTvManagement"); },
        setArAuthTransitioning(value) { order.push(`transition:${value}`); },
        subscribeArLogsToday() { order.push("subscribeArLogsToday"); return true; },
        subscribeVisitLogs() { order.push("subscribeVisitLogs"); },
        subscribeArLogsAll() { order.push("subscribeArLogsAll"); },
        switchTab(type) { order.push(`switchTab:${type}`); },
        updateAttendanceEventBannerVisibility() {},
        updateAdminDashboard() {},
        showMessage(message) { messages.push(message); },
        logError() {}
    });
    return {
        context,
        auth,
        order,
        messages,
        getIdleCallback() { return idleCallback; }
    };
}

test("manual admin exit waits for anonymous auth, deduplicates, and permits immediate AR navigation", async () => {
    const { context, order } = createAdminExitContext();
    const firstExit = context.exitAdmin();
    const duplicateExit = context.exitAdmin();
    assert.deepEqual(await Promise.all([firstExit, duplicateExit]), [true, true]);
    context.switchTab("ar");

    assert.equal(order.filter((item) => item === "signOut").length, 1);
    assert.equal(order.filter((item) => item === "signInAnonymously").length, 1);
    assert.equal(order.filter((item) => item === "subscribeArLogsToday").length, 1);
    assert.ok(order.indexOf("unsubscribeArLogsToday") < order.indexOf("signOut"));
    assert.ok(order.indexOf("signOut") < order.indexOf("signInAnonymously"));
    assert.ok(order.indexOf("signInAnonymously") < order.indexOf("subscribeArLogsToday"));
    assert.ok(order.indexOf("subscribeArLogsToday") < order.indexOf("switchTab:visit"));
    assert.ok(order.indexOf("subscribeArLogsToday") < order.indexOf("switchTab:ar"));
});

test("automatic admin exit uses the same transition and repeated exits keep one listener each", async () => {
    const state = createAdminExitContext();
    assert.equal(state.context.restoreAdminSession({
        isAnonymous: false,
        email: "shneunggok@gmail.com"
    }), true);
    await state.getIdleCallback()();
    assert.ok(state.messages.includes("관리자 세션이 자동으로 종료되었습니다."));

    state.auth.currentUser = {
        uid: "admin-user",
        isAnonymous: false,
        email: "shneunggok@gmail.com"
    };
    assert.equal(state.context.restoreAdminSession(state.auth.currentUser), true);
    await state.context.exitAdmin();

    state.auth.currentUser = {
        uid: "admin-user",
        isAnonymous: false,
        email: "shneunggok@gmail.com"
    };
    assert.equal(state.context.restoreAdminSession(state.auth.currentUser), true);
    await state.context.exitAdmin();

    assert.equal(state.order.filter((item) => item === "signOut").length, 3);
    assert.equal(state.order.filter((item) => item === "signInAnonymously").length, 3);
    assert.equal(state.order.filter((item) => item === "subscribeArLogsToday").length, 3);
});

test("anonymous auth recovery failure shows the dedicated message without subscribing", async () => {
    const state = createAdminExitContext({
        anonymousError: Object.assign(new Error("auth unavailable"), { code: "auth/network-request-failed" })
    });

    assert.equal(await state.context.exitAdmin(), false);
    assert.equal(
        state.messages.at(-1),
        "사용자 인증에 실패했습니다. 새로고침 후 다시 시도해 주세요."
    );
    assert.equal(state.order.includes("subscribeArLogsToday"), false);
    assert.equal(state.order.includes("switchTab:visit"), true);
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

function createTvRecoveryTestContext() {
    const refs = new Map();
    const visitQueries = [];
    const arQueries = [];
    const timers = new Set();
    let timerId = 0;
    let attendanceActive = 0;
    let attendanceSubscribeCalls = 0;
    let attendanceMaxActive = 0;

    function createListenerRef(name) {
        const ref = {
            name,
            active: 0,
            onCalls: 0,
            offCalls: 0,
            successCallback: null,
            errorCallback: null,
            on(_event, success, error) {
                ref.active = 1;
                ref.onCalls += 1;
                ref.successCallback = success;
                ref.errorCallback = error;
            },
            off() {
                ref.active = 0;
                ref.offCalls += 1;
            },
            set() { return Promise.resolve(); }
        };
        return ref;
    }

    function fixedRef(pathName) {
        if (!refs.has(pathName)) refs.set(pathName, createListenerRef(pathName));
        return refs.get(pathName);
    }

    const visitLogsRef = {
        orderByChild() {
            const query = createListenerRef("visit-query");
            query.equalTo = () => query;
            query.limitToLast = () => query;
            visitQueries.push(query);
            return query;
        }
    };
    const arLogsRef = {
        orderByChild() {
            const query = createListenerRef("ar-query");
            query.equalTo = () => query;
            query.limitToLast = () => query;
            arQueries.push(query);
            return query;
        }
    };
    const auth = {
        currentUser: { uid: "admin-user", isAnonymous: false },
        signInCalls: 0,
        signInAnonymously() {
            auth.signInCalls += 1;
            auth.currentUser = { uid: "anonymous-user", isAnonymous: true };
            return Promise.resolve({ user: auth.currentUser });
        }
    };
    const windowStub = {
        setTimeout(callback, delay = 0) {
            const handle = { id: ++timerId, callback, delay };
            timers.add(handle);
            return handle;
        },
        clearTimeout(handle) {
            timers.delete(handle);
        },
        setInterval,
        clearInterval,
        addEventListener() {}
    };
    const documentStub = {
        readyState: "loading",
        visibilityState: "visible",
        documentElement: { style: { setProperty() {} } },
        body: { dataset: {} },
        addEventListener() {},
        getElementById() { return null; },
        querySelector() { return null; },
        querySelectorAll() { return []; }
    };
    const context = runScript("js/tv.js", {
        window: windowStub,
        document: documentStub,
        location: { search: "" },
        URLSearchParams,
        auth,
        db: { ref: fixedRef },
        visitLogsRef,
        arLogsRef,
        firebase: { database: { ServerValue: { TIMESTAMP: 123 } } },
        formatLocalDate() { return "2026-07-29"; },
        escapeHtml(value) { return String(value || ""); },
        TVCommon: {
            shouldWriteStatus() { return false; },
            normalizeFixedSlides(value) { return value || []; },
            backgroundPreset() { return null; },
            themePreset() {
                return {
                    background: "#000000",
                    accent: "#00ffff",
                    secondary: "#ffffff"
                };
            },
            isActive() { return true; },
            sortEvents(value) { return value; },
            sortNotices(value) { return value; }
        },
        subscribeAttendanceBoards() {
            attendanceActive = 1;
            attendanceSubscribeCalls += 1;
            attendanceMaxActive = Math.max(attendanceMaxActive, attendanceActive);
        },
        unsubscribeAttendanceBoards() {
            attendanceActive = 0;
        },
        getTvAttendanceSubscriptionCount() {
            return attendanceActive ? 3 : 0;
        }
    });

    return {
        context,
        auth,
        refs,
        visitQueries,
        arQueries,
        getAttendanceState() {
            return {
                active: attendanceActive,
                subscribeCalls: attendanceSubscribeCalls,
                maxActive: attendanceMaxActive
            };
        },
        getTimers() {
            return Array.from(timers).sort((first, second) => first.id - second.id);
        },
        runTimer(handle) {
            if (!timers.has(handle)) return false;
            timers.delete(handle);
            handle.callback();
            return true;
        }
    };
}

test("TV event rotation preserves image and text-only events in one sequence", () => {
    const { context } = createTvRecoveryTestContext();
    const items = context.buildEventRotationItems([
        ["image-event", {
            title: "이미지 행사",
            images: [
                { secure_url: "https://example.com/first.jpg" },
                "https://example.com/second.jpg"
            ]
        }],
        ["text-event", {
            title: "텍스트 행사",
            description: "이미지 없이 표시되는 행사",
            startDate: "2026-07-01",
            endDate: "2026-07-31"
        }],
        ["legacy-image-event", {
            title: "기존 이미지 행사",
            image: "https://example.com/legacy.jpg"
        }]
    ]);

    assert.deepEqual(
        Array.from(items, (item) => ({
            kind: item.kind,
            eventId: item.eventId,
            title: item.title,
            url: item.url || ""
        })),
        [
            {
                kind: "image",
                eventId: "image-event",
                title: "이미지 행사",
                url: "https://example.com/first.jpg"
            },
            {
                kind: "image",
                eventId: "image-event",
                title: "이미지 행사",
                url: "https://example.com/second.jpg"
            },
            {
                kind: "text",
                eventId: "text-event",
                title: "텍스트 행사",
                url: ""
            },
            {
                kind: "image",
                eventId: "legacy-image-event",
                title: "기존 이미지 행사",
                url: "https://example.com/legacy.jpg"
            }
        ]
    );
});

test("TV event rotation activates exactly one item and wraps without duplication", () => {
    const { context } = createTvRecoveryTestContext();
    const frames = Array.from({ length: 3 }, () => {
        const classes = new Set();
        return {
            classes,
            classList: {
                toggle(name, enabled) {
                    if (enabled) classes.add(name);
                    else classes.delete(name);
                }
            }
        };
    });
    const container = {
        querySelectorAll(selector) {
            assert.equal(selector, ".tv-event-rotation-frame");
            return frames;
        }
    };

    context.showEventRotationItem(container, 0);
    assert.deepEqual(frames.map((frame) => frame.classes.has("is-active")), [true, false, false]);
    context.showEventRotationItem(container, 1);
    assert.deepEqual(frames.map((frame) => frame.classes.has("is-active")), [false, true, false]);
    context.showEventRotationItem(container, 3);
    assert.deepEqual(frames.map((frame) => frame.classes.has("is-active")), [true, false, false]);
});

test("TV event rendering includes every mixed event while showing one frame at a time", () => {
    const { context } = createTvRecoveryTestContext();
    const containerClasses = new Set();
    const slideClasses = new Set();
    const slideContent = {
        classList: {
            add(name) { slideClasses.add(name); },
            remove(name) { slideClasses.delete(name); }
        }
    };
    const renderedFrames = [];
    const container = {
        dataset: {},
        innerHTML: "",
        classList: {
            add(name) { containerClasses.add(name); },
            remove(name) { containerClasses.delete(name); }
        },
        closest(selector) {
            assert.equal(selector, ".tv-slide-content");
            return slideContent;
        },
        querySelectorAll(selector) {
            if (selector === ".tv-event-rotation-frame--image img") return [];
            if (selector !== ".tv-event-rotation-frame") return [];
            const count = (container.innerHTML.match(/class="tv-event-rotation-frame /g) || []).length;
            while (renderedFrames.length < count) {
                const classes = new Set();
                renderedFrames.push({
                    classList: {
                        toggle(name, enabled) {
                            if (enabled) classes.add(name);
                            else classes.delete(name);
                        }
                    }
                });
            }
            return renderedFrames.slice(0, count);
        }
    };
    let intervalCount = 0;
    context.window.setInterval = () => {
        intervalCount += 1;
        return { kind: "event-rotation" };
    };
    context.window.clearInterval = () => {};
    context.__eventsContainer = container;
    vm.runInContext("TV_DOM.eventsContainer = __eventsContainer", context);

    context.renderEvents({
        imageEvent: {
            title: "포스터 행사",
            enabled: true,
            images: [{ secure_url: "https://example.com/poster.jpg" }]
        },
        firstTextEvent: {
            title: "텍스트 행사 1",
            description: "첫 번째 안내",
            enabled: true
        },
        secondTextEvent: {
            title: "텍스트 행사 2",
            description: "두 번째 안내",
            enabled: true
        }
    });

    assert.equal((container.innerHTML.match(/class="tv-event-rotation-frame /g) || []).length, 3);
    assert.equal((container.innerHTML.match(/tv-event-rotation-frame--image/g) || []).length, 1);
    assert.equal((container.innerHTML.match(/tv-event-rotation-frame--text/g) || []).length, 2);
    assert.match(container.innerHTML, /poster\.jpg/);
    assert.match(container.innerHTML, /텍스트 행사 1/);
    assert.match(container.innerHTML, /텍스트 행사 2/);
    assert.equal(intervalCount, 1);
    assert.equal(containerClasses.has("tv-events-container--fullscreen"), true);
    assert.equal(slideClasses.has("tv-slide-content--fullscreen-event"), true);
});

test("TV AR reservations use today's utilization time and mask participant names", () => {
    const { context } = createTvRecoveryTestContext();
    const reservations = context.normalizeTvArReservations([
        {
            _key: "late",
            date: "2026-07-29",
            timeSlot: "20:00",
            users: [{ name: "김민수" }],
            createdAt: 1
        },
        {
            _key: "other-day",
            date: "2026-07-28",
            timeSlot: "09:00",
            users: [{ name: "전날예약" }],
            createdAt: 2
        },
        {
            _key: "early",
            date: "2026-07-29",
            timeSlot: "10:00",
            users: [{ name: "이서연" }, { name: "박지훈" }],
            createdAt: 3
        },
        {
            _key: "invalid",
            date: "2026-07-29",
            timeSlot: "25:00",
            users: [{ name: "잘못된시간" }],
            createdAt: 4
        }
    ], "2026-07-29", new Date(2026, 6, 29, 9, 0));

    assert.deepEqual(
        Array.from(reservations, (reservation) => reservation.timeSlot),
        ["10:00", "20:00"]
    );
    assert.equal(context.maskTvArReservationName("김민수"), "김*수");
    assert.equal(context.maskTvArReservationName("이서"), "이*");
    assert.equal(context.maskTvArReservationName("박"), "*");
});

test("TV automatically restores one realtime subscription set after forced admin logout", () => {
    const state = createTvRecoveryTestContext();
    const { context, auth, refs, visitQueries, arQueries } = state;

    context.handleTvAuthStateChanged(auth.currentUser);
    assert.equal(refs.get("tvSettings").onCalls, 1);
    assert.equal(refs.get("tvContent/events").onCalls, 1);
    assert.equal(refs.get("tvContent/notices").onCalls, 1);
    assert.equal(visitQueries.length, 1);
    assert.equal(arQueries.length, 1);
    const staleVisitError = visitQueries[0].errorCallback;

    // The administrator's 30-minute exit briefly removes auth. Firebase
    // cancels protected listeners before anonymous auth is restored.
    refs.get("tvContent/events").successCallback({
        val() {
            return {
                event: {
                    title: "기존 이벤트",
                    enabled: true,
                    startDate: "2026-07-01"
                }
            };
        }
    });
    let contentErrorRenders = 0;
    context.renderContentError = () => { contentErrorRenders += 1; };
    refs.get("tvContent/events").errorCallback({ code: "permission_denied" });

    auth.currentUser = null;
    context.handleTvAuthStateChanged(null);
    auth.currentUser = { uid: "anonymous-user", isAnonymous: true };
    context.handleTvAuthStateChanged(auth.currentUser);

    assert.equal(contentErrorRenders, 0);
    assert.equal(refs.get("tvSettings").onCalls, 2);
    assert.equal(refs.get("tvContent/events").onCalls, 2);
    assert.equal(refs.get("tvContent/notices").onCalls, 2);
    assert.equal(visitQueries.length, 2);
    assert.equal(arQueries.length, 2);
    assert.equal(visitQueries[0].active, 0);
    assert.equal(arQueries[0].active, 0);
    assert.equal(visitQueries[1].active, 1);
    assert.equal(arQueries[1].active, 1);
    assert.deepEqual(state.getAttendanceState(), {
        active: 1,
        subscribeCalls: 2,
        maxActive: 1
    });

    // A cancellation callback already queued by the previous auth generation
    // must not tear down the newly restored listeners.
    staleVisitError({ code: "permission_denied" });
    assert.equal(visitQueries[1].active, 1);
    assert.equal(refs.get("tvSettings").active, 1);

    // Repeated auth notifications for the same anonymous user must not add
    // another copy of any listener.
    context.handleTvAuthStateChanged(auth.currentUser);
    assert.equal(refs.get("tvSettings").onCalls, 2);
    assert.equal(refs.get("tvContent/events").onCalls, 2);
    assert.equal(state.getAttendanceState().subscribeCalls, 2);

    context.applyTvContentAvailability("events", false);
    context.applyTvContentAvailability("notices", false);
    assert.equal(vm.runInContext("TV_CONFIG.enabledSlides.events", context), false);
    assert.equal(vm.runInContext("TV_CONFIG.enabledSlides.notices", context), false);
    context.applyTvContentAvailability("events", true);
    assert.equal(vm.runInContext("TV_CONFIG.enabledSlides.events", context), true);
});

test("TV attendance keeps cached ranking data while permission recovery is scheduled", () => {
    let errorCallback = null;
    const recoveries = [];
    const query = {
        orderByChild() { return query; },
        startAt() { return query; },
        endAt() { return query; },
        limitToLast() { return query; },
        on(_event, _success, failure) { errorCallback = failure; },
        off() {}
    };
    const context = runScript("js/tv-attendance.js", {
        window: { setInterval, clearInterval },
        location: { search: "" },
        URLSearchParams,
        document: createDocumentStub(),
        formatLocalDate() { return "2026-07-29"; },
        isValidDateKey(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || ""); },
        escapeHtml(value) { return String(value || ""); },
        handleTvRealtimeSubscriptionError(source, error) {
            recoveries.push({ source, code: error.code });
        }
    });

    context.tvAttendanceState.events = {
        active: {
            type: "visit",
            enabled: true,
            startDate: "2026-07-01",
            endDate: "2026-08-30"
        }
    };
    context.tvAttendanceState.visitLogs = {
        cached: { date: "2026-07-29", name: "기존 순위" }
    };
    context.subscribeAttendanceLogSource("visit", query);
    errorCallback({ code: "permission_denied" });

    assert.equal(context.tvAttendanceState.visitError, false);
    assert.equal(context.tvAttendanceState.visitLogs.cached.name, "기존 순위");
    assert.deepEqual(recoveries, [{
        source: "attendance-visitLogs",
        code: "permission_denied"
    }]);
});

test("TV retry backoff is jittered, capped at five minutes, and stops after ten attempts", () => {
    const state = createTvRecoveryTestContext();
    const { context, auth, visitQueries } = state;

    assert.equal(context.tvRetryDelayForAttempt(0, 0), 400);
    assert.equal(context.tvRetryDelayForAttempt(0, 1), 500);
    assert.equal(context.tvRetryDelayForAttempt(4, 0), 24000);
    assert.equal(context.tvRetryDelayForAttempt(5, 1), 60000);
    assert.equal(context.tvRetryDelayForAttempt(9, 0), 240000);
    assert.equal(context.tvRetryDelayForAttempt(9, 1), 300000);
    assert.equal(context.classifyTvFailure({ code: "permission_denied" }), "permission");
    assert.equal(context.classifyTvFailure({ code: "auth/invalid-user-token" }), "auth");
    assert.equal(context.classifyTvFailure({ code: "auth/network-request-failed" }), "network");
    assert.equal(context.classifyTvFailure({ code: "NETWORK_ERROR" }), "network");

    context.handleTvAuthStateChanged(auth.currentUser);
    const observedRetryDelays = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
        visitQueries.at(-1).errorCallback({ code: "permission_denied" });
        const retryTimer = state.getTimers().find((timer) => timer.delay < 60000 || attempt >= 5);
        assert.ok(retryTimer, `retry timer ${attempt + 1} should exist`);
        observedRetryDelays.push(retryTimer.delay);
        assert.equal(state.runTimer(retryTimer), true);
    }

    visitQueries.at(-1).errorCallback({ code: "permission_denied" });
    const diagnostics = context.getTvRuntimeDiagnostics();
    assert.equal(diagnostics.retryBlocked, true);
    assert.equal(diagnostics.retryAttempts, 10);
    assert.equal(diagnostics.metrics.retrySchedules, 10);
    assert.equal(diagnostics.metrics.subscriptionSets, 11);
    assert.equal(diagnostics.activeDatabaseSubscriptions, 0);
    assert.equal(state.getTimers().length, 0);
    assert.ok(observedRetryDelays[4] >= 24000 && observedRetryDelays[4] <= 30000);
    assert.ok(observedRetryDelays[5] >= 48000 && observedRetryDelays[5] <= 60000);
    assert.ok(observedRetryDelays[8] >= 240000 && observedRetryDelays[8] <= 300000);
    assert.ok(observedRetryDelays[9] >= 240000 && observedRetryDelays[9] <= 300000);
});

test("TV retry ceiling cannot be bypassed by alternating failure categories for the same user", () => {
    const state = createTvRecoveryTestContext();
    const { context, auth, visitQueries } = state;

    context.handleTvAuthStateChanged(auth.currentUser);
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const code = attempt % 2 === 0 ? "permission_denied" : "NETWORK_ERROR";
        visitQueries.at(-1).errorCallback({ code });
        const retryTimer = state.getTimers()[0];
        assert.ok(retryTimer, `retry timer ${attempt + 1} should exist`);
        assert.equal(state.runTimer(retryTimer), true);
    }

    visitQueries.at(-1).errorCallback({ code: "auth/invalid-user-token" });
    const diagnostics = context.getTvRuntimeDiagnostics();
    assert.equal(diagnostics.retryBlocked, true);
    assert.equal(diagnostics.retryAttempts, 10);
    assert.equal(diagnostics.metrics.retrySchedules, 10);
    assert.equal(state.getTimers().length, 0);
});

test("TV only reports connected after every required data source succeeds", () => {
    const state = createTvRecoveryTestContext();
    const { context, auth, refs, visitQueries, arQueries } = state;

    const statusText = { textContent: "" };
    const statusDot = { className: "", classList: { add() {} } };
    context.document.getElementById = (id) => {
        if (id === "tv-status-text") return statusText;
        if (id === "tv-connection-status") return statusDot;
        return null;
    };
    context.cacheTVDOM();
    context.handleTvAuthStateChanged(auth.currentUser);
    assert.equal(context.getTvRuntimeDiagnostics().healthySources, 0);

    refs.get("tvSettings").successCallback({ val() { return null; } });
    visitQueries[0].successCallback({ numChildren() { return 0; } });
    arQueries[0].successCallback({ numChildren() { return 0; } });
    refs.get("tvContent/events").successCallback({ val() { return null; } });
    refs.get("tvContent/notices").successCallback({ val() { return null; } });

    const beforeAttendance = context.getTvRuntimeDiagnostics();
    assert.equal(beforeAttendance.healthySources, 5);
    assert.equal(beforeAttendance.requiredSources, 6);
    assert.notEqual(statusText.textContent, "Firebase 연결됨");

    context.markTvRealtimeHealthy(
        "attendanceEvents",
        context.getTvRuntimeDiagnostics().subscriptionGeneration
    );
    assert.equal(statusText.textContent, "Firebase 연결됨");
});

test("12-hour TV soak keeps subscriptions, timers, and heap bounded across admin exits", () => {
    const state = createTvRecoveryTestContext();
    const { context, auth, refs, visitQueries, arQueries } = state;
    const coreSources = [
        "tvSettings",
        "visitLogs",
        "arLogs",
        "attendanceEvents",
        "events",
        "notices"
    ];
    const markCoreHealthy = () => {
        const generation = context.getTvRuntimeDiagnostics().subscriptionGeneration;
        coreSources.forEach((source) => context.markTvRealtimeHealthy(source, generation));
    };

    if (global.gc) global.gc();
    const heapBefore = process.memoryUsage().heapUsed;

    vm.runInContext(
        "clockTimer = { kind: 'clock' }; slideTimer = { kind: 'slide' }; " +
        "statusTimer = { kind: 'status' }; eventImageTimer = { kind: 'event-image' };",
        context
    );
    context.handleTvAuthStateChanged(auth.currentUser);
    markCoreHealthy();
    for (let halfHour = 1; halfHour <= 24; halfHour += 1) {
        auth.currentUser = {
            uid: `admin-${halfHour}`,
            isAnonymous: false,
            getIdToken() { return Promise.resolve("token"); }
        };
        context.handleTvAuthStateChanged(auth.currentUser);
        markCoreHealthy();

        refs.get("tvContent/events").errorCallback({ code: "permission_denied" });
        auth.currentUser = null;
        context.handleTvAuthStateChanged(null);
        auth.currentUser = { uid: `anonymous-${halfHour}`, isAnonymous: true };
        context.handleTvAuthStateChanged(auth.currentUser);
        markCoreHealthy();

        visitQueries.length = 0;
        arQueries.length = 0;
        const diagnostics = context.getTvRuntimeDiagnostics();
        assert.equal(diagnostics.activeDatabaseSubscriptions, 8);
        assert.equal(diagnostics.activeTimers, 4);
        assert.equal(diagnostics.retryBlocked, false);
    }

    if (global.gc) global.gc();
    const heapAfter = process.memoryUsage().heapUsed;
    const diagnostics = context.getTvRuntimeDiagnostics();
    console.info("[tv-soak-12h]", JSON.stringify({
        heapBefore,
        heapAfter,
        heapDelta: heapAfter - heapBefore,
        activeDatabaseSubscriptions: diagnostics.activeDatabaseSubscriptions,
        activeTimers: diagnostics.activeTimers,
        subscriptionSets: diagnostics.metrics.subscriptionSets,
        authAttempts: diagnostics.metrics.authAttempts,
        retrySchedules: diagnostics.metrics.retrySchedules
    }));

    assert.equal(diagnostics.activeDatabaseSubscriptions, 8);
    assert.equal(diagnostics.activeTimers, 4);
    assert.equal(diagnostics.metrics.authAttempts, 0);
    assert.equal(diagnostics.metrics.subscriptionSets, 49);
    assert.ok(heapAfter - heapBefore < 1024 * 1024);
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
    const compareKeys = (firstKeyValue, secondKeyValue) => {
        const firstKey = String(firstKeyValue);
        const secondKey = String(secondKeyValue);
        if (firstKey === secondKey) return 0;
        const asInteger = (key) => /^-?(0*)\d{1,10}$/.test(key) &&
            Number(key) >= -2147483648 && Number(key) <= 2147483647
            ? Number(key)
            : null;
        const firstInteger = asInteger(firstKey);
        const secondInteger = asInteger(secondKey);
        if (firstInteger !== null) {
            if (secondInteger !== null) {
                return firstInteger === secondInteger
                    ? firstKey.length - secondKey.length
                    : firstInteger - secondInteger;
            }
            return -1;
        }
        if (secondInteger !== null) return 1;
        return firstKey < secondKey ? -1 : 1;
    };
    return {
        orderByChild(field) {
            const state = {
                field,
                start: null,
                startSet: false,
                startKey: null,
                end: null,
                endSet: false,
                endKey: null,
                equal: null,
                equalSet: false,
                limit: null
            };
            const query = {
                startAt(value, key) {
                    state.start = value;
                    state.startSet = true;
                    state.startKey = key ?? null;
                    return query;
                },
                endAt(value, key) {
                    state.end = value;
                    state.endSet = true;
                    state.endKey = key ?? null;
                    return query;
                },
                equalTo(value) {
                    state.equal = value;
                    state.equalSet = true;
                    return query;
                },
                limitToLast(value) { state.limit = value; return query; },
                once() {
                    if (options.onRead) options.onRead({ ...state });
                    const valueOf = (record) => record[state.field] ?? null;
                    let result = records.slice().sort((first, second) => {
                        const firstValue = valueOf(first);
                        const secondValue = valueOf(second);
                        if (firstValue === null && secondValue !== null) return -1;
                        if (firstValue !== null && secondValue === null) return 1;
                        if (firstValue < secondValue) return -1;
                        if (firstValue > secondValue) return 1;
                        return compareKeys(first._key, second._key);
                    }).filter((record) => {
                        const value = valueOf(record);
                        if (state.equalSet && value !== state.equal) return false;
                        if (state.startSet && (value < state.start ||
                            (value === state.start && state.startKey &&
                                compareKeys(record._key, state.startKey) < 0))) return false;
                        if (state.endSet && (value > state.end ||
                            (value === state.end && state.endKey &&
                                compareKeys(record._key, state.endKey) > 0))) return false;
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

function parseCsvRows(content) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    const source = String(content).replace(/^\uFEFF/, "");
    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];
        if (quoted) {
            if (character === '"' && source[index + 1] === '"') {
                cell += '"';
                index += 1;
            } else if (character === '"') {
                quoted = false;
            } else {
                cell += character;
            }
        } else if (character === '"') {
            quoted = true;
        } else if (character === ",") {
            row.push(cell);
            cell = "";
        } else if (character === "\r" && source[index + 1] === "\n") {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
            index += 1;
        } else {
            cell += character;
        }
    }
    if (cell || row.length) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
}

function createAdminExportTestContext(options = {}) {
    const elements = new Map();
    const messages = [];
    const downloads = [];
    const createdUrls = new Map();
    let urlSequence = 0;
    const controls = {
        "start-date": { value: options.start || "2026-07-01" },
        "end-date": { value: options.end || "2026-07-31" },
        "filter-year-select": { value: "2026" },
        "filter-month-select": { value: "6" }
    };
    const createElement = (id = "") => {
        const label = { textContent: "" };
        return {
            id,
            value: "",
            textContent: "",
            innerText: "",
            innerHTML: "",
            disabled: false,
            dataset: {},
            style: {},
            classList: {
                add() {},
                remove() {},
                toggle() {},
                contains() { return false; },
                replace() {}
            },
            setAttribute(name, value) { this[name] = value; },
            appendChild() {},
            querySelector(selector) {
                return selector === "[data-export-label]" ? label : null;
            },
            querySelectorAll() { return []; },
            addEventListener() {},
            click() {}
        };
    };
    const getElementById = (id) => {
        if (controls[id]) return controls[id];
        if (!elements.has(id)) elements.set(id, createElement(id));
        return elements.get(id);
    };
    const document = {
        body: { style: { overflow: "" } },
        activeElement: null,
        getElementById,
        querySelectorAll() { return []; },
        createElement(tag) {
            if (tag !== "a") return createElement(tag);
            const attributes = {};
            return {
                setAttribute(name, value) { attributes[name] = value; },
                click() {
                    downloads.push({
                        fileName: attributes.download,
                        content: createdUrls.get(attributes.href)?.content || ""
                    });
                }
            };
        }
    };
    class CsvBlob {
        constructor(parts, metadata) {
            this.content = parts.join("");
            this.type = metadata?.type || "";
        }
    }
    const context = vm.createContext({
        console,
        setTimeout,
        clearTimeout,
        document,
        window: { setTimeout(callback) { callback(); } },
        URL: {
            createObjectURL(blob) {
                const url = `blob:test-${++urlSequence}`;
                createdUrls.set(url, blob);
                return url;
            },
            revokeObjectURL(url) {
                createdUrls.delete(url);
            }
        },
        Blob: CsvBlob,
        visitLogsRef: options.visitRef || createFirebasePageRef(options.visits || [], {
            onRead: options.onVisitRead
        }),
        arLogsRef: options.arRef || createFirebasePageRef(options.ars || [], {
            onRead: options.onArRead
        }),
        visitLogs: options.currentVisits || [],
        arLogs: options.currentArs || [],
        currentFilter: options.filter || "custom",
        isAdminUser: true,
        AGE_GROUPS: ["성인(40세 이상)"],
        PURPOSES: ["독서"],
        updateAdminDashboard() {},
        lucide: null
    });
    for (const relativePath of ["js/utils.js", "js/admin-data.js"]) {
        const source = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
        vm.runInContext(source, context, { filename: relativePath });
    }
    context.showMessage = (message, type) => messages.push({ message, type });
    context.logError = () => {};
    return { context, elements, messages, downloads, controls };
}

function csvVisitRecord(index, overrides = {}) {
    return {
        _key: `visit-export-${String(index).padStart(5, "0")}`,
        date: "2026-07-15",
        time: `${String(index % 24).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}`,
        name: `방문자-${String(index).padStart(5, "0")}`,
        gender: index % 2 ? "여" : "남",
        age: "성인(40세 이상)",
        purposes: ["독서"],
        createdAt: new Date(2026, 6, 15).getTime() + index,
        ...overrides
    };
}

function csvArRecord(index, overrides = {}) {
    return {
        _key: `ar-export-${String(index).padStart(5, "0")}`,
        date: "2026-07-15",
        timeSlot: `${String(10 + (index % 10)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`,
        users: [{
            name: `예약자-${String(index).padStart(5, "0")}`,
            gender: index % 2 ? "여" : "남",
            age: "성인(40세 이상)"
        }],
        createdAt: new Date(2026, 6, 15).getTime() + index,
        ...overrides
    };
}

test("admin AR schedule shows today's slots in utilization-time order with full detail data", () => {
    const { context } = createAdminExportTestContext();
    const groups = context.buildAdminArTodaySchedule([
        {
            _key: "late",
            date: "2026-07-15",
            timeSlot: "20:00",
            users: [{ name: "김민수", gender: "남", age: "성인(40세 이상)" }]
        },
        {
            _key: "early",
            date: "2026-07-15",
            timeSlot: "10:00",
            users: [
                { name: "이서연", gender: "여", age: "성인(40세 이상)" },
                { name: "박지훈", gender: "남", age: "성인(40세 이상)" }
            ]
        },
        {
            _key: "other-day",
            date: "2026-07-14",
            timeSlot: "09:00",
            users: [{ name: "전날예약", gender: "남", age: "성인(40세 이상)" }]
        }
    ], "2026-07-15", new Date(2026, 6, 15, 9, 0));
    const reserved = Array.from(groups).filter((group) => group.logs.length);

    assert.deepEqual(
        reserved.map((group) => group.timeSlot),
        ["10:00", "20:00"]
    );
    assert.equal(reserved[0].representative, "이서연");
    assert.deepEqual(
        Array.from(reserved[0].users, (user) => ({ name: user.name, gender: user.gender })),
        [
            { name: "이서연", gender: "여" },
            { name: "박지훈", gender: "남" }
        ]
    );
});

test("admin AR schedule keeps exactly one bounded today subscription", () => {
    const calls = [];
    const query = {
        equalTo(value) {
            calls.push(["equalTo", value]);
            return query;
        },
        limitToLast(value) {
            calls.push(["limitToLast", value]);
            return query;
        },
        on(eventName) {
            calls.push(["on", eventName]);
        },
        off() {
            calls.push(["off"]);
        }
    };
    const arRef = {
        orderByChild(field) {
            calls.push(["orderByChild", field]);
            return query;
        }
    };
    const { context } = createAdminExportTestContext({ arRef });

    assert.equal(context.subscribeAdminArTodaySchedule(), true);
    assert.equal(context.subscribeAdminArTodaySchedule(), true);
    assert.equal(calls.filter(([name]) => name === "on").length, 1);
    assert.deepEqual(calls.filter(([name]) => name === "orderByChild"), [
        ["orderByChild", "date"]
    ]);
    assert.deepEqual(calls.filter(([name]) => name === "limitToLast"), [
        ["limitToLast", 50]
    ]);

    context.unsubscribeAdminArTodaySchedule();
    assert.equal(calls.filter(([name]) => name === "off").length, 1);
});

test("period CSV exports 0, 1, 100, 101, and 1001 records without omissions or duplicates", async (t) => {
    for (const type of ["visit", "ar"]) {
        for (const count of [0, 1, 100, 101, 1001]) {
            await t.test(`${type} ${count} records`, async () => {
                const records = Array.from({ length: count }, (_, index) =>
                    type === "visit" ? csvVisitRecord(index) : csvArRecord(index)
                );
                const options = type === "visit" ? { visits: records } : { ars: records };
                const { context, downloads, messages } = createAdminExportTestContext(options);

                const result = await context.exportAdminPeriodCsv(type);
                assert.equal(result, count > 0);
                assert.equal(downloads.length, count > 0 ? 1 : 0);
                if (count === 0) {
                    assert.match(messages.at(-1).message, /다운로드할 데이터가 없습니다/);
                    return;
                }

                const rows = parseCsvRows(downloads[0].content);
                assert.equal(downloads[0].content.startsWith("\uFEFF"), true);
                assert.equal(rows.length, count + 1);
                const identityColumn = type === "visit" ? 2 : 2;
                const identities = rows.slice(1).map((row) => row[identityColumn]);
                assert.equal(new Set(identities).size, count);
            });
        }
    }
});

test("period CSV uses 400-record cursor pages, progress UI, and keeps the current detail page unchanged", async () => {
    let testState;
    const progressStates = [];
    const visits = Array.from({ length: 1001 }, (_, index) => csvVisitRecord(index));
    testState = createAdminExportTestContext({
        visits,
        currentVisits: [csvVisitRecord(9999, { _key: "current-page-record" })],
        onVisitRead() {
            if (!testState) return;
            const button = testState.elements.get("visit-period-csv-btn");
            const label = button?.querySelector("[data-export-label]");
            progressStates.push({
                disabled: button?.disabled,
                label: label?.textContent || ""
            });
        }
    });
    const originalPage = testState.context.visitLogs;

    assert.equal(await testState.context.exportAdminPeriodCsv("visit"), true);
    assert.equal(testState.downloads.length, 1);
    assert.equal(testState.context.visitLogs, originalPage);
    assert.equal(testState.context.visitLogs[0]._key, "current-page-record");
    assert.equal(progressStates.length, 3);
    assert.deepEqual(progressStates.map((state) => state.disabled), [true, true, true]);
    assert.match(progressStates[0].label, /^0건 불러오는 중$/);
    assert.match(progressStates[1].label, /^400건 불러오는 중$/);
    assert.match(progressStates[2].label, /^800건 불러오는 중$/);
    const button = testState.elements.get("visit-period-csv-btn");
    assert.equal(button.disabled, false);
    assert.equal(button.querySelector("[data-export-label]").textContent, "선택 기간 전체 CSV");
});

test("period CSV follows the selected boundaries, sorts newest first, and safely quotes special text", async () => {
    const specialName = '홍,길동\n"별명"';
    const visits = [
        csvVisitRecord(1, { _key: "before", date: "2026-07-14", time: "23:59" }),
        csvVisitRecord(2, { _key: "morning", date: "2026-07-15", time: "9:05", name: specialName }),
        csvVisitRecord(3, { _key: "late", date: "2026-07-15", time: "18:30", name: "저녁" }),
        csvVisitRecord(4, { _key: "after", date: "2026-07-16", time: "00:00" })
    ];
    const { context, downloads } = createAdminExportTestContext({
        visits,
        start: "2026-07-15",
        end: "2026-07-15"
    });

    assert.equal(await context.exportAdminPeriodCsv("visit"), true);
    const rows = parseCsvRows(downloads[0].content);
    assert.equal(downloads[0].fileName, "방문등록_2026-07-15_2026-07-15.csv");
    assert.deepEqual(rows.slice(1).map((row) => row[2]), ["저녁", specialName]);
    assert.match(downloads[0].content, /"홍,길동\n""별명"""/);
});

test("a failed period CSV page never saves a partial file and can be retried", async () => {
    const visits = Array.from({ length: 1001 }, (_, index) => csvVisitRecord(index));
    let reads = 0;
    let failSecondPage = true;
    const ref = createFirebasePageRef(visits, {
        onRead() {
            reads += 1;
            if (failSecondPage && reads === 2) throw new Error("network failure");
        }
    });
    const testState = createAdminExportTestContext({ visitRef: ref });

    assert.equal(await testState.context.exportAdminPeriodCsv("visit"), false);
    assert.equal(testState.downloads.length, 0);
    assert.match(testState.messages.at(-1).message, /불러오지 못했습니다/);
    assert.equal(testState.elements.get("visit-period-csv-btn").disabled, false);

    failSecondPage = false;
    reads = 0;
    assert.equal(await testState.context.exportAdminPeriodCsv("visit"), true);
    assert.equal(testState.downloads.length, 1);
    assert.equal(parseCsvRows(testState.downloads[0].content).length, 1002);
});

function createAdminDetailTestContext(records, options = {}) {
    const elements = new Map();
    const reads = [];
    const dom = {
        startDate: { value: options.start || "2026-07-01" },
        endDate: { value: options.end || "2026-07-31" },
        filterYearSelect: { value: "2026" },
        filterMonthSelect: { value: "6" }
    };
    const context = runScript("js/admin-data.js", {
        visitLogsRef: createFirebasePageRef(records, {
            onRead(state) { reads.push(state); }
        }),
        arLogsRef: createFirebasePageRef([]),
        visitLogs: [],
        arLogs: [],
        currentFilter: options.filter || "all",
        dom,
        document: {
            getElementById(id) {
                if (!elements.has(id)) {
                    elements.set(id, { textContent: "", disabled: false });
                }
                return elements.get(id);
            }
        },
        isAdminUser: true,
        updateAdminDashboard() {},
        showMessage() {},
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
    return { context, elements, reads, dom };
}

test("admin visit pagination uses createdAt and key without overlap", async () => {
    const baseTimestamp = new Date(2026, 6, 1).getTime();
    const records = Array.from({ length: 1001 }, (_, index) => ({
        _key: `log-${String(index).padStart(5, "0")}`,
        date: `2026-07-${String(1 + (index % 24)).padStart(2, "0")}`,
        time: `${String(index % 24).padStart(2, "0")}:05`,
        createdAt: baseTimestamp + Math.floor(index / 3) * 1000,
        value: index
    }));
    const { context, elements } = createAdminDetailTestContext(records);

    await context.loadAdminLogPage("visit", { reset: true });
    const firstPageKeys = Array.from(context.visitLogs, (record) => record._key);
    assert.equal(firstPageKeys.length, 100);
    assert.deepEqual(
        Array.from(context.visitLogs.slice(0, 3), (record) => record._key),
        ["log-01000", "log-00999", "log-00998"]
    );
    const allKeys = [...firstPageKeys];
    for (let page = 1; page <= 10; page += 1) {
        await context.moveAdminLogPage("visit", "next");
        allKeys.push(...Array.from(context.visitLogs, (record) => record._key));
    }
    assert.equal(context.visitLogs.length, 1);
    assert.equal(new Set(allKeys).size, 1001);
    assert.deepEqual(allKeys, records.slice().sort((first, second) =>
        second.createdAt - first.createdAt || second._key.localeCompare(first._key)
    ).map((record) => record._key));
    assert.match(elements.get("visit-page-status").textContent, /^11페이지 · 현재 1건$/);
});

test("admin visit detail uses numeric timestamps, local date boundaries, and legacy fallback", async () => {
    const start = new Date(2026, 6, 15, 0, 0, 0, 0).getTime();
    const end = new Date(2026, 6, 15, 23, 59, 59, 999).getTime();
    const records = [
        { _key: "before", date: "2026-07-14", time: "23:59", createdAt: start - 1 },
        { _key: "at-start", date: "2026-07-15", time: "00:00", createdAt: start },
        { _key: "nine", date: "2026-07-15", time: "9:05", createdAt: new Date(2026, 6, 15, 9, 5).getTime() },
        { _key: "ten-a", date: "2026-07-15", time: "10:05", createdAt: new Date(2026, 6, 15, 10, 5).getTime() },
        { _key: "ten-b", date: "2026-07-15", time: "10:05", createdAt: new Date(2026, 6, 15, 10, 5).getTime() },
        { _key: "evening", date: "2026-07-15", time: "18:30", createdAt: new Date(2026, 6, 15, 18, 30).getTime() },
        { _key: "legacy", date: "2026-07-15", time: "12:00" },
        { _key: "at-end", date: "2026-07-15", time: "23:59", createdAt: end },
        { _key: "after", date: "2026-07-16", time: "00:00", createdAt: end + 1 }
    ];
    const { context, reads } = createAdminDetailTestContext(records, {
        filter: "custom",
        start: "2026-07-15",
        end: "2026-07-15"
    });

    await context.loadAdminLogPage("visit", { reset: true });
    assert.deepEqual(Array.from(context.visitLogs, (record) => record._key), [
        "at-end",
        "evening",
        "legacy",
        "ten-b",
        "ten-a",
        "nine",
        "at-start"
    ]);
    const createdAtRead = reads.find((read) =>
        read.field === "createdAt" && !read.equalSet
    );
    assert.equal(createdAtRead.start, start);
    assert.equal(createdAtRead.end, end);
    assert.ok(reads.some((read) =>
        read.field === "createdAt" && read.equalSet && read.equal === null
    ));
    assert.equal(context.visitLogs.find((record) => record._key === "legacy")._legacyCreatedAt, true);
});

test("admin visit first page refresh includes a newly added latest record", async () => {
    const records = Array.from({ length: 101 }, (_, index) => ({
        _key: `initial-${String(index).padStart(3, "0")}`,
        date: "2026-07-15",
        time: "10:00",
        createdAt: 1_000 + index
    }));
    const { context } = createAdminDetailTestContext(records);
    await context.loadAdminLogPage("visit", { reset: true });
    assert.equal(context.visitLogs.length, 100);
    await context.moveAdminLogPage("visit", "next");
    assert.equal(context.visitLogs.length, 1);

    records.push({
        _key: "new-latest",
        date: "2026-07-15",
        time: "18:30",
        createdAt: 10_000
    });
    await context.loadAdminLogPage("visit", { reset: true });
    assert.equal(context.visitLogs[0]._key, "new-latest");
});

test("an older admin response cannot overwrite a newer search result", async () => {
    const pending = [];
    const snapshot = (key) => ({
        forEach(callback) {
            callback({
                key,
                val: () => ({
                    date: "2026-07-24",
                    createdAt: new Date(2026, 6, 24, 10).getTime(),
                    name: key
                })
            });
        }
    });
    const emptySnapshot = { forEach() {} };
    const refWithDeferredReads = {
        orderByChild() {
            let legacyOnly = false;
            const query = {
                startAt() { return query; },
                endAt() { return query; },
                equalTo(value) { legacyOnly = value === null; return query; },
                limitToLast() { return this; },
                once() {
                    if (legacyOnly) return Promise.resolve(emptySnapshot);
                    return new Promise((resolve, reject) => pending.push({ resolve, reject }));
                }
            };
            return query;
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
        createdAt: new Date(2026, 6, 15).getTime() + index,
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

test("visit detail rendering keeps the createdAt query order without reversing it", () => {
    const source = fs.readFileSync(path.join(projectRoot, "js/nchm.js"), "utf8");
    assert.match(source, /filteredVisitLogs\.forEach\(\(log\) =>/);
    assert.doesNotMatch(source, /filteredVisitLogs\.slice\(\)\.reverse\(\)/);
});

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
