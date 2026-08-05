const dom = {
    customAlert: document.getElementById("custom-alert"),
    currentDate: document.getElementById("current-date"),
    adminEntryBtn: document.getElementById("admin-entry-btn"),
    exitAdminBtn: document.getElementById("exit-admin-btn"),
    mainTabs: document.getElementById("main-tabs"),
    adminTabs: document.getElementById("admin-tabs"),
    mainContentContainer: document.getElementById("main-content-container"),
    passwordModal: document.getElementById("password-modal"),
    adminEmailInput: document.getElementById("admin-email-input"),
    adminPasswordInput: document.getElementById("admin-password-input"),
    adminVerifyBtn: document.getElementById("admin-verify-btn"),
    sectionVisit: document.getElementById("section-visit"),
    sectionAr: document.getElementById("section-ar"),
    sectionAdmin: document.getElementById("section-admin"),
    adminVisitLogs: document.getElementById("admin-visit-logs"),
    adminArLogs: document.getElementById("admin-ar-logs"),
    adminOperations: document.getElementById("admin-operations"),
    adminArTodayDate: document.getElementById("admin-ar-today-date"),
    adminArTodayCount: document.getElementById("admin-ar-today-count"),
    adminArTodayGrid: document.getElementById("admin-ar-today-grid"),
    adminArTodayStatus: document.getElementById("admin-ar-today-status"),
    adminArDetailModal: document.getElementById("admin-ar-detail-modal"),
    adminArDetailContent: document.getElementById("admin-ar-detail-content"),
    adminArDetailClose: document.getElementById("admin-ar-detail-close"),
    adminArDetailConfirm: document.getElementById("admin-ar-detail-confirm"),
    visitUserContainer: document.getElementById("visit-user-container"),
    arUserContainer: document.getElementById("ar-user-container"),
    arDayIndicator: document.getElementById("ar-day-indicator"),
    timeContainer: document.getElementById("time-container"),
    arAvailableOnly: document.getElementById("ar-available-only"),
    arSlotMoreButton: document.getElementById("ar-slot-more-button"),
    visitStatsBody: document.getElementById("visit-stats-body"),
    visitStatsFooter: document.getElementById("visit-stats-footer"),
    studyStatsBody: document.getElementById("study-stats-body"),
    studyStatsFooter: document.getElementById("study-stats-footer"),
    arStatsBody: document.getElementById("ar-stats-body"),
    arStatsFooter: document.getElementById("ar-stats-footer"),
    visitLogBody: document.getElementById("visit-log-body"),
    arLogBody: document.getElementById("ar-log-body"),
    visitCountBadge: document.getElementById("visit-count-badge"),
    arCountBadge: document.getElementById("ar-count-badge"),
    vCountMinus: document.getElementById("v-count-minus"),
    vCountDisplay: document.getElementById("v-count-display"),
    arCountDisplay: document.getElementById("ar-count-display"),
    arCountMinus: document.getElementById("ar-count-minus"),
    arCountPlus: document.getElementById("ar-count-plus"),
    startDate: document.getElementById("start-date"),
    endDate: document.getElementById("end-date"),
    filterYearSelect: document.getElementById("filter-year-select"),
    filterMonthSelect: document.getElementById("filter-month-select"),
    customDateInputs: document.getElementById("custom-date-inputs"),
    arNoticeModal: document.getElementById("ar-notice-modal"),
    arNoticeBtn: document.getElementById("arNoticeBtn"),
    btnCover: document.getElementById("btnCover"),
    btnText: document.getElementById("btnText")
};

let arOperationsState = {};
let arOperationsListener = null;

let _toastTimer = null;

function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value === null || value === undefined ? "" : String(value);
    return div.innerHTML;
}

function logError(context, error) {
    const code = error && error.code ? error.code : "unknown_error";
    console.error(`[nchm:${context}] ${code}`);
}

function sanitizeCsvField(value) {
    const str = value === null || value === undefined ? "" : String(value);
    if (/^[=+\-@]/.test(str)) {
        return "'" + str;
    }
    return str;
}

function escapeCsvCell(value) {
    return `"${sanitizeCsvField(value).replace(/"/g, '""')}"`;
}

function formatLocalDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return Object.values(value);
    return [];
}

function isValidDateKey(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function showMessage(msg, type = "error") {
    const box = dom.customAlert;
    if (!box) return;

    if (_toastTimer) {
        clearTimeout(_toastTimer);
        _toastTimer = null;
    }

    const normalizedType = ["success", "info"].includes(type) ? type : "error";
    const messageElement = box.querySelector?.("#custom-alert-message");
    const iconElement = box.querySelector?.("#custom-alert-icon");
    const iconByType = { error: "!", success: "✓", info: "i" };

    if (messageElement) messageElement.textContent = msg;
    else box.textContent = msg;
    if (iconElement) iconElement.textContent = iconByType[normalizedType];

    box.className = normalizedType;
    box.dataset.type = normalizedType;
    box.setAttribute?.("role", normalizedType === "error" ? "alert" : "status");
    box.setAttribute?.("aria-live", normalizedType === "error" ? "assertive" : "polite");
    box.setAttribute?.("aria-atomic", "true");
    box.style.display = "flex";

    const duration = Math.min(4000, Math.max(2500, msg.length * 60));
    _toastTimer = setTimeout(() => {
        box.style.display = "none";
        _toastTimer = null;
    }, duration);
}

function createSlotKey(dateStr, timeSlot) {
    return `${dateStr}_${timeSlot}`.replace(/[.#$\[\]\/]/g, "-");
}

function getArOperatingSchedule(date = new Date()) {
    const dateValue = date && typeof date.getTime === "function" ? date.getTime() : date;
    const parsedDate = new Date(dateValue);
    const targetDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
    const dateKey = formatLocalDate(targetDate);
    const exception = arOperationsState?.[dateKey];
    const isWeekend = targetDate.getDay() === 0 || targetDate.getDay() === 6;
    const slots = [];
    if (exception?.closed === true) {
        return { isWeekend, isClosed: true, label: "휴관일 · AR 예약 불가", slots: [] };
    }
    const defaultEnd = isWeekend ? "17:30" : "20:30";
    const start = normalizeArTimeSlot(exception?.start) || "10:00";
    const end = normalizeArTimeSlot(exception?.end) || defaultEnd;
    const startMinutes = getArTimeMinutes(start);
    const endMinutes = getArTimeMinutes(end);
    const blocked = new Set(toArray(exception?.blockedSlots).map(normalizeArTimeSlot).filter(Boolean));

    for (let minutes = startMinutes; minutes < endMinutes; minutes += 30) {
        const hour = Math.floor(minutes / 60);
        const minute = String(minutes % 60).padStart(2, "0");
        const time = `${String(hour).padStart(2, "0")}:${minute}`;
        if ((!exception && hour === 12) || blocked.has(time)) continue;
        const nextMinutes = minutes + 30;
        slots.push({
            time,
            endTime: `${String(Math.floor(nextMinutes / 60)).padStart(2, "0")}:${String(nextMinutes % 60).padStart(2, "0")}`
        });
    }

    return {
        isWeekend,
        isClosed: false,
        label: exception ? `특별 운영 (${start}~${end})` : isWeekend ? "주말 운영 (10:00~17:30)" : "평일 운영 (10:00~20:30)",
        slots
    };
}

function subscribeArOperations() {
    if (arOperationsListener) return;
    arOperationsListener = db.ref("arOperations");
    arOperationsListener.on("value", (snapshot) => {
        arOperationsState = snapshot.val() || {};
        if (typeof generateTimeSlots === "function") generateTimeSlots();
        if (typeof renderAdminArTodaySchedule === "function" && typeof isAdminUser !== "undefined" && isAdminUser) renderAdminArTodaySchedule();
        if (typeof renderAdminArOperations === "function") renderAdminArOperations();
    }, (error) => logError("ar-operations", error));
}

function getArTimeMinutes(value) {
    const match = typeof value === "string"
        ? value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
        : null;
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function isArSlotPast(timeSlot, date = new Date()) {
    const slotMinutes = getArTimeMinutes(timeSlot);
    const targetDate = date instanceof Date ? date : new Date(date);
    if (slotMinutes === null || Number.isNaN(targetDate.getTime())) return true;
    const currentMinutes = targetDate.getHours() * 60 + targetDate.getMinutes();
    return slotMinutes < currentMinutes;
}

function normalizeArTimeSlot(value) {
    const minutes = getArTimeMinutes(value);
    if (minutes === null) return "";
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function collectUsers(containerSelector) {
    return Array.from(document.querySelectorAll(`${containerSelector} .ar-user-card`)).map((card) => {
        const input = card.querySelector("input");
        const select = card.querySelector("select");
        const genderBtn = Array.from(card.querySelectorAll("button")).find((button) => button.classList.contains("bg-white"));
        return {
            name: input ? input.value.trim() : "",
            gender: genderBtn ? genderBtn.innerText.trim() : "남",
            age: select ? select.value : ""
        };
    });
}

function isValidName(name) {
    return typeof name === "string" && /^[가-힣a-zA-Z0-9\s]{1,10}$/.test(name.trim());
}

function isValidGender(gender) {
    return gender === "남" || gender === "여";
}

function isValidAge(age) {
    return AGE_GROUPS.includes(age);
}

function validateUsers(users) {
    if (users.length === 0 || users.some((user) => !user.name || !user.age)) {
        return "모든 방문자 정보를 입력해 주세요!";
    }

    const invalidUser = users.find((user) => !isValidName(user.name) || !isValidGender(user.gender) || !isValidAge(user.age));
    if (invalidUser) {
        return "이름은 한글/영문/숫자 10자 이내로 입력해 주세요!";
    }
    return null;
}

function refreshIcons() {
    if (window.lucide) {
        lucide.createIcons();
    }
}
