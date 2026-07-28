const ADMIN_LOG_PAGE_SIZE = 100;
const ADMIN_STATS_PAGE_SIZE = 400;
const ADMIN_STATS_CACHE_VERSION = 1;
const ADMIN_STATS_CACHE_TTL_MS = 5 * 60 * 1000;
const ADMIN_STATS_CACHE_STORAGE_KEY = "nchm.admin.period-stats.v1";

const adminLogPagers = {
    visit: {
        ref: visitLogsRef,
        records: () => visitLogs,
        assign: (records) => { visitLogs = records; },
        anchors: [null],
        pageIndex: 0,
        hasNext: false,
        loading: false,
        requestVersion: 0
    },
    ar: {
        ref: arLogsRef,
        records: () => arLogs,
        assign: (records) => { arLogs = records; },
        anchors: [null],
        pageIndex: 0,
        hasNext: false,
        loading: false,
        requestVersion: 0
    }
};

let adminStatsRequestVersion = 0;
let adminStatsActiveSignature = "";
const adminStatsMemoryCache = new Map();
const adminPeriodStats = {
    visit: null,
    ar: null
};
const adminStatsProgress = {
    visit: { status: "idle", processed: 0, fromCache: false, error: null },
    ar: { status: "idle", processed: 0, fromCache: false, error: null }
};

function createAdminStatsMatrix(categories) {
    const matrix = {};
    categories.forEach((category) => {
        matrix[category] = {};
        AGE_GROUPS.forEach((age) => {
            matrix[category][age] = { 남: 0, 여: 0 };
        });
    });
    return matrix;
}

function createEmptyAdminAggregate(type) {
    if (type === "visit") {
        return {
            type,
            recordCount: 0,
            peopleCount: 0,
            purposeSelectionCount: 0,
            purposeStats: createAdminStatsMatrix(PURPOSES),
            studyStats: createAdminStatsMatrix(["스터디룸"])
        };
    }
    return {
        type: "ar",
        recordCount: 0,
        peopleCount: 0,
        arStats: createAdminStatsMatrix(["AR 이용"])
    };
}

function accumulateAdminAggregate(type, aggregate, record) {
    if (!record || typeof record !== "object") return aggregate;
    aggregate.recordCount += 1;

    if (type === "visit") {
        // Current writes create one visitLogs child per person.
        aggregate.peopleCount += 1;
        const purposes = toArray(record.purposes).filter((purpose) =>
            typeof purpose === "string" && purpose
        );
        aggregate.purposeSelectionCount += purposes.length;
        purposes.forEach((purpose) => {
            const cell = aggregate.purposeStats[purpose]?.[record.age];
            if (cell && Object.prototype.hasOwnProperty.call(cell, record.gender)) {
                cell[record.gender] += 1;
            }
        });
        if (purposes.includes("스터디룸")) {
            const studyCell = aggregate.studyStats["스터디룸"]?.[record.age];
            if (studyCell && Object.prototype.hasOwnProperty.call(studyCell, record.gender)) {
                studyCell[record.gender] += 1;
            }
        }
        return aggregate;
    }

    const users = toArray(record.users).filter((user) =>
        user && typeof user === "object"
    );
    aggregate.peopleCount += users.length;
    users.forEach((user) => {
        const cell = aggregate.arStats["AR 이용"]?.[user.age];
        if (cell && Object.prototype.hasOwnProperty.call(cell, user.gender)) {
            cell[user.gender] += 1;
        }
    });
    return aggregate;
}

function getAdminDateRange() {
    if (currentFilter === "month") {
        const year = Number(dom.filterYearSelect.value);
        const month = Number(dom.filterMonthSelect.value) + 1;
        const start = `${year}-${String(month).padStart(2, "0")}-01`;
        const end = formatLocalDate(new Date(year, month, 0));
        return { start, end, filter: "month" };
    }
    if (currentFilter === "custom") {
        const start = dom.startDate.value;
        const end = dom.endDate.value;
        if (!isValidDateKey(start) || !isValidDateKey(end) || start > end) {
            const error = new Error("INVALID_DATE_RANGE");
            error.code = "INVALID_DATE_RANGE";
            throw error;
        }
        return { start, end, filter: "custom" };
    }
    return { start: "", end: "", filter: "all" };
}

function setAdminPagerLoading(type, loading) {
    const pager = adminLogPagers[type];
    pager.loading = loading;
    const status = document.getElementById(`${type}-page-status`);
    if (status && loading) status.textContent = "불러오는 중...";
    ["prev", "next"].forEach((direction) => {
        const button = document.getElementById(`${type}-page-${direction}`);
        if (button) button.disabled = loading;
    });
}

function updateAdminPagerUi(type) {
    const pager = adminLogPagers[type];
    const status = document.getElementById(`${type}-page-status`);
    if (status) {
        status.textContent = `${pager.pageIndex + 1}페이지 · 현재 ${pager.records().length}건`;
    }
    const prevButton = document.getElementById(`${type}-page-prev`);
    const nextButton = document.getElementById(`${type}-page-next`);
    if (prevButton) prevButton.disabled = pager.loading || pager.pageIndex === 0;
    if (nextButton) nextButton.disabled = pager.loading || !pager.hasNext;
}

function cloneAdminAggregate(value) {
    return value ? JSON.parse(JSON.stringify(value)) : null;
}

function adminStatsCacheKey(type, range) {
    return [
        `v${ADMIN_STATS_CACHE_VERSION}`,
        type,
        range.filter || currentFilter || "all",
        range.start || "*",
        range.end || "*"
    ].join("|");
}

function readAdminStatsCacheStore() {
    try {
        const raw = typeof sessionStorage !== "undefined"
            ? sessionStorage.getItem(ADMIN_STATS_CACHE_STORAGE_KEY)
            : null;
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && parsed.version === ADMIN_STATS_CACHE_VERSION && parsed.entries
            ? parsed
            : { version: ADMIN_STATS_CACHE_VERSION, entries: {} };
    } catch (error) {
        return { version: ADMIN_STATS_CACHE_VERSION, entries: {} };
    }
}

function writeAdminStatsCacheStore(store) {
    try {
        if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem(ADMIN_STATS_CACHE_STORAGE_KEY, JSON.stringify(store));
        }
    } catch (error) {
        // Keep using the in-memory cache when sessionStorage is blocked or full.
    }
}

function readAdminStatsCache(type, range) {
    const key = adminStatsCacheKey(type, range);
    const memoryEntry = adminStatsMemoryCache.get(key);
    if (memoryEntry && Date.now() - memoryEntry.savedAt <= ADMIN_STATS_CACHE_TTL_MS) {
        return cloneAdminAggregate(memoryEntry.result);
    }
    if (memoryEntry) adminStatsMemoryCache.delete(key);

    const store = readAdminStatsCacheStore();
    const entry = store.entries[key];
    if (!entry || Date.now() - Number(entry.savedAt || 0) > ADMIN_STATS_CACHE_TTL_MS) {
        if (entry) {
            delete store.entries[key];
            writeAdminStatsCacheStore(store);
        }
        return null;
    }
    adminStatsMemoryCache.set(key, entry);
    return cloneAdminAggregate(entry.result);
}

function writeAdminStatsCache(type, range, result) {
    const key = adminStatsCacheKey(type, range);
    const entry = { savedAt: Date.now(), result: cloneAdminAggregate(result) };
    adminStatsMemoryCache.set(key, entry);
    const store = readAdminStatsCacheStore();
    store.entries[key] = entry;

    // Bound the session cache even if many custom date ranges are queried.
    const keys = Object.keys(store.entries).sort((a, b) =>
        Number(store.entries[b]?.savedAt || 0) - Number(store.entries[a]?.savedAt || 0)
    );
    keys.slice(20).forEach((oldKey) => delete store.entries[oldKey]);
    writeAdminStatsCacheStore(store);
}

function invalidateAdminStatsCache(type) {
    const prefix = `v${ADMIN_STATS_CACHE_VERSION}|${type}|`;
    [...adminStatsMemoryCache.keys()].forEach((key) => {
        if (!type || key.startsWith(prefix)) adminStatsMemoryCache.delete(key);
    });
    const store = readAdminStatsCacheStore();
    Object.keys(store.entries).forEach((key) => {
        if (!type || key.startsWith(prefix)) delete store.entries[key];
    });
    writeAdminStatsCacheStore(store);
}

function getAdminPeriodAggregate(type) {
    return adminPeriodStats[type] || createEmptyAdminAggregate(type);
}

function formatAdminStatNumber(value) {
    return Number(value || 0).toLocaleString("ko-KR");
}

function updateAdminStatsProgressUi() {
    if (typeof document === "undefined") return;
    const visit = getAdminPeriodAggregate("visit");
    const ar = getAdminPeriodAggregate("ar");
    const values = {
        "period-visit-records": visit.recordCount,
        "period-visit-people": visit.peopleCount,
        "period-visit-purposes": visit.purposeSelectionCount,
        "period-ar-records": ar.recordCount,
        "period-ar-people": ar.peopleCount
    };
    Object.entries(values).forEach(([id, value]) => {
        const target = document.getElementById(id);
        if (target) target.textContent = formatAdminStatNumber(value);
    });

    const target = document.getElementById("admin-stats-status");
    if (!target) return;
    const progress = ["visit", "ar"].map((type) => adminStatsProgress[type]);
    const errors = progress.filter((item) => item.status === "error");
    const loading = progress.filter((item) => item.status === "loading");
    if (errors.length) {
        target.textContent = "전체 기간 통계를 불러오지 못했습니다. 조회 버튼을 눌러 다시 시도해 주세요.";
        target.dataset.state = "error";
    } else if (loading.length) {
        target.textContent = `전체 기간 집계 중 · 방문 ${formatAdminStatNumber(adminStatsProgress.visit.processed)}건 · AR ${formatAdminStatNumber(adminStatsProgress.ar.processed)}건`;
        target.dataset.state = "loading";
    } else if (progress.every((item) => item.status === "complete")) {
        const usedCache = progress.every((item) => item.fromCache);
        target.textContent = `${usedCache ? "세션 캐시 사용 · " : ""}전체 기간 통계 완료 · 방문 ${formatAdminStatNumber(visit.recordCount)}건 · AR ${formatAdminStatNumber(ar.recordCount)}건`;
        target.dataset.state = "complete";
    } else {
        target.textContent = "조회 버튼을 누르면 선택 기간 전체 통계를 집계합니다.";
        target.dataset.state = "idle";
    }
}

function isAdminStatsRequestActive(requestVersion) {
    return requestVersion === adminStatsRequestVersion
        && (typeof isAdminUser === "undefined" || isAdminUser);
}

async function loadAdminStatisticsForType(type, range, requestVersion, options = {}) {
    const forceType = options.force === true
        || (Array.isArray(options.forceTypes) && options.forceTypes.includes(type));
    if (!forceType) {
        const cached = readAdminStatsCache(type, range);
        if (cached) {
            adminStatsProgress[type] = {
                status: "complete",
                processed: cached.recordCount,
                fromCache: true,
                error: null
            };
            updateAdminStatsProgressUi();
            return cached;
        }
    }

    const aggregate = createEmptyAdminAggregate(type);
    const ref = type === "visit" ? visitLogsRef : arLogsRef;
    let anchor = null;

    while (isAdminStatsRequestActive(requestVersion)) {
        let query = ref.orderByChild("date");
        if (range.start) query = query.startAt(range.start);
        if (anchor) {
            query = query.endAt(anchor.date, anchor.key);
        } else if (range.end) {
            query = query.endAt(range.end);
        }
        query = query.limitToLast(ADMIN_STATS_PAGE_SIZE + 1);

        const snapshot = await query.once("value");
        if (!isAdminStatsRequestActive(requestVersion)) return null;

        let records = [];
        snapshot.forEach((child) => {
            const value = child.val();
            if (value && typeof value === "object") {
                records.push({ _key: child.key, ...value });
            }
        });
        const hasMore = records.length > ADMIN_STATS_PAGE_SIZE;
        if (anchor) {
            records = records.filter((record) =>
                !(record._key === anchor.key && (record.date ?? null) === anchor.date)
            );
        }
        if (records.length > ADMIN_STATS_PAGE_SIZE) {
            records = records.slice(records.length - ADMIN_STATS_PAGE_SIZE);
        }
        records.forEach((record) => accumulateAdminAggregate(type, aggregate, record));

        adminStatsProgress[type].processed = aggregate.recordCount;
        updateAdminStatsProgressUi();

        if (!hasMore || records.length === 0) break;
        const oldest = records[0];
        const nextAnchor = { date: oldest.date ?? null, key: oldest._key };
        if (anchor && anchor.date === nextAnchor.date && anchor.key === nextAnchor.key) {
            const error = new Error("ADMIN_STATS_CURSOR_STALLED");
            error.code = "ADMIN_STATS_CURSOR_STALLED";
            throw error;
        }
        anchor = nextAnchor;
    }

    if (!isAdminStatsRequestActive(requestVersion)) return null;
    writeAdminStatsCache(type, range, aggregate);
    return aggregate;
}

async function reloadAdminStatistics(options = {}) {
    let range;
    try {
        range = getAdminDateRange();
    } catch (error) {
        showMessage("조회 시작일과 종료일을 올바르게 입력해 주세요.");
        return false;
    }

    const requestSignature = adminStatsCacheKey("combined", range);
    const alreadyLoading = ["visit", "ar"].some((type) =>
        adminStatsProgress[type].status === "loading"
    );
    if (!options.force && !options.forceTypes && alreadyLoading && adminStatsActiveSignature === requestSignature) {
        return false;
    }
    adminStatsActiveSignature = requestSignature;
    const requestVersion = ++adminStatsRequestVersion;
    ["visit", "ar"].forEach((type) => {
        adminPeriodStats[type] = null;
        adminStatsProgress[type] = {
            status: "loading",
            processed: 0,
            fromCache: false,
            error: null
        };
    });
    updateAdminStatsProgressUi();
    if (typeof updateAdminDashboard === "function") updateAdminDashboard();

    const results = await Promise.allSettled([
        loadAdminStatisticsForType("visit", range, requestVersion, options),
        loadAdminStatisticsForType("ar", range, requestVersion, options)
    ]);
    if (!isAdminStatsRequestActive(requestVersion)) return false;

    let failed = false;
    ["visit", "ar"].forEach((type, index) => {
        const result = results[index];
        if (result.status === "fulfilled" && result.value) {
            adminPeriodStats[type] = result.value;
            adminStatsProgress[type] = {
                status: "complete",
                processed: result.value.recordCount,
                fromCache: adminStatsProgress[type].fromCache,
                error: null
            };
        } else {
            failed = true;
            const error = result.status === "rejected"
                ? result.reason
                : new Error("STALE_ADMIN_STATS_RESULT");
            adminStatsProgress[type] = {
                status: "error",
                processed: adminStatsProgress[type].processed,
                fromCache: false,
                error
            };
            logError(`admin-${type}-statistics`, error);
        }
    });
    if (typeof updateAdminDashboard === "function") updateAdminDashboard();
    updateAdminStatsProgressUi();
    if (failed) {
        showMessage("전체 기간 통계를 불러오지 못했습니다. 네트워크 연결 후 조회를 다시 눌러 주세요.");
    }
    if (adminStatsActiveSignature === requestSignature) {
        adminStatsActiveSignature = "";
    }
    return !failed;
}

function cancelAdminStatisticsLoads() {
    adminStatsRequestVersion += 1;
    adminStatsActiveSignature = "";
    ["visit", "ar"].forEach((type) => {
        adminPeriodStats[type] = null;
        adminStatsProgress[type].status = "idle";
        adminStatsProgress[type].processed = 0;
        adminStatsProgress[type].error = null;
    });
    if (typeof updateAdminDashboard === "function") updateAdminDashboard();
    updateAdminStatsProgressUi();
}

async function loadAdminLogPage(type, options = {}) {
    const pager = adminLogPagers[type];
    if (!pager) return;
    const reset = options.reset === true;
    if (reset) {
        pager.anchors = [null];
        pager.pageIndex = 0;
    }

    const requestVersion = ++pager.requestVersion;
    setAdminPagerLoading(type, true);

    let range;
    try {
        range = getAdminDateRange();
    } catch (error) {
        setAdminPagerLoading(type, false);
        updateAdminPagerUi(type);
        showMessage("조회 시작일과 종료일을 올바르게 입력해 주세요.");
        return;
    }

    const anchor = pager.anchors[pager.pageIndex] || null;
    let query = pager.ref.orderByChild("date");
    if (range.start) query = query.startAt(range.start);
    if (anchor) {
        query = query.endAt(anchor.date, anchor.key).limitToLast(ADMIN_LOG_PAGE_SIZE + 2);
    } else {
        if (range.end) query = query.endAt(range.end);
        query = query.limitToLast(ADMIN_LOG_PAGE_SIZE + 1);
    }

    try {
        const snapshot = await query.once("value");
        if (requestVersion !== pager.requestVersion || !isAdminUser) return;

        let records = [];
        snapshot.forEach((child) => {
            const value = child.val();
            if (value && typeof value === "object") {
                records.push({ _key: child.key, ...value });
            }
        });
        if (anchor) {
            records = records.filter((record) =>
                !(record._key === anchor.key && (record.date ?? null) === anchor.date)
            );
        }
        pager.hasNext = records.length > ADMIN_LOG_PAGE_SIZE;
        if (pager.hasNext) {
            records = records.slice(records.length - ADMIN_LOG_PAGE_SIZE);
        }
        pager.assign(records);
        updateAdminDashboard();
    } catch (error) {
        if (requestVersion !== pager.requestVersion) return;
        logError(`admin-${type}-page`, error);
        showMessage("관리자 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
        if (requestVersion === pager.requestVersion) {
            setAdminPagerLoading(type, false);
            updateAdminPagerUi(type);
        }
    }
}

function moveAdminLogPage(type, direction) {
    const pager = adminLogPagers[type];
    if (!pager || pager.loading) return;
    if (direction === "next") {
        if (!pager.hasNext || !pager.records().length) return;
        const oldest = pager.records()[0];
        pager.anchors = pager.anchors.slice(0, pager.pageIndex + 1);
        pager.anchors.push({ date: oldest.date ?? null, key: oldest._key });
        pager.pageIndex += 1;
    } else if (direction === "prev") {
        if (pager.pageIndex === 0) return;
        pager.pageIndex -= 1;
    }
    return loadAdminLogPage(type);
}

function reloadAdminPages(options = {}) {
    try {
        getAdminDateRange();
    } catch (error) {
        showMessage("조회 시작일과 종료일을 올바르게 입력해 주세요.");
        return Promise.resolve(false);
    }
    return Promise.all([
        loadAdminLogPage("visit", { reset: true }),
        loadAdminLogPage("ar", { reset: true }),
        reloadAdminStatistics(options)
    ]);
}

function cancelAdminLogLoads(type) {
    const types = type ? [type] : Object.keys(adminLogPagers);
    types.forEach((name) => {
        const pager = adminLogPagers[name];
        pager.requestVersion += 1;
        pager.loading = false;
        pager.anchors = [null];
        pager.pageIndex = 0;
        pager.hasNext = false;
        pager.assign([]);
        updateAdminPagerUi(name);
    });
}
