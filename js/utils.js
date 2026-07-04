const dom = {
    customAlert: document.getElementById("custom-alert"),
    currentDate: document.getElementById("current-date"),
    adminEntryBtn: document.getElementById("admin-entry-btn"),
    exitAdminBtn: document.getElementById("exit-admin-btn"),
    mainTabs: document.getElementById("main-tabs"),
    adminTabs: document.getElementById("admin-tabs"),
    mainContentContainer: document.getElementById("main-content-container"),
    passwordModal: document.getElementById("password-modal"),
    adminPasswordInput: document.getElementById("admin-password-input"),
    adminVerifyBtn: document.getElementById("admin-verify-btn"),
    sectionVisit: document.getElementById("section-visit"),
    sectionAr: document.getElementById("section-ar"),
    sectionAdmin: document.getElementById("section-admin"),
    adminVisitLogs: document.getElementById("admin-visit-logs"),
    adminArLogs: document.getElementById("admin-ar-logs"),
    visitUserContainer: document.getElementById("visit-user-container"),
    arUserContainer: document.getElementById("ar-user-container"),
    arDayIndicator: document.getElementById("ar-day-indicator"),
    timeContainer: document.getElementById("time-container"),
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

function formatLocalDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function showMessage(msg, type = "error") {
    const box = dom.customAlert;
    if (!_toastTimer) {
        _toastTimer = null;
    }

    if (_toastTimer) {
        clearTimeout(_toastTimer);
        _toastTimer = null;
    }

    box.innerText = msg;
    box.className = "";
    if (type === "success") box.classList.add("success");
    if (type === "info") box.classList.add("info");
    box.style.display = "block";

    const duration = Math.min(4000, Math.max(2500, msg.length * 60));
    _toastTimer = setTimeout(() => {
        box.style.display = "none";
        box.className = "";
        _toastTimer = null;
    }, duration);
}

function createSlotKey(dateStr, timeSlot) {
    return `${dateStr}_${timeSlot}`.replace(/[.#$\[\]\/]/g, "-");
}

function collectUsers(containerSelector) {
    return Array.from(document.querySelectorAll(`${containerSelector} .ar-user-card`)).map((card) => {
        const genderBtn = Array.from(card.querySelectorAll("button")).find((button) => button.classList.contains("bg-white"));
        return {
            name: card.querySelector("input").value.trim(),
            gender: genderBtn ? genderBtn.innerText.trim() : "남",
            age: card.querySelector("select").value
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
