/**
 * nchm.js
 * 메인 페이지 로직과 UI 조작, 통합 초기화.
 * 기존 기능은 그대로 유지하며 내부 모듈로 책임을 분리했습니다.
 */

let currentFilter = "all";
let isSubmittingVisit = false;
let isSubmittingAr = false;

let adminLoginFailCount = 0;
let adminLoginLockedUntil = 0;
const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
const ADMIN_LOGIN_LOCK_MS = 60 * 1000;

/* ==================== 보안 유틸리티 ==================== */

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

function isValidName(name) {
    return typeof name === "string" && /^[가-힣a-zA-Z0-9\s]{1,10}$/.test(name.trim());
}

function isValidAge(age) {
    return AGE_GROUPS.includes(age);
}

function isValidGender(gender) {
    return gender === "남" || gender === "여";
}

/* ==================== Firebase 데이터 불러오기 ==================== */

function subscribeArLogsToday() {
    if (arLogsTodayQuery) arLogsTodayQuery.off();

    const todayStr = formatLocalDate(new Date());
    arLogsTodayQuery = arLogsRef.orderByChild("date").equalTo(todayStr);

    arLogsTodayQuery.on("value", (snapshot) => {
        arLogsToday = [];
        snapshot.forEach((child) => {
            arLogsToday.push({ _key: child.key, ...child.val() });
        });
        if (!document.getElementById("section-ar").classList.contains("hidden")) {
            generateTimeSlots();
        }
    }, (error) => {
        logError("arLogsTodayQuery.on", error);
    });
}

function subscribeArLogsAll() {
    if (arLogsTodayQuery) {
        arLogsTodayQuery.off();
        arLogsTodayQuery = null;
    }
    arLogsRef.off();
    arLogsRef.on("value", (snapshot) => {
        arLogs = [];
        snapshot.forEach((child) => {
            arLogs.push({ _key: child.key, ...child.val() });
        });
        updateAdminDashboard();
    }, (error) => {
        logError("arLogsRef.on(all)", error);
    });
}

function unsubscribeArLogsAll() {
    arLogsRef.off();
    arLogs = [];
    subscribeArLogsToday();
}

/* ==================== 유틸리티 함수 ==================== */

function refreshIcons() {
    if (window.lucide) {
        lucide.createIcons();
    }
}

function formatLocalDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function saveVisitLog(logData) {
    return visitLogsRef.push(logData);
}

function saveArLog(logData) {
    return arLogsRef.push(logData);
}

function reserveSlotAndSaveArLog(dateStr, timeSlot, logData) {
    const slotKey = `${dateStr}_${timeSlot}`.replace(/[.#$\[\]/]/g, "-");
    const lockRef = arSlotLocksRef.child(slotKey);

    return lockRef.transaction((current) => {
        if (current === null) {
            return true;
        }
        return;
    }).then((result) => {
        if (!result.committed) {
            const err = new Error("SLOT_TAKEN");
            err.code = "SLOT_TAKEN";
            throw err;
        }
        return saveArLog(logData);
    });
}

let _toastTimer = null;

function showMessage(msg, type = "error") {
    const box = document.getElementById("custom-alert");

    if (_toastTimer) {
        clearTimeout(_toastTimer);
        _toastTimer = null;
    }

    box.innerText = msg;

    box.className = "";
    if (type === "success") box.classList.add("success");
    if (type === "info")    box.classList.add("info");

    box.style.display = "block";

    const duration = Math.min(4000, Math.max(2500, msg.length * 60));

    _toastTimer = setTimeout(() => {
        box.style.display = "none";
        box.className = "";
        _toastTimer = null;
    }, duration);
}

/* ==================== 관리자 인증 함수 ==================== */

function openPasswordModal() {
    document.getElementById("password-modal").classList.remove("hidden");
    document.getElementById("admin-password-input").value = "";
    document.getElementById("admin-password-input").focus();
    updateAdminLoginButtonState();
}

function closePasswordModal() {
    document.getElementById("password-modal").classList.add("hidden");
}

function updateAdminLoginButtonState() {
    const btn = document.getElementById("admin-verify-btn");
    if (!btn) return;
    const remainingMs = adminLoginLockedUntil - Date.now();
    if (remainingMs > 0) {
        btn.disabled = true;
        const remainingSec = Math.ceil(remainingMs / 1000);
        showMessage(`로그인 시도가 너무 많습니다. ${remainingSec}초 후 다시 시도해 주세요.`);
    } else {
        btn.disabled = false;
    }
}

async function verifyAdminPassword() {

    if (Date.now() < adminLoginLockedUntil) {
        updateAdminLoginButtonState();
        return;
    }

    const password = document.getElementById("admin-password-input").value;

    if (!password) {
        showMessage("비밀번호를 입력해 주세요.");
        return;
    }

    try {
        const credential = await auth.signInWithEmailAndPassword(
            ADMIN_EMAIL,
            password
        );

        const tokenResult = await credential.user.getIdTokenResult();
        if (tokenResult.claims.email !== ADMIN_EMAIL) {
            await auth.signOut();
            showMessage("관리자 권한이 없는 계정입니다.");
            return;
        }

        adminLoginFailCount = 0;
        adminLoginLockedUntil = 0;

        closePasswordModal();
        subscribeVisitLogs();
        subscribeArLogsAll();

        setTimeout(() => {
            enterAdminMode();
        }, 500);

    } catch (e) {
        logError("verifyAdminPassword", e);

        adminLoginFailCount += 1;
        if (adminLoginFailCount >= ADMIN_LOGIN_MAX_ATTEMPTS) {
            adminLoginLockedUntil = Date.now() + ADMIN_LOGIN_LOCK_MS;
            adminLoginFailCount = 0;
        }

        showMessage("비밀번호가 틀렸습니다.");
        document.getElementById("admin-password-input").value = "";
        document.getElementById("admin-password-input").focus();
        updateAdminLoginButtonState();
    }
}

function enterAdminMode() {
    document.body.className = "pb-10 theme-admin";
    document.getElementById("main-tabs").classList.add("hidden");
    document.getElementById("section-visit").classList.add("hidden");
    document.getElementById("section-ar").classList.add("hidden");
    document.getElementById("admin-tabs").classList.remove("hidden");
    document.getElementById("section-admin").classList.remove("hidden");
    document.getElementById("admin-entry-btn").classList.add("hidden");
    document.getElementById("exit-admin-btn").classList.remove("hidden");
    document.getElementById("main-content-container").classList.replace("max-w-xl", "max-w-6xl");
    updateAdminDashboard();
}

function exitAdmin() {
    document.getElementById("main-content-container").classList.replace("max-w-6xl", "max-w-xl");
    document.getElementById("admin-tabs").classList.add("hidden");
    document.getElementById("section-admin").classList.add("hidden");
    document.getElementById("exit-admin-btn").classList.add("hidden");
    document.getElementById("admin-entry-btn").classList.remove("hidden");

    visitLogsRef.off();
    visitLogs = [];
    unsubscribeArLogsAll();
    auth.signOut()
        .then(() => auth.signInAnonymously())
        .catch((e) => logError("exitAdmin-reauth", e));

    switchTab("visit");
}

function deleteVisitLog(key) {
    visitLogsRef.child(key).remove()
        .then(() => {
            showMessage("삭제되었습니다.", "info");
        })
        .catch((err) => {
            logError("deleteVisitLog", err);
            showMessage("삭제 중 오류가 발생했습니다.");
        });
}

function deleteArLog(key) {
    const log = arLogs.find((l) => l._key === key);
    const slotKey = log ? createSlotKey(log.date, log.timeSlot) : null;

    const removeLog = arLogsRef.child(key).remove();
    const removeLock = slotKey
        ? arSlotLocksRef.child(slotKey).remove()
        : Promise.resolve();

    Promise.all([removeLog, removeLock])
        .then(() => {
            showMessage("삭제되었습니다.", "info");
        })
        .catch((err) => {
            logError("deleteArLog", err);
            showMessage("삭제 중 오류가 발생했습니다.");
        });
}

function switchTab(type) {
    document.getElementById("tab-visit").className = "tab-btn font-bold";
    document.getElementById("tab-ar").className = "tab-btn font-bold";
    dom.mainTabs.classList.remove("hidden");
    dom.sectionVisit.classList.add("hidden");
    dom.sectionAr.classList.add("hidden");

    if (type === "visit") {
        document.body.className = "pb-10 theme-visit";
        dom.sectionVisit.classList.remove("hidden");
        document.getElementById("tab-visit").classList.add("active-visit");
    } else {
        document.body.className = "pb-10 theme-ar";
        dom.sectionAr.classList.remove("hidden");
        document.getElementById("tab-ar").classList.add("active-ar");
        generateTimeSlots();
        showArNotice();
    }
}

function switchAdminSubTab(tab) {
    dom.adminVisitLogs.classList.add("hidden");
    dom.adminArLogs.classList.add("hidden");
    document.getElementById("subtab-visit-logs").classList.remove("active-visit");
    document.getElementById("subtab-ar-logs").classList.remove("active-ar");

    if (tab === "visit-logs") {
        dom.adminVisitLogs.classList.remove("hidden");
        document.getElementById("subtab-visit-logs").classList.add("active-visit");
    } else {
        dom.adminArLogs.classList.remove("hidden");
        document.getElementById("subtab-ar-logs").classList.add("active-ar");
    }
}

function selectBtn(el, group) {
    if (el.classList.contains("disabled")) return;
    document.querySelectorAll("." + group).forEach((button) => {
        button.classList.remove("active");
    });
    el.classList.add("active");
}

function togglePurpose(el) {
    el.classList.toggle("active");
}

function showArNotice() {
    dom.arNoticeModal.classList.remove("hidden");

    const btn = dom.arNoticeBtn;
    const cover = dom.btnCover;
    const text = dom.btnText;

    btn.disabled = true;
    btn.classList.add("cursor-not-allowed");

    cover.style.transition = "none";
    cover.style.width = "100%";
    cover.offsetWidth;
    cover.style.transition = "width 3s linear";
    cover.style.width = "0%";

    let sec = 3;
    text.textContent = `확인했습니다 (${sec})`;

    const timer = setInterval(() => {
        sec -= 1;
        if (sec > 0) {
            text.textContent = `확인했습니다 (${sec})`;
        } else {
            clearInterval(timer);
            text.textContent = "확인했습니다 ✓";
            btn.disabled = false;
            btn.classList.remove("cursor-not-allowed");
        }
    }, 1000);
}

function closeArNotice() {
    dom.arNoticeModal.classList.add("hidden");
}

function changeArCount(delta) {
    const newCount = arCount + delta;
    if (newCount < 1) return;

    const container = dom.arUserContainer;

    if (delta > 0) {
        const div = document.createElement("div");
        div.className = "ar-user-card card-shadow animate-fadeIn";
        div.innerHTML = `
            <div class="flex flex-1 gap-3">
                <div class="flex-1"><input type="text" maxlength="10" placeholder="이름" class="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center text-base font-bold outline-none focus:border-indigo-400"></div>
                <div class="flex bg-slate-100 p-1.5 rounded-2xl gap-1 w-32 shrink-0">
                    <button type="button" class="flex-1 py-2.5 bg-white rounded-xl text-sm font-bold shadow-sm" onclick="selectGender(this)">남</button>
                    <button type="button" class="flex-1 py-2.5 text-sm font-bold text-slate-400" onclick="selectGender(this)">여</button>
                </div>
            </div>
            <div class="flex gap-3 items-center">
                <select class="flex-1 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold outline-none focus:border-indigo-400">
                    <option value="" disabled selected>나이 선택</option>
                    ${AGE_GROUPS.map((age) => `<option>${escapeHtml(age)}</option>`).join("")}
                </select>
            </div>
        `;
        container.appendChild(div);
        refreshIcons();
        div.querySelector("input")?.focus();
    } else {
        if (container.lastElementChild) {
            container.lastElementChild.remove();
        }
    }

    arCount = newCount;
    dom.arCountDisplay.innerText = arCount;
}

function selectGender(btn) {
    const parent = btn.parentElement;
    parent.querySelectorAll("button").forEach((button) => {
        button.className = "flex-1 py-2.5 text-sm font-bold text-slate-400";
    });
    btn.className = "flex-1 py-2.5 bg-white rounded-xl text-sm font-bold shadow-sm";
}

function addTimeBtn(container, h, m, reservedSlots) {
    const timeStr = `${h.toString().padStart(2, "0")}:${m}`;
    const isReserved = reservedSlots.includes(timeStr);
    const endH = m === "30" ? h + 1 : h;
    const endM = m === "30" ? "00" : "30";
    const endTimeStr = `${endH.toString().padStart(2, "0")}:${endM}`;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `time-slot-btn choice-btn p-4 rounded-2xl flex flex-col items-center ${isReserved ? "disabled" : ""}`;

    if (isReserved) {
        btn.innerHTML = `<span class="text-lg font-black">${timeStr}</span><span class="text-[10px] text-red-500 font-bold">예약 완료</span>`;
    } else {
        btn.innerHTML = `
            <span class="text-lg font-black">${timeStr}</span>
            <span class="text-[10px] text-slate-400">~ ${endTimeStr}</span>
            <div class="check-badge"><i data-lucide="check" class="w-3 h-3"></i></div>
        `;
        btn.onclick = () => selectBtn(btn, "time-slot-btn");
    }

    container.appendChild(btn);
}

function generateTimeSlots() {
    dom.timeContainer.innerHTML = "";
    const now = new Date();
    const day = now.getDay();
    const isWeekend = day === 0 || day === 6;
    const todayStr = formatLocalDate(now);
    const reservedSlots = arLogsToday
        .filter((log) => log.date === todayStr)
        .map((log) => log.timeSlot);

    if (isWeekend) {
        dom.arDayIndicator.innerText = "🗓️ 주말 운영 (10:00~17:30)";
        dom.arDayIndicator.className = "mb-4 inline-block px-4 py-1.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700";

        for (let h = 10; h < 18; h += 1) {
            if (h === 12) continue;
            ["00", "30"].forEach((m) => {
                if (h === 17 && m === "30") return;
                addTimeBtn(dom.timeContainer, h, m, reservedSlots);
            });
        }
    } else {
        dom.arDayIndicator.innerText = "🗓️ 평일 운영 (10:00~20:30)";
        dom.arDayIndicator.className = "mb-4 inline-block px-4 py-1.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700";

        for (let h = 10; h <= 20; h += 1) {
            if (h === 12) continue;
            ["00", "30"].forEach((m) => {
                if (h === 20 && m === "30") return;
                addTimeBtn(dom.timeContainer, h, m, reservedSlots);
            });
        }
    }

    refreshIcons();
}

function setFilter(type) {
    currentFilter = type;

    document.querySelectorAll(".filter-chip").forEach((btn) => {
        btn.classList.remove("active");
    });

    if (type === "month") {
        document.getElementById("filter-month").classList.add("active");
    } else {
        document.getElementById("filter-" + type).classList.add("active");
    }

    if (type === "custom") {
        dom.customDateInputs.classList.remove("hidden");
    } else {
        dom.customDateInputs.classList.add("hidden");
    }

    if (type === "all") {
        updateAdminDashboard();
    }
}

function isDateInRange(dateStr) {
    const targetDate = new Date(dateStr);
    if (currentFilter === "all") return true;

    if (currentFilter === "month") {
        const selectedYear = parseInt(dom.filterYearSelect.value, 10);
        const selectedMonth = parseInt(dom.filterMonthSelect.value, 10);
        return targetDate.getMonth() === selectedMonth && targetDate.getFullYear() === selectedYear;
    }

    if (currentFilter === "custom") {
        const start = dom.startDate.value;
        const end = dom.endDate.value;
        if (!start || !end) return true;
        const startDate = new Date(start);
        const endDate = new Date(end);
        endDate.setHours(23, 59, 59);
        return targetDate >= startDate && targetDate <= endDate;
    }

    return true;
}

function renderStatsTable(data, categories, targetBodyId, targetFooterId, themeClass) {
    const body = document.getElementById(targetBodyId);
    const footer = document.getElementById(targetFooterId);
    body.innerHTML = "";

    let grandTotal = 0;
    const ageGenderTotals = {};

    AGE_GROUPS.forEach((age) => {
        ageGenderTotals[age] = { 남: 0, 여: 0 };
    });

    categories.forEach((category) => {
        let youthSum = 0;
        let youngSum = 0;
        let rowTotal = 0;

        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="category-row">${escapeHtml(category)}</td>`;

        AGE_GROUPS.forEach((age, idx) => {
            const male = data[category][age]["남"];
            const female = data[category][age]["여"];
            const rowVal = male + female;

            tr.innerHTML += `<td>${male || "-"}</td><td>${female || "-"}</td>`;
            rowTotal += rowVal;
            ageGenderTotals[age]["남"] += male;
            ageGenderTotals[age]["여"] += female;

            if (idx < 3) youthSum += rowVal;
            if (idx >= 3 && idx <= 4) youngSum += rowVal;
        });

        tr.innerHTML += `<td class="${themeClass}">${youthSum}</td><td class="${themeClass}">${youngSum}</td><td class="total-sum-col">${rowTotal}</td>`;
        body.appendChild(tr);
        grandTotal += rowTotal;
    });

    footer.innerHTML = "<td>합계</td>";

    let footerYouth = 0;
    let footerYoung = 0;

    AGE_GROUPS.forEach((age, idx) => {
        const male = ageGenderTotals[age]["남"];
        const female = ageGenderTotals[age]["여"];
        footer.innerHTML += `<td>${male}</td><td>${female}</td>`;
        const sum = male + female;
        if (idx < 3) footerYouth += sum;
        if (idx >= 3 && idx <= 4) footerYoung += sum;
    });

    const finalClass = themeClass === "sum-col" ? "final-total-visit" : "final-total-ar";
    footer.innerHTML += `<td>${footerYouth}</td><td>${footerYoung}</td><td class="${finalClass}">${grandTotal}</td>`;
}

function updateAdminDashboard() {
    if (!dom.visitLogBody || !dom.arLogBody) {
        return;
    }

    const filteredVisitLogs = visitLogs.filter((log) => isDateInRange(log.date));
    const filteredArLogs = arLogs.filter((log) => isDateInRange(log.date));
    const mainCategories = [...PURPOSES, "AR실"];

    const vStats = {};
    mainCategories.forEach((category) => {
        vStats[category] = {};
        AGE_GROUPS.forEach((age) => {
            vStats[category][age] = { 남: 0, 여: 0 };
        });
    });

    filteredVisitLogs.forEach((log) => {
        (log.purposes || []).forEach((purpose) => {
            if (PURPOSES.includes(purpose) && vStats[purpose] && vStats[purpose][log.age]) {
                vStats[purpose][log.age][log.gender] += 1;
            }
        });
    });

    filteredArLogs.forEach((log) => {
        (log.users || []).forEach((user) => {
            if (vStats["AR실"][user.age]) {
                vStats["AR실"][user.age][user.gender] += 1;
            }
        });
    });

    renderStatsTable(vStats, mainCategories, "visit-stats-body", "visit-stats-footer", "sum-col");

    const studyStats = { "스터디룸": {} };
    AGE_GROUPS.forEach((age) => {
        studyStats["스터디룸"][age] = { 남: 0, 여: 0 };
    });

    filteredVisitLogs.forEach((log) => {
        if ((log.purposes || []).includes("스터디룸")) {
            studyStats["스터디룸"][log.age][log.gender] += 1;
        }
    });

    renderStatsTable(studyStats, ["스터디룸"], "study-stats-body", "study-stats-footer", "sum-col");

    const arStats = { "AR 이용": {} };
    AGE_GROUPS.forEach((age) => {
        arStats["AR 이용"][age] = { 남: 0, 여: 0 };
    });

    filteredArLogs.forEach((log) => {
        (log.users || []).forEach((user) => {
            if (arStats["AR 이용"][user.age]) {
                arStats["AR 이용"][user.age][user.gender] += 1;
            }
        });
    });

    renderStatsTable(arStats, ["AR 이용"], "ar-stats-body", "ar-stats-footer", "ar-sum-col");

    dom.visitLogBody.innerHTML = "";
    filteredVisitLogs.slice().reverse().forEach((log) => {
        const tr = document.createElement("tr");
        tr.className = "border-b hover:bg-slate-50";

        const purposesHtml = (log.purposes || []).map((purpose) =>
            `<span class="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px] font-bold">${escapeHtml(purpose)}</span>`
        ).join("");

        tr.innerHTML = `
            <td class="py-3 text-slate-500 font-bold text-xs">${escapeHtml(log.date)}</td>
            <td class="text-slate-400 font-medium">${escapeHtml(log.time)}</td>
            <td class="font-bold">${escapeHtml(log.name)}</td>
            <td>${escapeHtml(log.gender)}</td>
            <td>${escapeHtml((log.age || "").split("(")[0])}</td>
            <td>
                <div class="flex gap-1 justify-center">
                    ${purposesHtml}
                </div>
            </td>
            <td>
                <button onclick="deleteVisitLog('${escapeHtml(log._key)}')"
                    class="bg-red-500 text-white px-2 py-1 rounded text-xs">
                    삭제
                </button>
            </td>
        `;

        dom.visitLogBody.appendChild(tr);
    });

    dom.visitCountBadge.innerText = filteredVisitLogs.length + "건";

    dom.arLogBody.innerHTML = "";
    filteredArLogs.slice().reverse().forEach((log) => {
        const tr = document.createElement("tr");
        tr.className = "border-b hover:bg-indigo-50/30";

        const details = (log.users || [])
            .map((user) =>
                `<span class="inline-block bg-slate-100 rounded-lg px-2 py-1 mr-1 mb-1 text-slate-700 font-medium">
                    ${escapeHtml(user.name)}
                    <span class="text-[10px] text-slate-400 ml-1">
                        (${escapeHtml(user.gender)}, ${escapeHtml((user.age || "").split("(")[0])})
                    </span>
                </span>`
            )
            .join("");

        tr.innerHTML = `
            <td class="py-3 text-slate-500 font-bold text-xs">${escapeHtml(log.date)}</td>
            <td class="py-3 text-indigo-600 font-bold">${escapeHtml(log.timeSlot)}</td>
            <td class="font-bold">${escapeHtml(log.users?.[0]?.name || "")}</td>
            <td>${log.users?.length || 0}명</td>
            <td class="text-xs text-left px-4 py-2">${details}</td>
            <td>
                <button onclick="deleteArLog('${escapeHtml(log._key)}')"
                    class="bg-red-500 text-white px-2 py-1 rounded text-xs">
                    삭제
                </button>
            </td>
        `;

        dom.arLogBody.appendChild(tr);
    });

    dom.arCountBadge.innerText = filteredArLogs.length + "건";
}

function submitForm(type) {
    const now = new Date();
    const timeStr = `${now.getHours()}:${now.getMinutes().toString().padStart(2, "0")}`;
    const dateStr = formatLocalDate(now);

    if (type === "visit") {
        if (isSubmittingVisit) return;

        const purposes = Array.from(document.querySelectorAll(".v-purpose.active")).map((purpose) => purpose.querySelector("span").innerText);
        if (purposes.length === 0) {
            showMessage("이용 목적을 선택해 주세요!");
            return;
        }

        const users = collectUsers("#visit-user-container");
        const validationError = validateUsers(users);
        if (validationError) {
            showMessage(validationError);
            return;
        }

        isSubmittingVisit = true;
        const visitSubmitBtn = document.querySelector("#section-visit .submit-btn");
        if (visitSubmitBtn) visitSubmitBtn.disabled = true;

        const savePromises = users.map((user) => {
            const logData = { date: dateStr, time: timeStr, name: user.name, gender: user.gender, age: user.age, purposes };
            return saveVisitLog(logData);
        });

        Promise.all(savePromises)
            .then(() => {
                showMessage(`${users.length}명 방문 등록이 완료되었습니다! ✓`, "success");
                dom.visitUserContainer.innerHTML = "";
                document.querySelectorAll(".v-purpose").forEach((button) => button.classList.remove("active"));
                visitCount = 0;
                changeVisitCount(1);
            })
            .catch((err) => {
                logError("submitForm-visit", err);
                showMessage("저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
            })
            .finally(() => {
                isSubmittingVisit = false;
                if (visitSubmitBtn) visitSubmitBtn.disabled = false;
            });
    } else {
        if (isSubmittingAr) return;

        const timeSlot = document.querySelector(".time-slot-btn.active")?.querySelector("span")?.innerText;
        if (!timeSlot) {
            showMessage("시간을 선택해 주세요!");
            return;
        }

        const users = collectUsers("#ar-user-container");
        const validationError = validateUsers(users);
        if (validationError) {
            showMessage(validationError);
            return;
        }

        const logData = { date: dateStr, timeSlot, users };
        isSubmittingAr = true;
        const arSubmitBtn = document.querySelector("#section-ar .submit-btn");
        if (arSubmitBtn) arSubmitBtn.disabled = true;

        reserveSlotAndSaveArLog(dateStr, timeSlot, logData)
            .then(() => {
                showMessage("AR 예약이 완료되었습니다! ✓", "success");
                dom.arUserContainer.innerHTML = "";
                document.querySelectorAll(".time-slot-btn").forEach((button) => button.classList.remove("active"));
                arCount = 0;
                dom.arCountDisplay.innerText = "0";
                changeArCount(1);
                generateTimeSlots();
                switchTab("visit");
            })
            .catch((err) => {
                logError("submitForm-ar", err);
                if (err && err.code === "SLOT_TAKEN") {
                    showMessage("방금 다른 이용자가 같은 시간을 먼저 예약했습니다. 다른 시간을 선택해 주세요.");
                    generateTimeSlots();
                } else {
                    showMessage("저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
                }
            })
            .finally(() => {
                isSubmittingAr = false;
                if (arSubmitBtn) arSubmitBtn.disabled = false;
            });
    }
}

function exportToExcel(type) {
    let csvContent = "\uFEFF";
    let fileName = "";

    if (type === "visit") {
        const filtered = visitLogs.filter((log) => isDateInRange(log.date));
        if (filtered.length === 0) {
            showMessage("다운로드할 데이터가 없습니다.", "info");
            return;
        }
        csvContent += "날짜,시간,이름,성별,나이,이용목적\n";
        filtered.forEach((log) => {
            csvContent += `${sanitizeCsvField(log.date)},${sanitizeCsvField(log.time)},${sanitizeCsvField(log.name)},${sanitizeCsvField(log.gender)},${sanitizeCsvField((log.age || "").split("(")[0])},"${sanitizeCsvField((log.purposes || []).join(", "))}"\n`;
        });
        fileName = `방문등록_${formatLocalDate(new Date())}.csv`;
    } else {
        const filtered = arLogs.filter((log) => isDateInRange(log.date));
        if (filtered.length === 0) {
            showMessage("다운로드할 데이터가 없습니다.", "info");
            return;
        }
        csvContent += "예약날짜,예약시간,대표자,총인원,이용자상세\n";
        filtered.forEach((log) => {
            const details = (log.users || []).map((user) => `${user.name}(${user.gender}/${(user.age || "").split("(")[0]})`).join(" | ");
            csvContent += `${sanitizeCsvField(log.date)},${sanitizeCsvField(log.timeSlot)},${sanitizeCsvField(log.users?.[0]?.name || "")},${log.users?.length || 0},"${sanitizeCsvField(details)}"\n`;
        });
        fileName = `AR예약_${formatLocalDate(new Date())}.csv`;
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.click();
}

function initFilterOptions() {
    const now = new Date();

    for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y += 1) {
        const option = document.createElement("option");
        option.value = y;
        option.innerText = y + "년";
        if (y === now.getFullYear()) {
            option.selected = true;
        }
        dom.filterYearSelect.appendChild(option);
    }

    dom.filterMonthSelect.value = now.getMonth();
}

function changeVisitCount(delta) {
    const newCount = visitCount + delta;
    if (newCount < 1) return;

    const container = dom.visitUserContainer;

    if (delta > 0) {
        const div = document.createElement("div");
        div.className = "ar-user-card card-shadow animate-fadeIn";
        div.innerHTML = `
            <div class="flex flex-1 gap-3">
                <div class="flex-1"><input type="text" maxlength="10" placeholder="이름" class="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center text-base font-bold outline-none focus:border-blue-400"></div>
                <div class="flex bg-slate-100 p-1.5 rounded-2xl gap-1 w-32 shrink-0">
                    <button type="button" class="flex-1 py-2.5 bg-white rounded-xl text-sm font-bold shadow-sm" onclick="selectGender(this)">남</button>
                    <button type="button" class="flex-1 py-2.5 text-sm font-bold text-slate-400" onclick="selectGender(this)">여</button>
                </div>
            </div>
            <div class="flex gap-3 items-center">
                <select class="flex-1 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold outline-none focus:border-blue-400">
                    <option value="" disabled selected>나이 선택</option>
                    ${AGE_GROUPS.map((age) => `<option>${escapeHtml(age)}</option>`).join("")}
                </select>
            </div>
        `;
        container.appendChild(div);
        refreshIcons();
        div.querySelector("input")?.focus();
    } else {
        if (container.lastElementChild) {
            container.lastElementChild.remove();
        }
    }

    visitCount = newCount;
    dom.vCountDisplay.innerText = visitCount;

    const minusBtn = dom.vCountMinus;
    if (visitCount === 1) {
        minusBtn.classList.add("opacity-40", "cursor-not-allowed");
    } else {
        minusBtn.classList.remove("opacity-40", "cursor-not-allowed");
    }
}

function initializePage() {
    const now = new Date();
    dom.currentDate.innerText = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
    dom.startDate.value = formatLocalDate(now);
    dom.endDate.value = formatLocalDate(now);

    initFilterOptions();
    changeArCount(1);
    changeVisitCount(1);
    refreshIcons();

    auth.signInAnonymously()
        .catch((e) => logError("anon-auth", e))
        .finally(() => {
            subscribeArLogsToday();
        });
}

document.addEventListener("DOMContentLoaded", initializePage);
