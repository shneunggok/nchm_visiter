const ADMIN_LOG_PAGE_SIZE = 100;
const ADMIN_LOG_QUERY_OVERFETCH = 2;
const ADMIN_STATS_PAGE_SIZE = 400;
const ADMIN_EXPORT_PAGE_SIZE = 400;
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
let adminLegacyVisitRecords = null;
let adminLegacyVisitLoadPromise = null;
const adminStatsMemoryCache = new Map();
const adminPeriodStats = {
    visit: null,
    ar: null
};
const adminStatsProgress = {
    visit: { status: "idle", processed: 0, fromCache: false, error: null },
    ar: { status: "idle", processed: 0, fromCache: false, error: null }
};
const adminExportStates = {
    visit: { loading: false, requestVersion: 0, processed: 0 },
    ar: { loading: false, requestVersion: 0, processed: 0 }
};
let adminArTodayQuery = null;
let adminArTodayDate = "";
let adminArTodayRecords = [];
let adminArTodayGroups = new Map();
let adminArScheduleUiBound = false;
let adminArDetailPreviousBodyOverflow = "";
let adminArDetailReturnFocus = null;

function compareArReservationTimes(first, second) {
    const firstMinutes = getArTimeMinutes(first?.timeSlot);
    const secondMinutes = getArTimeMinutes(second?.timeSlot);
    if (firstMinutes === null && secondMinutes !== null) return 1;
    if (firstMinutes !== null && secondMinutes === null) return -1;
    if (firstMinutes !== secondMinutes) return (firstMinutes || 0) - (secondMinutes || 0);
    const firstCreatedAt = Number(first?.createdAt) || 0;
    const secondCreatedAt = Number(second?.createdAt) || 0;
    if (firstCreatedAt !== secondCreatedAt) return firstCreatedAt - secondCreatedAt;
    return String(first?._key || "").localeCompare(String(second?._key || ""));
}

function buildAdminArTodaySchedule(records, dateKey, now = new Date()) {
    const schedule = getArOperatingSchedule(now);
    const groups = new Map();
    toArray(records).forEach((record) => {
        if (!record || typeof record !== "object" || record.date !== dateKey) return;
        const timeSlot = normalizeArTimeSlot(record.timeSlot);
        if (!timeSlot) return;
        if (!groups.has(timeSlot)) groups.set(timeSlot, []);
        groups.get(timeSlot).push(record);
    });
    groups.forEach((logs) => logs.sort(compareArReservationTimes));

    const operatingTimes = schedule.slots.map((slot) => slot.time);
    const extraTimes = [...groups.keys()]
        .filter((timeSlot) => !operatingTimes.includes(timeSlot))
        .sort((first, second) => getArTimeMinutes(first) - getArTimeMinutes(second));
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    return operatingTimes.concat(extraTimes)
        .sort((first, second) => getArTimeMinutes(first) - getArTimeMinutes(second))
        .map((timeSlot) => {
            const logs = groups.get(timeSlot) || [];
            const users = logs.flatMap((log) =>
                toArray(log.users).filter((user) => user && typeof user === "object")
            );
            const startMinutes = getArTimeMinutes(timeSlot);
            let timeState = "upcoming";
            if (startMinutes !== null && currentMinutes >= startMinutes + 30) {
                timeState = "past";
            } else if (startMinutes !== null && currentMinutes >= startMinutes) {
                timeState = "current";
            }
            return {
                timeSlot,
                logs,
                users,
                representative: String(users[0]?.name || "").trim(),
                isExtra: extraTimes.includes(timeSlot),
                timeState
            };
        });
}

function formatAdminArTodayDate(dateKey) {
    if (!isValidDateKey(dateKey)) return dateKey || "";
    const [year, month, day] = dateKey.split("-");
    return `${year}.${month}.${day}`;
}

function bindAdminArScheduleUi() {
    if (adminArScheduleUiBound || typeof document === "undefined") return;
    const grid = dom.adminArTodayGrid;
    const modal = dom.adminArDetailModal;
    if (!grid || !modal) return;
    adminArScheduleUiBound = true;

    grid.addEventListener("click", (event) => {
        const button = event.target.closest?.("[data-admin-ar-time]");
        if (!button) return;
        openAdminArReservationDetail(button.dataset.adminArTime);
    });
    dom.adminArDetailClose?.addEventListener("click", closeAdminArReservationDetail);
    dom.adminArDetailConfirm?.addEventListener("click", closeAdminArReservationDetail);
    modal.addEventListener("click", (event) => {
        if (event.target === modal) closeAdminArReservationDetail();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !modal.classList.contains("hidden")) {
            event.preventDefault();
            closeAdminArReservationDetail();
        }
    });
}

function openAdminArReservationDetail(timeSlot) {
    const group = adminArTodayGroups.get(normalizeArTimeSlot(timeSlot));
    const modal = dom.adminArDetailModal;
    const content = dom.adminArDetailContent;
    if (!group || !group.logs.length || !modal || !content) return;

    const participantRows = group.users.map((user, index) =>
        `<li><strong>${index + 1}. ${escapeHtml(user.name || "이름 없음")}</strong>` +
        `<span>${escapeHtml(user.gender || "성별 미상")}</span></li>`
    ).join("");
    const duplicateNotice = group.logs.length > 1
        ? `<p class="admin-ar-detail-warning">동일 시간에 ${group.logs.length}개의 예약 기록이 확인되었습니다.</p>`
        : "";
    content.innerHTML =
        `<div class="admin-ar-detail-summary">` +
        `<div><span>예약 날짜</span><strong>${escapeHtml(formatAdminArTodayDate(adminArTodayDate))}</strong></div>` +
        `<div><span>예약 시간</span><strong>${escapeHtml(group.timeSlot)}</strong></div>` +
        `<div><span>대표자</span><strong>${escapeHtml(group.representative || "이름 없음")}</strong></div>` +
        `<div><span>총 인원</span><strong>${group.users.length}명</strong></div>` +
        `</div>${duplicateNotice}` +
        `<p class="admin-ar-detail-list-title">전체 이용자</p>` +
        `<ol class="admin-ar-detail-list">${participantRows || "<li><strong>이용자 정보가 없습니다.</strong></li>"}</ol>`;

    adminArDetailReturnFocus = document.activeElement;
    adminArDetailPreviousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    dom.adminArDetailClose?.focus();
}

function closeAdminArReservationDetail() {
    const modal = dom.adminArDetailModal;
    if (!modal || modal.classList.contains("hidden")) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = adminArDetailPreviousBodyOverflow;
    adminArDetailPreviousBodyOverflow = "";
    if (adminArDetailReturnFocus && typeof adminArDetailReturnFocus.focus === "function") {
        adminArDetailReturnFocus.focus();
    }
    adminArDetailReturnFocus = null;
}

function renderAdminArTodaySchedule() {
    const grid = dom.adminArTodayGrid;
    if (!grid) return;
    bindAdminArScheduleUi();
    const now = new Date();
    const dateKey = adminArTodayDate || formatLocalDate(now);
    const groups = buildAdminArTodaySchedule(adminArTodayRecords, dateKey, now);
    adminArTodayGroups = new Map(groups.map((group) => [group.timeSlot, group]));
    const reservationCount = groups.reduce((sum, group) => sum + group.logs.length, 0);

    if (dom.adminArTodayDate) {
        dom.adminArTodayDate.textContent = `${formatAdminArTodayDate(dateKey)} · ${getArOperatingSchedule(now).label}`;
    }
    if (dom.adminArTodayCount) dom.adminArTodayCount.textContent = `${reservationCount}팀`;
    grid.innerHTML = groups.map((group) => {
        const stateClass = group.timeState === "current"
            ? " is-current"
            : group.timeState === "past" ? " is-past" : "";
        const extraClass = group.isExtra ? " is-extra" : "";
        if (!group.logs.length) {
            return `<div class="admin-ar-slot-card${stateClass}${extraClass}">` +
                `<span class="admin-ar-slot-time">${escapeHtml(group.timeSlot)}</span>` +
                `<span class="admin-ar-slot-label">예약 없음</span>` +
                `<span class="admin-ar-slot-meta">${group.timeState === "past" ? "지난 시간" : "예약 가능"}</span></div>`;
        }
        const duplicateLabel = group.logs.length > 1 ? ` · 기록 ${group.logs.length}건` : "";
        return `<button type="button" class="admin-ar-slot-card is-reserved${stateClass}${extraClass}" ` +
            `data-admin-ar-time="${escapeHtml(group.timeSlot)}">` +
            `<span class="admin-ar-slot-time">${escapeHtml(group.timeSlot)}</span>` +
            `<span class="admin-ar-slot-label">${escapeHtml(group.representative || "이름 없음")} · ${group.users.length}명</span>` +
            `<span class="admin-ar-slot-meta">예약 상세 보기${duplicateLabel}</span></button>`;
    }).join("");

    if (dom.adminArTodayStatus) {
        dom.adminArTodayStatus.dataset.state = "complete";
        dom.adminArTodayStatus.textContent = reservationCount
            ? "예약된 시간 카드를 누르면 전체 이용자 이름과 성별을 확인할 수 있습니다."
            : "오늘 등록된 AR 예약이 없습니다.";
    }
}

function detachAdminArTodayQuery() {
    if (!adminArTodayQuery) return;
    adminArTodayQuery.off();
    adminArTodayQuery = null;
}

function subscribeAdminArTodaySchedule() {
    if (typeof isAdminUser !== "undefined" && !isAdminUser) return false;
    const today = formatLocalDate(new Date());
    if (adminArTodayQuery && adminArTodayDate === today) return true;

    detachAdminArTodayQuery();
    adminArTodayDate = today;
    adminArTodayRecords = [];
    if (dom.adminArTodayStatus) {
        dom.adminArTodayStatus.dataset.state = "loading";
        dom.adminArTodayStatus.textContent = "오늘 예약을 불러오는 중입니다.";
    }
    const query = arLogsRef.orderByChild("date").equalTo(today).limitToLast(50);
    adminArTodayQuery = query;
    query.on("value", (snapshot) => {
        if (adminArTodayQuery !== query) return;
        const records = [];
        snapshot.forEach((child) => {
            const value = child.val();
            if (value && typeof value === "object") {
                records.push({ _key: child.key, ...value });
            }
        });
        adminArTodayRecords = records.sort(compareArReservationTimes);
        renderAdminArTodaySchedule();
    }, (error) => {
        if (adminArTodayQuery !== query) return;
        logError("adminArTodayQuery.on", error);
        adminArTodayQuery = null;
        if (dom.adminArTodayStatus) {
            dom.adminArTodayStatus.dataset.state = "error";
            dom.adminArTodayStatus.textContent = "오늘 예약 시간표를 불러오지 못했습니다. 잠시 후 관리자 화면에 다시 들어와 주세요.";
        }
    });
    return true;
}

function unsubscribeAdminArTodaySchedule() {
    detachAdminArTodayQuery();
    closeAdminArReservationDetail();
    adminArTodayDate = "";
    adminArTodayRecords = [];
    adminArTodayGroups = new Map();
    if (dom.adminArTodayGrid) {
        dom.adminArTodayGrid.innerHTML = '<div class="admin-ar-today-loading">관리자 로그인 후 오늘 예약이 표시됩니다.</div>';
    }
}

function refreshAdminArTodayScheduleDate() {
    if (typeof isAdminUser === "undefined" || !isAdminUser) return false;
    const today = formatLocalDate(new Date());
    if (adminArTodayDate === today && adminArTodayQuery) {
        renderAdminArTodaySchedule();
        return true;
    }
    return subscribeAdminArTodaySchedule();
}

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

function adminExportButtonId(type) {
    return `${type}-period-csv-btn`;
}

function updateAdminExportButton(type) {
    if (typeof document === "undefined") return;
    const state = adminExportStates[type];
    const button = document.getElementById(adminExportButtonId(type));
    if (!state || !button) return;
    const label = button.querySelector?.("[data-export-label]");
    button.disabled = state.loading;
    button.setAttribute?.("aria-busy", state.loading ? "true" : "false");
    const text = state.loading
        ? `${formatAdminStatNumber(state.processed)}건 불러오는 중`
        : "선택 기간 전체 CSV";
    if (label) {
        label.textContent = text;
    } else {
        button.textContent = text;
    }
}

function setAdminExportLoading(type, loading, processed = 0) {
    const state = adminExportStates[type];
    if (!state) return;
    state.loading = loading;
    state.processed = processed;
    updateAdminExportButton(type);
}

function isAdminExportRequestActive(type, requestVersion) {
    const state = adminExportStates[type];
    return Boolean(state)
        && state.requestVersion === requestVersion
        && (typeof isAdminUser === "undefined" || isAdminUser);
}

function cancelAdminExportLoads(type) {
    const types = type ? [type] : Object.keys(adminExportStates);
    types.forEach((name) => {
        const state = adminExportStates[name];
        if (!state) return;
        state.requestVersion += 1;
        setAdminExportLoading(name, false, 0);
    });
}

function getAdminExportTimeMinutes(type, record) {
    const rawTime = type === "visit" ? record?.time : record?.timeSlot;
    const match = typeof rawTime === "string"
        ? rawTime.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
        : null;
    return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
}

function compareAdminExportRecords(type, first, second) {
    const firstDate = isValidDateKey(first?.date) ? first.date : "";
    const secondDate = isValidDateKey(second?.date) ? second.date : "";
    if (firstDate !== secondDate) return secondDate.localeCompare(firstDate);

    const timeDifference = getAdminExportTimeMinutes(type, second)
        - getAdminExportTimeMinutes(type, first);
    if (timeDifference) return timeDifference;

    const firstCreatedAt = Number.isFinite(first?.createdAt) ? first.createdAt : 0;
    const secondCreatedAt = Number.isFinite(second?.createdAt) ? second.createdAt : 0;
    if (firstCreatedAt !== secondCreatedAt) return secondCreatedAt - firstCreatedAt;
    return -compareAdminFirebaseKeys(first?._key || "", second?._key || "");
}

async function loadAdminExportRecords(type, range, requestVersion, onProgress) {
    const ref = type === "visit" ? visitLogsRef : arLogsRef;
    const records = [];
    const seenKeys = new Set();
    let anchor = null;

    while (isAdminExportRequestActive(type, requestVersion)) {
        let query = ref.orderByChild("date");
        if (range.start) query = query.startAt(range.start);
        if (anchor) {
            query = query.endAt(anchor.date, anchor.key);
        } else if (range.end) {
            query = query.endAt(range.end);
        }
        query = query.limitToLast(ADMIN_EXPORT_PAGE_SIZE + 1);

        const snapshot = await query.once("value");
        if (!isAdminExportRequestActive(type, requestVersion)) return null;

        let page = [];
        snapshot.forEach((child) => {
            const value = child.val();
            page.push({
                key: child.key,
                date: value && typeof value === "object" ? value.date ?? null : null,
                value
            });
        });
        const hasMore = page.length > ADMIN_EXPORT_PAGE_SIZE;
        if (anchor) {
            page = page.filter((entry) =>
                !(entry.key === anchor.key && entry.date === anchor.date)
            );
        }
        if (page.length > ADMIN_EXPORT_PAGE_SIZE) {
            page = page.slice(page.length - ADMIN_EXPORT_PAGE_SIZE);
        }

        page.forEach((entry) => {
            if (!entry.value || typeof entry.value !== "object" || seenKeys.has(entry.key)) return;
            seenKeys.add(entry.key);
            records.push({ _key: entry.key, ...entry.value });
        });
        if (typeof onProgress === "function") onProgress(records.length);

        if (!hasMore || page.length === 0) break;
        const oldest = page[0];
        const nextAnchor = { date: oldest.date, key: oldest.key };
        if (anchor && anchor.date === nextAnchor.date && anchor.key === nextAnchor.key) {
            const error = new Error("ADMIN_EXPORT_CURSOR_STALLED");
            error.code = "ADMIN_EXPORT_CURSOR_STALLED";
            throw error;
        }
        anchor = nextAnchor;
    }

    if (!isAdminExportRequestActive(type, requestVersion)) return null;
    records.sort((first, second) => compareAdminExportRecords(type, first, second));
    return records;
}

function createAdminPeriodCsv(type, records) {
    const rows = [];
    if (type === "visit") {
        rows.push(["날짜", "시간", "이름", "성별", "나이", "이용목적"]);
        records.forEach((record) => {
            rows.push([
                record.date,
                record.time,
                record.name,
                record.gender,
                (record.age || "").split("(")[0],
                toArray(record.purposes).join(", ")
            ]);
        });
    } else {
        rows.push(["예약날짜", "예약시간", "대표자", "총인원", "이용자상세"]);
        records.forEach((record) => {
            const users = toArray(record.users).filter((user) =>
                user && typeof user === "object"
            );
            const details = users.map((user) =>
                `${user.name || ""}(${user.gender || ""}/${(user.age || "").split("(")[0]})`
            ).join(" | ");
            rows.push([
                record.date,
                record.timeSlot,
                users[0]?.name || "",
                users.length,
                details
            ]);
        });
    }
    return "\uFEFF" + rows
        .map((row) => row.map((value) => escapeCsvCell(value)).join(","))
        .join("\r\n") + "\r\n";
}

function adminExportFileName(type, range) {
    const label = range.start && range.end
        ? `${range.start}_${range.end}`
        : "전체";
    return `${type === "visit" ? "방문등록" : "AR예약"}_${label}.csv`;
}

function saveAdminCsvFile(content, fileName) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function exportAdminPeriodCsv(type) {
    const state = adminExportStates[type];
    if (!state || state.loading) return false;
    if (typeof isAdminUser !== "undefined" && !isAdminUser) {
        showMessage("관리자 로그인 후 다운로드해 주세요.");
        return false;
    }

    let range;
    try {
        range = getAdminDateRange();
    } catch (error) {
        showMessage("조회 시작일과 종료일을 올바르게 입력해 주세요.");
        return false;
    }

    const requestVersion = ++state.requestVersion;
    setAdminExportLoading(type, true, 0);
    try {
        const records = await loadAdminExportRecords(
            type,
            range,
            requestVersion,
            (processed) => {
                if (!isAdminExportRequestActive(type, requestVersion)) return;
                state.processed = processed;
                updateAdminExportButton(type);
            }
        );
        if (!records || !isAdminExportRequestActive(type, requestVersion)) return false;
        if (records.length === 0) {
            showMessage("선택한 기간에 다운로드할 데이터가 없습니다.", "info");
            return false;
        }
        saveAdminCsvFile(
            createAdminPeriodCsv(type, records),
            adminExportFileName(type, range)
        );
        showMessage(`${formatAdminStatNumber(records.length)}건 CSV 다운로드를 완료했습니다.`, "success");
        return true;
    } catch (error) {
        if (!isAdminExportRequestActive(type, requestVersion)) return false;
        logError(`admin-${type}-csv-export`, error);
        showMessage("전체 기간 데이터를 불러오지 못했습니다. 네트워크 연결 후 다시 시도해 주세요.");
        return false;
    } finally {
        if (state.requestVersion === requestVersion) {
            setAdminExportLoading(type, false, 0);
        }
    }
}

function parseAdminLocalDateTimestamp(dateKey, endOfDay = false) {
    if (!isValidDateKey(dateKey)) return null;
    const [year, month, day] = dateKey.split("-").map(Number);
    const timestamp = endOfDay
        ? new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
        : new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
}

function getAdminTimestampRange(range) {
    const start = range.start ? parseAdminLocalDateTimestamp(range.start) : 0;
    const end = range.end
        ? parseAdminLocalDateTimestamp(range.end, true)
        : Number.MAX_SAFE_INTEGER;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
        const error = new Error("INVALID_DATE_RANGE");
        error.code = "INVALID_DATE_RANGE";
        throw error;
    }
    return { start, end };
}

function getLegacyVisitTimestamp(record) {
    const dateStart = parseAdminLocalDateTimestamp(record?.date);
    if (!Number.isFinite(dateStart)) return 0;
    const match = typeof record.time === "string"
        ? record.time.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
        : null;
    if (!match) return dateStart;
    return dateStart + (Number(match[1]) * 60 + Number(match[2])) * 60 * 1000;
}

function getFirebaseIntegerKey(key) {
    const value = String(key);
    if (!/^-?(0*)\d{1,10}$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= -2147483648 && parsed <= 2147483647
        ? parsed
        : null;
}

function compareAdminFirebaseKeys(firstKeyValue, secondKeyValue) {
    const firstKey = String(firstKeyValue);
    const secondKey = String(secondKeyValue);
    if (firstKey === secondKey) return 0;
    const firstInteger = getFirebaseIntegerKey(firstKey);
    const secondInteger = getFirebaseIntegerKey(secondKey);
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
}

function compareVisitRecordsNewest(first, second) {
    const timestampDifference = second._sortCreatedAt - first._sortCreatedAt;
    if (timestampDifference) return timestampDifference;
    return -compareAdminFirebaseKeys(first._key, second._key);
}

function isVisitRecordOlderThanCursor(record, cursor) {
    if (!cursor) return true;
    if (record._sortCreatedAt !== cursor.createdAt) {
        return record._sortCreatedAt < cursor.createdAt;
    }
    return compareAdminFirebaseKeys(record._key, cursor.key) < 0;
}

function isLegacyVisitInRange(record, range) {
    if (!isValidDateKey(record?.date)) return range.filter === "all";
    if (range.start && record.date < range.start) return false;
    if (range.end && record.date > range.end) return false;
    return true;
}

function invalidateAdminLegacyVisitCache() {
    adminLegacyVisitRecords = null;
    adminLegacyVisitLoadPromise = null;
}

function loadAdminLegacyVisitRecords() {
    if (adminLegacyVisitRecords) return Promise.resolve(adminLegacyVisitRecords);
    if (adminLegacyVisitLoadPromise) return adminLegacyVisitLoadPromise;

    adminLegacyVisitLoadPromise = visitLogsRef
        .orderByChild("createdAt")
        .equalTo(null)
        .once("value")
        .then((snapshot) => {
            const records = [];
            snapshot.forEach((child) => {
                const value = child.val();
                if (!value || typeof value !== "object" || Number.isFinite(value.createdAt)) return;
                records.push({
                    _key: child.key,
                    ...value,
                    _sortCreatedAt: getLegacyVisitTimestamp(value),
                    _legacyCreatedAt: true
                });
            });
            records.sort(compareVisitRecordsNewest);
            adminLegacyVisitRecords = records;
            return records;
        })
        .finally(() => {
            adminLegacyVisitLoadPromise = null;
        });
    return adminLegacyVisitLoadPromise;
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

    try {
        const anchor = pager.anchors[pager.pageIndex] || null;
        let records;

        if (type === "visit") {
            const timestampRange = getAdminTimestampRange(range);
            let query = pager.ref
                .orderByChild("createdAt")
                .startAt(timestampRange.start);
            query = anchor
                ? query.endAt(anchor.createdAt, anchor.key)
                : query.endAt(timestampRange.end);
            query = query.limitToLast(ADMIN_LOG_PAGE_SIZE + ADMIN_LOG_QUERY_OVERFETCH);

            const [snapshot, legacyRecords] = await Promise.all([
                query.once("value"),
                loadAdminLegacyVisitRecords()
            ]);
            if (requestVersion !== pager.requestVersion || !isAdminUser) return;

            const candidates = [];
            snapshot.forEach((child) => {
                const value = child.val();
                if (!value || typeof value !== "object" || !Number.isFinite(value.createdAt)) return;
                const record = {
                    _key: child.key,
                    ...value,
                    _sortCreatedAt: value.createdAt,
                    _legacyCreatedAt: false
                };
                if (isVisitRecordOlderThanCursor(record, anchor)) candidates.push(record);
            });
            let legacyCandidateCount = 0;
            for (const record of legacyRecords) {
                if (isLegacyVisitInRange(record, range) &&
                    isVisitRecordOlderThanCursor(record, anchor)) {
                    candidates.push(record);
                    legacyCandidateCount += 1;
                    if (legacyCandidateCount >=
                        ADMIN_LOG_PAGE_SIZE + ADMIN_LOG_QUERY_OVERFETCH) break;
                }
            }
            candidates.sort(compareVisitRecordsNewest);
            pager.hasNext = candidates.length > ADMIN_LOG_PAGE_SIZE;
            records = candidates.slice(0, ADMIN_LOG_PAGE_SIZE);
        } else {
            let query = pager.ref.orderByChild("date");
            if (range.start) query = query.startAt(range.start);
            if (anchor) {
                query = query.endAt(anchor.date, anchor.key)
                    .limitToLast(ADMIN_LOG_PAGE_SIZE + ADMIN_LOG_QUERY_OVERFETCH);
            } else {
                if (range.end) query = query.endAt(range.end);
                query = query.limitToLast(ADMIN_LOG_PAGE_SIZE + 1);
            }

            const snapshot = await query.once("value");
            if (requestVersion !== pager.requestVersion || !isAdminUser) return;

            records = [];
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
        const oldest = type === "visit"
            ? pager.records()[pager.records().length - 1]
            : pager.records()[0];
        pager.anchors = pager.anchors.slice(0, pager.pageIndex + 1);
        pager.anchors.push(type === "visit"
            ? { createdAt: oldest._sortCreatedAt, key: oldest._key }
            : { date: oldest.date ?? null, key: oldest._key });
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
