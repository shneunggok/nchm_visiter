/**
 * ==================== nchm.js 파일 설명 ====================
 * 이 파일은 시흥시능곡청소년문화의집 통합 서비스의 모든 동작을 관리합니다.
 * Firebase Realtime Database와 연동하여 데이터를 저장합니다.
 *
 * 수정 규칙:
 * 
 * 2. 데이터 저장 구조(AGE_GROUPS, PURPOSES)는 표준을 따르세요
 * 3. HTML 요소 ID명 변경 금지 (nchm.html과 연동)
 * 4. 스타일 수정은 nchm.css에서만 처리
 * ==========================================================
 */

/* ==================== Firebase 초기화 ==================== */



const firebaseConfig = {
    apiKey: "AIzaSyDm2x9BtBynGBJYZ56eNjoAMH3fxIGdyyw",
    authDomain: "nchm-131bb.firebaseapp.com",
    databaseURL: "https://nchm-131bb-default-rtdb.firebaseio.com",
    projectId: "nchm-131bb",
    storageBucket: "nchm-131bb.firebasestorage.app",
    messagingSenderId: "592225829882",
    appId: "1:592225829882:web:92942c947bbc498926da43",
    measurementId: "G-W0YLVVCQ9R"
};

// Firebase 앱 초기화
firebase.initializeApp(firebaseConfig);

// Firebase Authentication
const auth = firebase.auth();

// Realtime Database 참조
const db = firebase.database();
const visitLogsRef = db.ref("visitLogs");
const arLogsRef = db.ref("arLogs");

/* ==================== 전역 상수 및 변수 ==================== */

const AGE_GROUPS = [
    "초등(9~13세)",
    "중등(14~16세)",
    "고등(17~19세)",
    "청년(20~24세)",
    "청년(25~39세)",
    "유아(8세 미만)",
    "성인(40세 이상)"
];

const PURPOSES = ["휴식", "독서", "보드게임", "탁구", "스터디룸"];

// 메모리에 올려둔 데이터 (Firebase에서 실시간으로 받아옴)
let visitLogs = [];
let arLogs = [];

// 현재 필터 상태
let currentFilter = "all";

/* ==================== Firebase 데이터 불러오기 ==================== */

/**
 * Firebase에서 방문 등록 데이터를 실시간으로 구독합니다.
 * 데이터가 바뀔 때마다 자동으로 visitLogs를 업데이트합니다.
 */
function initFirebaseListeners() {
    visitLogsRef.on("value", (snapshot) => {
        visitLogs = [];
        snapshot.forEach((child) => {
            visitLogs.push({ _key: child.key, ...child.val() });
        });
        updateAdminDashboard();
    });

    arLogsRef.on("value", (snapshot) => {
        arLogs = [];
        snapshot.forEach((child) => {
            arLogs.push({ _key: child.key, ...child.val() });
        });
        updateAdminDashboard();
    });
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

/**
 * Firebase에 방문 등록 데이터 저장
 */
function saveVisitLog(logData) {
    return visitLogsRef.push(logData);
}

/**
 * Firebase에 AR 예약 데이터 저장
 */
function saveArLog(logData) {
    return arLogsRef.push(logData);
}

function showMessage(msg) {
    const box = document.getElementById("custom-alert");
    box.innerText = msg;
    box.style.display = "block";
    setTimeout(() => {
        box.style.display = "none";
    }, 2000);
}

/* ==================== 관리자 인증 함수 ==================== */

function openPasswordModal() {
    document.getElementById("password-modal").classList.remove("hidden");
    document.getElementById("admin-password-input").value = "";
    document.getElementById("admin-password-input").focus();
}

function closePasswordModal() {
    document.getElementById("password-modal").classList.add("hidden");
}

/**
 * 관리자 비밀번호 검증

 */
async function verifyAdminPassword() {

    const password =
        document.getElementById("admin-password-input").value;

    try {

        await auth.signInWithEmailAndPassword(
            "choewonhyeog387@gmail.com",
            password
        );

        closePasswordModal();

        // 로그인 완료 후 데이터 재구독
        visitLogsRef.off();
        arLogsRef.off();

        visitLogsRef.on("value", (snapshot) => {
            visitLogs = [];

            snapshot.forEach((child) => {
                visitLogs.push({
                    _key: child.key,
                    ...child.val()
                });
            });

            updateAdminDashboard();
        });

        arLogsRef.on("value", (snapshot) => {
            arLogs = [];

            snapshot.forEach((child) => {
                arLogs.push({
                    _key: child.key,
                    ...child.val()
                });
            });

            updateAdminDashboard();
        });

        setTimeout(() => {
            enterAdminMode();
        }, 500);

    } catch (e) {

        console.error(e);

        showMessage("비밀번호가 틀렸습니다.");

        document.getElementById("admin-password-input").value = "";
        document.getElementById("admin-password-input").focus();
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
    switchTab("visit");
}

function deleteVisitLog(key) {

    if (!confirm("이 방문기록을 삭제하시겠습니까?")) return;

    visitLogsRef.child(key)
        .remove()
        .then(() => {
            showMessage("삭제 완료");
        })
        .catch((err) => {
            alert(err.message);
        });
}

function deleteArLog(key) {

    if (!confirm("이 AR 예약을 삭제하시겠습니까?")) return;

    arLogsRef.child(key)
        .remove()
        .then(() => {
            showMessage("삭제 완료");
        })
        .catch((err) => {
            alert(err.message);
        });
}

/* ==================== 탭 전환 함수 ==================== */

function switchTab(type) {
    document.getElementById("tab-visit").className = "tab-btn font-bold";
    document.getElementById("tab-ar").className = "tab-btn font-bold";
    document.getElementById("main-tabs").classList.remove("hidden");
    document.getElementById("section-visit").classList.add("hidden");
    document.getElementById("section-ar").classList.add("hidden");

    if (type === "visit") {
        document.body.className = "pb-10 theme-visit";
        document.getElementById("section-visit").classList.remove("hidden");
        document.getElementById("tab-visit").classList.add("active-visit");
    } else {
        document.body.className = "pb-10 theme-ar";
        document.getElementById("section-ar").classList.remove("hidden");
        document.getElementById("tab-ar").classList.add("active-ar");
        generateTimeSlots();
        showArNotice(); // ar 팝업창 띄우는 함수에요
    }
}

function switchAdminSubTab(tab) {
    document.getElementById("admin-visit-logs").classList.add("hidden");
    document.getElementById("admin-ar-logs").classList.add("hidden");
    document.getElementById("subtab-visit-logs").classList.remove("active-visit");
    document.getElementById("subtab-ar-logs").classList.remove("active-ar");

    if (tab === "visit-logs") {
        document.getElementById("admin-visit-logs").classList.remove("hidden");
        document.getElementById("subtab-visit-logs").classList.add("active-visit");
    } else {
        document.getElementById("admin-ar-logs").classList.remove("hidden");
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
/* ==================== 팝업함수 ( AR) ==================== */
function showArNotice() {
    document.getElementById("ar-notice-modal").classList.remove("hidden");
}

function closeArNotice() {
    document.getElementById("ar-notice-modal").classList.add("hidden");
}

/* ==================== AR 예약 이용자 카드 ==================== */

let arCount = 0;

function changeArCount(delta) {
    const newCount = arCount + delta;
    if (newCount < 1) return;

    const container = document.getElementById("ar-user-container");

    if (delta > 0) {
       
        const div = document.createElement("div");
        div.className = "ar-user-card card-shadow animate-fadeIn";
        div.innerHTML = `
            <div class="flex flex-1 gap-3">
                <div class="flex-1"><input type="text" placeholder="이름" class="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center text-base font-bold outline-none focus:border-indigo-400"></div>
                <div class="flex bg-slate-100 p-1.5 rounded-2xl gap-1 w-32 shrink-0">
                    <button type="button" class="flex-1 py-2.5 bg-white rounded-xl text-sm font-bold shadow-sm" onclick="selectGender(this)">남</button>
                    <button type="button" class="flex-1 py-2.5 text-sm font-bold text-slate-400" onclick="selectGender(this)">여</button>
                </div>
            </div>
            <div class="flex gap-3 items-center">
                <select class="flex-1 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold outline-none focus:border-indigo-400">
                    <option value="" disabled selected>나이 선택</option>
                    ${AGE_GROUPS.map((age) => `<option>${age}</option>`).join("")}
                </select>
            </div>
        `;
        container.appendChild(div);
        refreshIcons();
        div.querySelector("input")?.focus();
    } else if (delta < 0) {
        
        if (container.lastElementChild) {
            container.lastElementChild.remove();
        }
    }

    arCount = newCount;
    document.getElementById("ar-count-display").innerText = arCount;
}
function selectGender(btn) {
    const parent = btn.parentElement;
    parent.querySelectorAll("button").forEach((button) => {
        button.className = "flex-1 py-2.5 text-sm font-bold text-slate-400";
    });
    btn.className = "flex-1 py-2.5 bg-white rounded-xl text-sm font-bold shadow-sm";
}

/* ==================== 시간대 버튼 생성 ==================== */

function generateTimeSlots() {
    const container = document.getElementById("time-container");
    const indicator = document.getElementById("ar-day-indicator");

    container.innerHTML = "";

    const now = new Date();
    const day = now.getDay();
    const isWeekend = day === 0 || day === 6;
    const todayStr = formatLocalDate(now);
    const reservedSlots = arLogs
        .filter((log) => log.date === todayStr)
        .map((log) => log.timeSlot);

    if (isWeekend) {
        indicator.innerText = "🗓️ 주말 운영 (10:00~17:30)";
        indicator.className = "mb-4 inline-block px-4 py-1.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700";

        for (let h = 10; h < 18; h += 1) {
            if (h === 12) continue;
            ["00", "30"].forEach((m) => {
                if (h === 17 && m === "30") return;
                addTimeBtn(container, h, m, reservedSlots);
            });
        }
    } else {
        indicator.innerText = "🗓️ 평일 운영 (10:00~20:30)";
        indicator.className = "mb-4 inline-block px-4 py-1.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700";

        for (let h = 10; h <= 20; h += 1) {
            if (h === 12) continue;
            ["00", "30"].forEach((m) => {
                if (h === 20 && m === "30") return;
                addTimeBtn(container, h, m, reservedSlots);
            });
        }
    }

    refreshIcons();
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

/* ==================== 필터 함수 ==================== */

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

    const customDateBox = document.getElementById("custom-date-inputs");
    if (type === "custom") {
        customDateBox.classList.remove("hidden");
    } else {
        customDateBox.classList.add("hidden");
    }

    if (type === "all") {
        updateAdminDashboard();
    }
}

function isDateInRange(dateStr) {
    const targetDate = new Date(dateStr);

    if (currentFilter === "all") return true;

    if (currentFilter === "month") {
        const selectedYear = parseInt(document.getElementById("filter-year-select").value, 10);
        const selectedMonth = parseInt(document.getElementById("filter-month-select").value, 10);
        return targetDate.getMonth() === selectedMonth && targetDate.getFullYear() === selectedYear;
    }

    if (currentFilter === "custom") {
        const start = document.getElementById("start-date").value;
        const end = document.getElementById("end-date").value;
        if (!start || !end) return true;
        const startDate = new Date(start);
        const endDate = new Date(end);
        endDate.setHours(23, 59, 59);
        return targetDate >= startDate && targetDate <= endDate;
    }

    return true;
}

/* ==================== 통계 테이블 렌더링 ==================== */

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
        tr.innerHTML = `<td class="category-row">${category}</td>`;

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

/* ==================== 관리자 대시보드 업데이트 ==================== */

function updateAdminDashboard() {
    if (!document.getElementById("visit-log-body") || !document.getElementById("ar-log-body")) {
        return;
    }

    const filteredVisitLogs = visitLogs.filter((log) => isDateInRange(log.date));
    const filteredArLogs = arLogs.filter((log) => isDateInRange(log.date));

    const generalPurposes = PURPOSES.filter((purpose) => purpose !== "스터디룸");

    const vStats = {};
    generalPurposes.forEach((purpose) => {
        vStats[purpose] = {};
        AGE_GROUPS.forEach((age) => {
            vStats[purpose][age] = { 남: 0, 여: 0 };
        });
    });

    filteredVisitLogs.forEach((log) => {
        (log.purposes || []).forEach((purpose) => {
            if (generalPurposes.includes(purpose) && vStats[purpose] && vStats[purpose][log.age]) {
                vStats[purpose][log.age][log.gender] += 1;
            }
        });
    });

    renderStatsTable(vStats, generalPurposes, "visit-stats-body", "visit-stats-footer", "sum-col");

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
//여기 복붙
    const visitBody = document.getElementById("visit-log-body");
visitBody.innerHTML = "";

filteredVisitLogs.slice().reverse().forEach((log) => {

    const tr = document.createElement("tr");
    tr.className = "border-b hover:bg-slate-50";

    tr.innerHTML = `
        <td class="py-3 text-slate-500 font-bold text-xs">${log.date}</td>
        <td class="text-slate-400 font-medium">${log.time}</td>
        <td class="font-bold">${log.name}</td>
        <td>${log.gender}</td>
        <td>${log.age.split("(")[0]}</td>

        <td>
            <div class="flex gap-1 justify-center">
                ${(log.purposes || []).map((purpose) =>
                    `<span class="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px] font-bold">${purpose}</span>`
                ).join("")}
            </div>
        </td>

        <td>
            <button onclick="deleteVisitLog('${log._key}')"
                class="bg-red-500 text-white px-2 py-1 rounded text-xs">
                삭제
            </button>
        </td>
    `;

    visitBody.appendChild(tr);
});

document.getElementById("visit-count-badge").innerText =
    filteredVisitLogs.length + "건";

const arBody = document.getElementById("ar-log-body");
arBody.innerHTML = "";

filteredArLogs.slice().reverse().forEach((log) => {

    const tr = document.createElement("tr");
    tr.className = "border-b hover:bg-indigo-50/30";

    const details = (log.users || [])
        .map((user) =>
            `<span class="inline-block bg-slate-100 rounded-lg px-2 py-1 mr-1 mb-1 text-slate-700 font-medium">
                ${user.name}
                <span class="text-[10px] text-slate-400 ml-1">
                    (${user.gender}, ${user.age.split("(")[0]})
                </span>
            </span>`
        )
        .join("");

    tr.innerHTML = `
        <td class="py-3 text-slate-500 font-bold text-xs">${log.date}</td>
        <td class="py-3 text-indigo-600 font-bold">${log.timeSlot}</td>
        <td class="font-bold">${log.users?.[0]?.name || ""}</td>
        <td>${log.users?.length || 0}명</td>
        <td class="text-xs text-left px-4 py-2">${details}</td>

        <td>
            <button onclick="deleteArLog('${log._key}')"
                class="bg-red-500 text-white px-2 py-1 rounded text-xs">
                삭제
            </button>
        </td>
    `;

    arBody.appendChild(tr);
});

document.getElementById("ar-count-badge").innerText =
    filteredArLogs.length + "건";
}

/* ==================== 폼 제출 (Firebase 저장) ==================== */

function submitForm(type) {
    const now = new Date();
    const timeStr = `${now.getHours()}:${now.getMinutes().toString().padStart(2, "0")}`;
    const dateStr = formatLocalDate(now);
    
        if (type === "visit") {
    const purposes = Array.from(document.querySelectorAll(".v-purpose.active")).map((purpose) => purpose.querySelector("span").innerText);

    if (purposes.length === 0) {
        showMessage("이용 목적을 선택해 주세요!");
        return;
    }

    const users = Array.from(document.querySelectorAll("#visit-user-container .ar-user-card")).map((card) => {
        const genderBtn = Array.from(card.querySelectorAll("button")).find((button) => button.classList.contains("bg-white"));
        return {
            name: card.querySelector("input").value.trim(),
            gender: genderBtn ? genderBtn.innerText.trim() : "남",
            age: card.querySelector("select").value
        };
    });

    if (users.length === 0 || users.some((user) => !user.name || !user.age)) {
        showMessage("모든 방문자 정보를 입력해 주세요!");
        return;
    }

    const savePromises = users.map((user) => {
        const logData = { date: dateStr, time: timeStr, name: user.name, gender: user.gender, age: user.age, purposes };
        return saveVisitLog(logData);
    });

    Promise.all(savePromises)
        .then(() => {
            alert(`${users.length}명 방문 등록이 완료되었습니다!`);
            visitCount = 1;
            document.getElementById("v-count-display").innerText = "1";
            document.getElementById("v-count-minus").classList.add("opacity-40", "cursor-not-allowed");
            document.getElementById("visit-user-container").innerHTML = "";
            document.getElementById("visit-user-container").classList.add("hidden");
            document.getElementById("v-form-bottom").classList.add("hidden");
            document.querySelectorAll(".v-purpose").forEach((button) => button.classList.remove("active"));
        })
        .catch((err) => {
            alert("저장 중 오류가 발생했습니다: " + err.message);
        });
//여기까지 
    } else {
        const timeSlot = document.querySelector(".time-slot-btn.active")?.querySelector("span")?.innerText;

        if (!timeSlot) {
            showMessage("시간을 선택해 주세요!");
            return;
        }

        const users = Array.from(document.querySelectorAll(".ar-user-card")).map((card) => {
            const genderBtn = Array.from(card.querySelectorAll("button")).find((button) => button.classList.contains("bg-white"));
            return {
                name: card.querySelector("input").value.trim(),
                gender: genderBtn ? genderBtn.innerText.trim() : "남",
                age: card.querySelector("select").value
            };
        });

        if (users.length === 0 || users.some((user) => !user.name || !user.age)) {
            showMessage("정보를 모두 입력해 주세요!");
            return;
        }

        const logData = { date: dateStr, timeSlot, users };

        // ✅ Firebase에 저장
        saveArLog(logData)
            .then(() => {
                alert("AR 예약이 신청되었습니다!");
                document.getElementById("ar-user-container").innerHTML = "";
                document.querySelectorAll(".time-slot-btn").forEach((button) => {
                    button.classList.remove("active");
                });
              arCount = 0;
                document.getElementById("ar-user-container").innerHTML = "";
                document.getElementById("ar-count-display").innerText = "0";
            changeArCount(1);
        generateTimeSlots();
        switchTab("visit");
                
            })
            .catch((err) => {
                alert("저장 중 오류가 발생했습니다: " + err.message);
            });
    }
}

/* ==================== 엑셀 다운로드 ==================== */

function exportToExcel(type) {
    let csvContent = "\uFEFF";
    let fileName = "";

    if (type === "visit") {
        const filtered = visitLogs.filter((log) => isDateInRange(log.date));
        if (filtered.length === 0) {
            alert("데이터가 없습니다.");
            return;
        }
        csvContent += "날짜,시간,이름,성별,나이,이용목적\n";
        filtered.forEach((log) => {
            csvContent += `${log.date},${log.time},${log.name},${log.gender},${log.age.split("(")[0]},"${(log.purposes || []).join(", ")}"\n`;
        });
        fileName = `방문등록_${formatLocalDate(new Date())}.csv`;
    } else {
        const filtered = arLogs.filter((log) => isDateInRange(log.date));
        if (filtered.length === 0) {
            alert("데이터가 없습니다.");
            return;
        }
        csvContent += "예약날짜,예약시간,대표자,총인원,이용자상세\n";
        filtered.forEach((log) => {
            const details = (log.users || []).map((user) => `${user.name}(${user.gender}/${user.age.split("(")[0]})`).join(" | ");
            csvContent += `${log.date},${log.timeSlot},${log.users?.[0]?.name || ""},${log.users?.length || 0},"${details}"\n`;
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

/* ==================== 필터 초기화 ==================== */

function initFilterOptions() {
    const yearSelect = document.getElementById("filter-year-select");
    const monthSelect = document.getElementById("filter-month-select");
    const now = new Date();

    for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y += 1) {
        const option = document.createElement("option");
        option.value = y;
        option.innerText = y + "년";
        if (y === now.getFullYear()) {
            option.selected = true;
        }
        yearSelect.appendChild(option);
    }

    monthSelect.value = now.getMonth();
}
/* ==================== 방문 등록 인원수 ==================== */

let visitCount = 1;

function changeVisitCount(delta) {
    visitCount = Math.max(1, visitCount + delta);
    document.getElementById("v-count-display").innerText = visitCount;
    const minusBtn = document.getElementById("v-count-minus");
    if (visitCount === 1) {
        minusBtn.classList.add("opacity-40", "cursor-not-allowed");
    } else {
        minusBtn.classList.remove("opacity-40", "cursor-not-allowed");
    }
}

function confirmVisitCount() {
    const container = document.getElementById("visit-user-container");
    const bottom = document.getElementById("v-form-bottom");
    container.innerHTML = "";
    for (let i = 0; i < visitCount; i++) {
        const div = document.createElement("div");
        div.className = "ar-user-card card-shadow animate-fadeIn";
        div.innerHTML = `
            <div class="flex flex-1 gap-3">
                <div class="flex-1"><input type="text" maxlength="4" placeholder="이름" class="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center text-base font-bold outline-none focus:border-blue-400"></div>
                <div class="flex bg-slate-100 p-1.5 rounded-2xl gap-1 w-32 shrink-0">
                    <button type="button" class="flex-1 py-2.5 bg-white rounded-xl text-sm font-bold shadow-sm" onclick="selectGender(this)">남</button>
                    <button type="button" class="flex-1 py-2.5 text-sm font-bold text-slate-400" onclick="selectGender(this)">여</button>
                </div>
            </div>
            <div class="flex gap-3 items-center">
                <select class="flex-1 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold outline-none focus:border-blue-400">
                    <option value="" disabled selected>나이 선택</option>
                    ${AGE_GROUPS.map((age) => `<option>${age}</option>`).join("")}
                </select>
            </div>
        `;
        container.appendChild(div);
    }
    container.classList.remove("hidden");
    bottom.classList.remove("hidden");
    refreshIcons();
    setTimeout(() => {
        container.querySelector("input")?.focus();
    }, 100);
}
/* ==================== 페이지 초기화 ==================== */

function initializePage() {
    const now = new Date();
    document.getElementById("current-date").innerText = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
    document.getElementById("start-date").value = formatLocalDate(now);
    document.getElementById("end-date").value = formatLocalDate(now);

    initFilterOptions();
    changeArCount(1);
    initFirebaseListeners(); // ✅ Firebase 데이터 구독 시작
    refreshIcons();

}

document.addEventListener("DOMContentLoaded", initializePage);
