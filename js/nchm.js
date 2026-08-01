/**
 * nchm.js
 * 메인 페이지 로직과 UI 조작, 통합 초기화.
 * 기존 기능은 그대로 유지하며 내부 모듈로 책임을 분리했습니다.
 */

let currentFilter = "all";
let isSubmittingVisit = false;
let isSubmittingAr = false;
let visitCount = 0;
let arCount = 0;
let attendanceEventsQuery = null;
let attendanceEventsState = {};
let attendanceTickerResizeTimer = null;
let currentAttendanceBannerType = "visit";
let arNoticeTimer = null;
let dateRolloverTimer = null;
let currentPageDate = "";
let pageInitialized = false;
const pendingDeleteKeys = new Set();

// TEMP-AROHA-DAY-2026-08-01 START: 행사 종료 후 이 구간과 호출부를 삭제하세요.
const AROHA_DAY_AR_PAUSE_DATE = "2026-08-01";

function isArohaDayArReservationPaused(date = new Date()) {
    return formatLocalDate(date) === AROHA_DAY_AR_PAUSE_DATE;
}

function updateArohaDayArReservationUi(date = new Date()) {
    const isPaused = isArohaDayArReservationPaused(date);
    const notice = document.getElementById("aroha-day-ar-notice");
    const reservationContent = document.getElementById("ar-reservation-content");
    notice?.classList.toggle("hidden", !isPaused);
    reservationContent?.classList.toggle("hidden", isPaused);
    notice?.setAttribute("aria-hidden", String(!isPaused));
    reservationContent?.setAttribute("aria-hidden", String(isPaused));
    if (dom.sectionAr) dom.sectionAr.dataset.arohaDay = isPaused ? "active" : "inactive";
    return isPaused;
}
// TEMP-AROHA-DAY-2026-08-01 END

function getActiveAttendanceEvents(events, type) {
    const today = formatLocalDate(new Date());
    return toArray(events).filter((event) => event
        && event.enabled !== false
        && event.type === type
        && isValidDateKey(event.startDate)
        && event.startDate <= today
        && (!event.endDate || (isValidDateKey(event.endDate) && event.endDate >= today)));
}

function updateAttendanceTabEventBadges(events) {
    const arBadge = document.getElementById("ar-event-status-badge");
    if (!arBadge) return;
    const hasActiveArEvent = getActiveAttendanceEvents(events, "ar").length > 0;
    arBadge.classList.toggle("hidden", !hasActiveArEvent);
}

function renderAttendanceEventBanner(events) {
    attendanceEventsState = events || {};
    updateAttendanceTabEventBadges(attendanceEventsState);
    const banner = document.getElementById("attendance-event-banner");
    const track = document.getElementById("attendance-event-banner-track");
    if (!banner || !track) return;
    const activeEvents = getActiveAttendanceEvents(events, currentAttendanceBannerType);
    banner.dataset.hasEvents = activeEvents.length ? "true" : "false";
    if (!activeEvents.length) {
        banner.classList.add("hidden");
        track.textContent = "";
        return;
    }
    const message = activeEvents.map((event) => {
        const icon = event.type === "ar" ? "🎮" : "🎉";
        const typeName = event.type === "ar" ? "AR 출석 이벤트" : "방문 출석 이벤트";
        const criterion = event.criteriaLabel || `${event.criteriaCount || 1}회 이상`;
        return `${icon} 현재 ${typeName} 「${event.title || "이벤트"}」가 진행중입니다! ${event.startDate} ~ ${event.endDate || "종료일 미정"} · ${criterion} 시 추첨을 통해 ${event.winnerCount || 0}명을 선정합니다. ${event.description || "자세한 내용은 로비 이벤트 안내물을 확인해주세요."} ${icon}`;
    }).join("     ·     ");

    // Make each half of the ticker wider than the viewport even when the
    // original message is short. Two identical halves can then loop at -50%
    // without a jump or an empty interval.
    const estimatedCharacterWidth = window.innerWidth <= 640 ? 8 : 9;
    const minimumGroupCharacters = Math.ceil((window.innerWidth * 1.35) / estimatedCharacterWidth);
    const repeatCount = Math.max(1, Math.ceil(minimumGroupCharacters / Math.max(message.length, 1)));
    const tickerGap = "\u00A0".repeat(12);
    const repeatedMessage = Array(repeatCount).fill(message).join(tickerGap);
    const durationSeconds = Math.max(16, Math.min(55, repeatedMessage.length * 0.18));

    const firstText = document.createElement("span");
    firstText.className = "attendance-event-banner-text";
    firstText.textContent = repeatedMessage;

    const duplicateText = document.createElement("span");
    duplicateText.className = "attendance-event-banner-text";
    duplicateText.textContent = repeatedMessage;
    duplicateText.setAttribute("aria-hidden", "true");

    track.replaceChildren(firstText, duplicateText);
    track.style.setProperty("--attendance-ticker-duration", `${durationSeconds}s`);
    updateAttendanceEventBannerVisibility();
}

window.addEventListener("resize", () => {
    window.clearTimeout(attendanceTickerResizeTimer);
    attendanceTickerResizeTimer = window.setTimeout(() => {
        renderAttendanceEventBanner(attendanceEventsState);
    }, 150);
});

function updateAttendanceEventBannerVisibility() {
    const banner = document.getElementById("attendance-event-banner");
    if (!banner) return;
    const targetSection = currentAttendanceBannerType === "ar" ? dom.sectionAr : dom.sectionVisit;
    const targetIsVisible = !targetSection.classList.contains("hidden")
        && !dom.mainTabs.classList.contains("hidden");
    banner.classList.toggle("hidden", banner.dataset.hasEvents !== "true" || !targetIsVisible);
}

function subscribeAttendanceEventBanner() {
    if (attendanceEventsQuery) attendanceEventsQuery.off();
    attendanceEventsQuery = db.ref("tvContent/attendanceEvents");
    attendanceEventsQuery.on("value", (snapshot) => renderAttendanceEventBanner(snapshot.val()), (error) => logError("attendance-events-banner", error));
}

function deleteVisitLog(key) {
    const pendingKey = `visit:${key}`;
    if (!key || pendingDeleteKeys.has(pendingKey)) return;
    pendingDeleteKeys.add(pendingKey);
    const log = visitLogs.find((item) => item._key === key);
    const updates = { [`visitLogs/${key}`]: null };
    if (log && log.requestId) updates[`requestClaims/${log.requestId}`] = null;
    db.ref().update(updates)
        .then(() => {
            invalidateAdminStatsCache("visit");
            invalidateAdminLegacyVisitCache();
            showMessage("삭제되었습니다.", "info");
            return Promise.all([
                loadAdminLogPage("visit"),
                reloadAdminStatistics({ forceTypes: ["visit"] })
            ]);
        })
        .catch((err) => {
            logError("deleteVisitLog", err);
            showMessage("삭제 중 오류가 발생했습니다.");
        })
        .finally(() => pendingDeleteKeys.delete(pendingKey));
}

function deleteArLog(key) {
    const pendingKey = `ar:${key}`;
    if (!key || pendingDeleteKeys.has(pendingKey)) return;
    pendingDeleteKeys.add(pendingKey);
    const log = arLogs.find((l) => l._key === key);
    const slotKey = log && (log.slotKey || (log.date && log.timeSlot ? createSlotKey(log.date, log.timeSlot) : ""));
    const updates = { [`arLogs/${key}`]: null };
    if (slotKey) updates[`arSlotLocks/${slotKey}`] = null;
    if (log && log.requestId) updates[`requestClaims/${log.requestId}`] = null;

    db.ref().update(updates)
        .then(() => {
            invalidateAdminStatsCache("ar");
            showMessage("삭제되었습니다.", "info");
            return Promise.all([
                loadAdminLogPage("ar"),
                reloadAdminStatistics({ forceTypes: ["ar"] })
            ]);
        })
        .catch((err) => {
            logError("deleteArLog", err);
            showMessage("삭제 중 오류가 발생했습니다.");
        })
        .finally(() => pendingDeleteKeys.delete(pendingKey));
}

function switchTab(type) {
    currentAttendanceBannerType = type === "ar" ? "ar" : "visit";
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
        // TEMP-AROHA-DAY-2026-08-01: 행사 당일에는 안내만 표시하고 예약 단계로 진입하지 않습니다.
        if (updateArohaDayArReservationUi(new Date())) {
            closeArNotice();
        } else {
            generateTimeSlots();
            showArNotice();
        }
    }
    renderAttendanceEventBanner(attendanceEventsState);
}

function switchAdminSubTab(tab) {
    dom.adminVisitLogs.classList.add("hidden");
    dom.adminArLogs.classList.add("hidden");
    document.getElementById("admin-tv-settings").classList.add("hidden");
    document.getElementById("subtab-visit-logs").classList.remove("active-visit");
    document.getElementById("subtab-ar-logs").classList.remove("active-ar");
    document.getElementById("subtab-tv-settings").classList.remove("active-ar");

    if (tab === "visit-logs") {
        dom.adminVisitLogs.classList.remove("hidden");
        document.getElementById("subtab-visit-logs").classList.add("active-visit");
    } else if (tab === "ar-logs") {
        dom.adminArLogs.classList.remove("hidden");
        document.getElementById("subtab-ar-logs").classList.add("active-ar");
    } else {
        document.getElementById("admin-tv-settings").classList.remove("hidden");
        document.getElementById("subtab-tv-settings").classList.add("active-ar");
        loadTvSettings();
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

    window.clearInterval(arNoticeTimer);
    arNoticeTimer = window.setInterval(() => {
        sec -= 1;
        if (sec > 0) {
            text.textContent = `확인했습니다 (${sec})`;
        } else {
            window.clearInterval(arNoticeTimer);
            arNoticeTimer = null;
            text.textContent = "확인했습니다 ✓";
            btn.disabled = false;
            btn.classList.remove("cursor-not-allowed");
        }
    }, 1000);
}

function closeArNotice() {
    window.clearInterval(arNoticeTimer);
    arNoticeTimer = null;
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
    const schedule = getArOperatingSchedule(now);
    const todayStr = formatLocalDate(now);
    const reservedSlots = arLogsToday
        .filter((log) => log.date === todayStr)
        .map((log) => log.timeSlot);

    if (schedule.isWeekend) {
        dom.arDayIndicator.innerText = `🗓️ ${schedule.label}`;
        dom.arDayIndicator.className = "mb-4 inline-block px-4 py-1.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700";
    } else {
        dom.arDayIndicator.innerText = `🗓️ ${schedule.label}`;
        dom.arDayIndicator.className = "mb-4 inline-block px-4 py-1.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700";
    }

    schedule.slots.forEach((slot) => {
        const [hour, minute] = slot.time.split(":");
        addTimeBtn(dom.timeContainer, Number(hour), minute, reservedSlots);
    });

    refreshIcons();
}

function setFilter(type) {
    currentFilter = type;
    if (isAdminUser) {
        if (typeof cancelAdminExportLoads === "function") {
            cancelAdminExportLoads();
        }
        if (typeof cancelAdminStatisticsLoads === "function") {
            cancelAdminStatisticsLoads();
        }
        if (typeof cancelAdminLogLoads === "function") {
            cancelAdminLogLoads();
        }
        updateAdminDashboard();
    }

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

}

function isDateInRange(dateStr) {
    if (!isValidDateKey(dateStr)) return false;
    const targetDate = new Date(`${dateStr}T00:00:00`);
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
        if (!isValidDateKey(start) || !isValidDateKey(end) || start > end) return false;
        const startDate = new Date(`${start}T00:00:00`);
        const endDate = new Date(`${end}T00:00:00`);
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
    const mainCategories = [...PURPOSES];
    const periodVisit = getAdminPeriodAggregate("visit");
    const periodAr = getAdminPeriodAggregate("ar");
    const vStats = periodVisit.purposeStats;

    renderStatsTable(vStats, mainCategories, "visit-stats-body", "visit-stats-footer", "sum-col");

    const studyStats = periodVisit.studyStats;

    renderStatsTable(studyStats, ["스터디룸"], "study-stats-body", "study-stats-footer", "sum-col");

    const arStats = periodAr.arStats;

    renderStatsTable(arStats, ["AR 이용"], "ar-stats-body", "ar-stats-footer", "ar-sum-col");

    dom.visitLogBody.innerHTML = "";
    filteredVisitLogs.forEach((log) => {
        const tr = document.createElement("tr");
        tr.className = "border-b hover:bg-slate-50";

        const purposesHtml = toArray(log.purposes).map((purpose) =>
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

    dom.visitCountBadge.innerText = `현재 페이지 ${filteredVisitLogs.length}건`;

    dom.arLogBody.innerHTML = "";
    filteredArLogs.slice().reverse().forEach((log) => {
        const tr = document.createElement("tr");
        tr.className = "border-b hover:bg-indigo-50/30";

        const users = toArray(log.users);
        const details = users
            .filter((user) => user && typeof user === "object")
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
            <td class="font-bold">${escapeHtml(users[0]?.name || "")}</td>
            <td>${users.length}명</td>
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

    dom.arCountBadge.innerText = `현재 페이지 ${filteredArLogs.length}건`;
    updateAdminStatsProgressUi();
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
        const visitSubmitLabel = visitSubmitBtn ? visitSubmitBtn.textContent : "";
        if (visitSubmitBtn) {
            visitSubmitBtn.disabled = true;
            visitSubmitBtn.textContent = "저장 중...";
        }
        const visitSlowTimer = window.setTimeout(() => {
            showMessage("네트워크 응답이 지연되고 있습니다. 중복 등록을 막기 위해 완료될 때까지 기다려 주세요.", "info");
        }, 8000);

        const logDataList = users.map((user) => ({
            date: dateStr,
            time: timeStr,
            name: user.name,
            gender: user.gender,
            age: user.age,
            purposes
        }));

        saveVisitLogs(logDataList)
            .then((request) => {
                completePersistentRequest(request.requestId);
                showMessage(`${users.length}명 방문 등록이 완료되었습니다! ✓`, "success");
                dom.visitUserContainer.innerHTML = "";
                document.querySelectorAll(".v-purpose").forEach((button) => button.classList.remove("active"));
                visitCount = 0;
                changeVisitCount(1);
            })
            .catch((err) => {
                logError("submitForm-visit", err);
                showMessage(requestSaveErrorMessage(err));
            })
            .finally(() => {
                window.clearTimeout(visitSlowTimer);
                isSubmittingVisit = false;
                if (visitSubmitBtn) {
                    visitSubmitBtn.disabled = false;
                    visitSubmitBtn.textContent = visitSubmitLabel;
                }
            });
    } else {
        // TEMP-AROHA-DAY-2026-08-01: 숨겨진 버튼 호출 등 우회 요청도 당일에는 저장하지 않습니다.
        if (isArohaDayArReservationPaused(now)) {
            updateArohaDayArReservationUi(now);
            showMessage("오늘은 아로하데이 행사 진행으로 AR 예약이 어렵습니다.", "info");
            return;
        }
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
        const arSubmitLabel = arSubmitBtn ? arSubmitBtn.textContent : "";
        if (arSubmitBtn) {
            arSubmitBtn.disabled = true;
            arSubmitBtn.textContent = "예약 저장 중...";
        }
        const arSlowTimer = window.setTimeout(() => {
            showMessage("예약 확인이 지연되고 있습니다. 같은 요청을 다시 보내지 말고 잠시 기다려 주세요.", "info");
        }, 8000);

        reserveSlotAndSaveArLog(dateStr, timeSlot, logData)
            .then((request) => {
                completePersistentRequest(request.requestId);
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
                logError(`submitForm-ar.${err?.arStage || "unknown"}`, err);
                showMessage(arReservationSaveErrorMessage(err));
                if (getArReservationSaveErrorType(err) === "slot") {
                    generateTimeSlots();
                }
            })
            .finally(() => {
                window.clearTimeout(arSlowTimer);
                isSubmittingAr = false;
                if (arSubmitBtn) {
                    arSubmitBtn.disabled = false;
                    arSubmitBtn.textContent = arSubmitLabel;
                }
            });
    }
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
    if (pageInitialized) return;
    pageInitialized = true;
    const now = new Date();
    currentPageDate = formatLocalDate(now);
    dom.currentDate.innerText = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
    dom.startDate.value = formatLocalDate(now);
    dom.endDate.value = formatLocalDate(now);
    // TEMP-AROHA-DAY-2026-08-01: 오늘만 예약 화면을 행사 안내로 교체합니다.
    updateArohaDayArReservationUi(now);

    initFilterOptions();
    [dom.filterYearSelect, dom.filterMonthSelect, dom.startDate, dom.endDate].forEach((input) => {
        input?.addEventListener("change", () => {
            if (isAdminUser && typeof cancelAdminStatisticsLoads === "function") {
                if (typeof cancelAdminExportLoads === "function") {
                    cancelAdminExportLoads();
                }
                cancelAdminStatisticsLoads();
                cancelAdminLogLoads();
                updateAdminDashboard();
            }
        });
    });
    changeArCount(1);
    changeVisitCount(1);
    refreshIcons();

    const authLoading = document.getElementById("auth-loading");
    let authResolved = false;

    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .catch((error) => logError("auth-persistence", error));

    auth.onAuthStateChanged(async (user) => {
        if (typeof isAdminAuthTransitioning === "function" && isAdminAuthTransitioning()) {
            return;
        }
        if (authResolved && user && user.isAnonymous) return;
        try {
            if (restoreAdminSession(user)) {
                authResolved = true;
                return;
            }

            if (user && !user.isAnonymous) {
                showMessage("관리자 계정이 아니므로 접근이 차단되었습니다.", "info");
                await auth.signOut();
                return;
            }

            if (!user) {
                await auth.signInAnonymously();
                return;
            }

            authResolved = true;
            subscribeArLogsToday();
            subscribeAttendanceEventBanner();
            resumePendingRequests();
        } catch (error) {
            logError("auth-restore", error);
            showMessage("사용자 인증에 실패했습니다. 새로고침 후 다시 시도해 주세요.");
        } finally {
            if (authLoading) authLoading.classList.add("hidden");
        }
    });

    scheduleDateRollover();
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) refreshDateSensitiveState();
    });
}

function refreshDateSensitiveState() {
    const now = new Date();
    const nextDate = formatLocalDate(now);
    if (currentPageDate === nextDate) return;
    currentPageDate = nextDate;
    dom.currentDate.innerText = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
    // TEMP-AROHA-DAY-2026-08-01: 자정 이후에는 예약 화면이 자동으로 다시 열립니다.
    updateArohaDayArReservationUi(now);
    if (!isAdminUser) {
        dom.startDate.value = nextDate;
        dom.endDate.value = nextDate;
        subscribeArLogsToday();
    } else if (typeof refreshAdminArTodayScheduleDate === "function") {
        refreshAdminArTodayScheduleDate();
    }
    renderAttendanceEventBanner(attendanceEventsState);
    generateTimeSlots();
}

function scheduleDateRollover() {
    window.clearTimeout(dateRolloverTimer);
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    dateRolloverTimer = window.setTimeout(() => {
        refreshDateSensitiveState();
        scheduleDateRollover();
    }, Math.max(1000, nextMidnight.getTime() - now.getTime() + 250));
}

document.addEventListener("DOMContentLoaded", initializePage);
