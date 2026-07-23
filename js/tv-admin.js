/* TV administrator: all editable TV data is kept in Firebase RTDB. */
const TV_DEFAULTS = {
    autoSave: true,
    theme: "dark",
    background: { color: "#0f172a", image: "", video: "" },
    welcome: { title: "시흥시능곡청소년문화의집", subtitle: "청소년의 꿈이 자라는 공간", description: "", logo: "" },
    visitors: { maximum: 0, showSchool: false, showNickname: false, order: "count" },
    ranking: { limit: 5, period: "monthly" },
    ar: { showCurrentReservation: true, showCurrentUsage: true, showWaitingQueue: true, showTodayCount: true },
    operatingHours: { open: "10:00", close: "21:00", holidayMode: false },
    slides: ["welcome", "visitors", "ranking", "ar", "events", "photos", "notices"].map((id) => ({ id, enabled: true, duration: 8 }))
};
const TV_LABELS = { welcome: "환영 화면", visitors: "오늘의 방문자", ranking: "출석왕", ar: "AR 현황", events: "이벤트", photos: "사진", notices: "공지사항" };
let tvAdminSettings = null;
let tvAdminDirty = false;
let tvAdminSaveTimer = null;
let tvAdminSettingsListener = null;
let tvAdminSaving = false;

function tvMerge(base, value) {
    const result = Array.isArray(base) ? base.slice() : { ...base };
    Object.keys(value || {}).forEach((key) => {
        result[key] = value[key] && typeof value[key] === "object" && !Array.isArray(value[key]) && base[key] ? tvMerge(base[key], value[key]) : value[key];
    });
    return result;
}
function tvEscape(value) { return escapeHtml(value == null ? "" : value); }
function tvPanel() { return document.getElementById("admin-tv-settings"); }
function tvButton(label, action, classes) { return `<button type="button" data-tv-action="${action}" class="${classes}">${label}</button>`; }
function tvField(label, input, help) { return `<label class="block space-y-1.5"><span class="block text-sm font-bold text-slate-700">${label}</span>${input}${help ? `<span class="block text-xs leading-5 text-slate-500">${help}</span>` : ""}</label>`; }
function tvMarkDirty() {
    tvAdminDirty = true;
    document.getElementById("tv-unsaved")?.classList.remove("hidden");
    if (tvAdminSettings.autoSave) {
        clearTimeout(tvAdminSaveTimer);
        tvAdminSaveTimer = setTimeout(saveTvSettings, 500);
    }
}
function tvReadForm() {
    const s = tvAdminSettings;
    s.autoSave = document.getElementById("tv-auto-save").checked;
    s.theme = document.getElementById("tv-theme").value;
    s.background.color = document.getElementById("tv-bg-color").value;
    s.background.image = document.getElementById("tv-bg-image").value.trim();
    s.background.video = document.getElementById("tv-bg-video").value.trim();
    s.welcome.title = document.getElementById("tv-welcome-title").value.trim();
    s.welcome.subtitle = document.getElementById("tv-welcome-subtitle").value.trim();
    s.welcome.description = document.getElementById("tv-welcome-description").value.trim();
    s.welcome.logo = document.getElementById("tv-welcome-logo").value.trim();
    s.operatingHours.open = document.getElementById("tv-open").value;
    s.operatingHours.close = document.getElementById("tv-close").value;
    s.operatingHours.holidayMode = document.getElementById("tv-holiday").checked;
    s.slides.forEach((slide) => {
        const row = document.querySelector('[data-tv-slide="' + slide.id + '"]');
        slide.enabled = row.querySelector("input[type=checkbox]").checked;
        slide.duration = Number(row.querySelector("select").value);
    });
}
function renderTvManagement() {
    const s = tvAdminSettings || TV_DEFAULTS;
    const p = tvPanel();
    if (!p) return;
    p.innerHTML = `
      <div class="bg-white rounded-[28px] p-5 sm:p-8 border border-slate-200 card-shadow space-y-7">
        <div class="flex flex-wrap justify-between items-start gap-5 border-b border-slate-100 pb-6"><div><div class="flex items-center gap-2"><span class="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-xl">📺</span><h2 class="text-2xl font-black tracking-tight text-slate-900">TV 관리</h2></div><p class="mt-3 text-sm leading-6 text-slate-500">화면 순서, 안내 문구와 이미지를 관리합니다. 저장하면 운영 중인 TV에 바로 반영됩니다.</p></div><div class="flex flex-wrap items-center gap-2"><span id="tv-unsaved" class="${tvAdminDirty ? "" : "hidden"} rounded-full bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">저장할 변경사항 있음</span>${tvButton("미리보기", "preview", "rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50")}${tvButton("변경사항 저장", "save", "rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700")}</div></div>
        <div class="flex flex-wrap gap-2 border-b pb-4 text-sm font-bold" id="tv-tabs">
          ${["slides:화면 순서", "content:문구·이미지", "appearance:화면 스타일", "operation:운영 시간", "status:연결 상태"].map((x, i) => { const [id, label] = x.split(":"); return `<button type="button" data-tv-tab="${id}" class="px-3 py-2 rounded-lg ${i ? "text-slate-500 hover:bg-slate-50" : "bg-indigo-50 text-indigo-700"}">${label}</button>`; }).join("")}
        </div>
        <div id="tv-tab-slides" class="tv-tab space-y-4"><div><h3 class="font-bold text-slate-800">표시할 화면과 순서</h3><p class="mt-1 text-sm text-slate-500">왼쪽 손잡이를 끌어 순서를 바꾸고, 노출 여부와 화면 유지 시간을 정하세요.</p></div><div id="tv-slide-list" class="space-y-2">${s.slides.map((slide) => `<div draggable="true" data-tv-slide="${slide.id}" class="choice-btn rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap items-center gap-3 shadow-sm"><span class="cursor-move select-none text-xl text-slate-400" title="끌어서 순서 변경">⋮⋮</span><b class="min-w-[9rem] flex-1 text-slate-800">${TV_LABELS[slide.id.split("-")[0]] || tvEscape(slide.id)}</b><label class="flex items-center gap-2 text-sm font-bold text-slate-600"><input class="h-4 w-4 accent-indigo-600" type="checkbox" ${slide.enabled ? "checked" : ""}> TV에 표시</label><label class="flex items-center gap-2 text-sm text-slate-500">유지 시간 <select class="rounded-lg border border-slate-200 bg-white p-2 text-sm font-bold text-slate-700">${[5,8,10,15,20,30].map((n) => `<option value="${n}" ${slide.duration === n ? "selected" : ""}>${n}초</option>`).join("")}</select></label><button type="button" data-tv-duplicate="${slide.id}" class="text-sm font-bold text-indigo-600">복제</button><button type="button" data-tv-delete="${slide.id}" class="text-sm font-bold text-rose-600">삭제</button></div>`).join("")}</div></div>
        <div id="tv-tab-content" class="tv-tab hidden space-y-6">
          <div class="grid lg:grid-cols-2 gap-5"><section class="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 space-y-4"><div><h3 class="font-bold text-slate-800">환영 화면</h3><p class="mt-1 text-xs text-slate-500">TV를 켰을 때 보이는 첫 인사말입니다.</p></div>${tvField("제목", `<input id="tv-welcome-title" value="${tvEscape(s.welcome.title)}" class="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" placeholder="예: 시흥시능곡청소년문화의집">`)}${tvField("부제목", `<input id="tv-welcome-subtitle" value="${tvEscape(s.welcome.subtitle)}" class="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" placeholder="예: 청소년의 꿈이 자라는 공간">`)}${tvField("추가 안내", `<textarea id="tv-welcome-description" class="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" rows="3" placeholder="필요한 경우에만 입력하세요">${tvEscape(s.welcome.description)}</textarea>`)}${tvField("로고 이미지", `<input id="tv-welcome-logo" value="${tvEscape(s.welcome.logo)}" class="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" placeholder="아래에서 파일을 선택하거나 이미지 주소를 붙여 넣으세요">`, "권장: 가로형 PNG 또는 JPG")}</section>
          <section class="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5"><h3 class="font-bold text-slate-800">출석 이벤트 안내</h3><p class="mt-2 text-sm leading-6 text-slate-600">방문·AR 출석 이벤트는 아래 <b>출석 이벤트</b> 카드에서 한곳으로 관리합니다. 기존 출석왕 설정은 더 이상 사용하지 않습니다.</p></section></div>
          <div class="grid lg:grid-cols-3 gap-5"><section class="rounded-2xl border border-slate-200 bg-white p-5"><div class="flex items-start justify-between gap-3"><div><h3 class="font-bold text-slate-800">이벤트</h3><p class="mt-1 text-xs text-slate-500">진행 중인 행사만 TV에 표시됩니다.</p></div><button type="button" data-tv-content-add="events" class="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700">+ 이벤트 추가</button></div><div id="tv-events-editor" class="mt-4"></div></section><section class="rounded-2xl border border-slate-200 bg-white p-5"><div class="flex items-start justify-between gap-3"><div><h3 class="font-bold text-slate-800">공지사항</h3><p class="mt-1 text-xs text-slate-500">이미지 공지는 TV 전체 화면에 포스터처럼 표시됩니다.</p></div><button type="button" data-tv-content-add="notices" class="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700">+ 텍스트 공지</button></div><label id="tv-notice-dropzone" class="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center hover:border-indigo-300 hover:bg-indigo-50/50"><span class="text-2xl">🖼️</span><span class="mt-2 text-sm font-bold text-slate-800">이미지 공지 업로드</span><span class="mt-1 text-xs text-slate-500">포스터 이미지를 끌어놓거나 클릭하세요</span><input id="tv-notice-image-upload" type="file" accept="image/*" class="sr-only"></label><div id="tv-notice-upload-progress" class="mt-3 text-xs text-slate-500" aria-live="polite"></div><div id="tv-notices-editor" class="mt-4"></div></section><section class="rounded-2xl border border-slate-200 bg-white p-5"><h3 class="font-bold text-slate-800">갤러리 사진</h3><p class="mt-1 text-xs text-slate-500">사진을 끌어놓거나 버튼을 눌러 추가하세요.</p><label id="tv-photo-dropzone" class="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 px-4 py-6 text-center hover:bg-indigo-50"><span class="text-2xl">🖼️</span><span class="mt-2 text-sm font-bold text-indigo-700">사진 선택 또는 여기로 끌어놓기</span><span class="mt-1 text-xs text-slate-500">JPG, PNG, WEBP · 여러 장 선택 가능</span><input id="tv-photo-upload" type="file" accept="image/*" multiple class="sr-only"></label><div id="tv-upload-progress" class="mt-3 text-xs text-slate-500" aria-live="polite"></div><div id="tv-photos-editor" class="mt-4 grid grid-cols-2 gap-3"></div></section></div>
          <section class="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5"><div class="flex flex-wrap items-start justify-between gap-3"><div><h3 class="font-bold text-slate-800">방문 · AR 출석 이벤트</h3><p class="mt-1 text-sm text-slate-500">기간 안에 조건을 만족한 이용자를 위한 이벤트입니다. 진행 상태와 방문자 화면 안내는 날짜를 기준으로 자동 처리됩니다.</p></div><button type="button" data-tv-attendance-add class="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white">+ 출석 이벤트 만들기</button></div><div id="tv-attendance-events-editor" class="mt-4 grid gap-3 md:grid-cols-2"></div></section>
        </div>
        <div id="tv-tab-appearance" class="tv-tab hidden grid sm:grid-cols-2 gap-5"><section class="space-y-3"><h3 class="font-bold">테마 · 배경</h3><select id="tv-theme" class="p-2 border rounded"><option value="light" ${s.theme === "light" ? "selected" : ""}>라이트</option><option value="dark" ${s.theme === "dark" ? "selected" : ""}>다크</option><option value="blue" ${s.theme === "blue" ? "selected" : ""}>블루</option></select><label class="block">색상 <input id="tv-bg-color" type="color" value="${tvEscape(s.background.color)}"></label><input id="tv-bg-image" value="${tvEscape(s.background.image)}" class="w-full p-2 border rounded" placeholder="배경 이미지 URL"><input id="tv-bg-video" value="${tvEscape(s.background.video)}" class="w-full p-2 border rounded" placeholder="향후 비디오 URL"></section><section class="space-y-3"><h3 class="font-bold">자동 저장</h3><label><input id="tv-auto-save" type="checkbox" ${s.autoSave ? "checked" : ""}> 변경 후 자동 저장</label><button type="button" data-tv-action="reset" class="block text-red-600 font-bold">기본 설정으로 재설정</button></section></div>
        <div id="tv-tab-operation" class="tv-tab hidden space-y-4"><h3 class="font-bold">운영 시간</h3><label>시작 <input id="tv-open" type="time" value="${s.operatingHours.open}" class="p-2 border rounded"></label><label>종료 <input id="tv-close" type="time" value="${s.operatingHours.close}" class="p-2 border rounded"></label><label><input id="tv-holiday" type="checkbox" ${s.operatingHours.holidayMode ? "checked" : ""}> 휴일 모드 (자동 휴무 화면)</label></div>
        <div id="tv-tab-status" class="tv-tab hidden"><div id="tv-status-card" class="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">상태를 불러오는 중입니다.</div></div>
      </div>`;
    tvBindManagement();
    tvLoadContentEditors();
}
function tvBindManagement() {
    tvPanel().querySelectorAll("input,select,textarea").forEach((el) => el.addEventListener(el.matches("input[type=text], textarea") ? "input" : "change", tvMarkDirty));
    tvPanel().querySelectorAll("[data-tv-tab]").forEach((btn) => btn.addEventListener("click", () => { tvPanel().querySelectorAll(".tv-tab").forEach((el) => el.classList.add("hidden")); tvPanel().querySelectorAll("[data-tv-tab]").forEach((tab) => tab.className = "px-3 py-2 rounded-lg text-slate-500 hover:bg-slate-50"); btn.className = "px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700"; document.getElementById("tv-tab-" + btn.dataset.tvTab).classList.remove("hidden"); }));
    tvPanel().querySelector("[data-tv-action=save]").addEventListener("click", saveTvSettings);
    tvPanel().querySelector("[data-tv-action=preview]").addEventListener("click", openTvPreview);
    tvPanel().querySelector("[data-tv-action=reset]").addEventListener("click", () => { if (confirm("TV 설정을 기본값으로 되돌릴까요?")) { tvAdminSettings = structuredClone(TV_DEFAULTS); tvMarkDirty(); renderTvManagement(); } });
    tvPanel().querySelectorAll("[data-tv-duplicate]").forEach((b) => b.addEventListener("click", () => { const source = tvAdminSettings.slides.find((s) => s.id === b.dataset.tvDuplicate); tvAdminSettings.slides.push({ ...source, id: source.id + "-" + Date.now() }); tvMarkDirty(); renderTvManagement(); }));
    tvPanel().querySelectorAll("[data-tv-delete]").forEach((b) => b.addEventListener("click", () => { if (tvAdminSettings.slides.length > 1) { tvAdminSettings.slides = tvAdminSettings.slides.filter((s) => s.id !== b.dataset.tvDelete); tvMarkDirty(); renderTvManagement(); } }));
    let dragged; tvPanel().querySelectorAll("[data-tv-slide]").forEach((row) => { row.addEventListener("dragstart", () => dragged = row); row.addEventListener("dragover", (e) => e.preventDefault()); row.addEventListener("drop", () => { if (dragged !== row) { row.parentNode.insertBefore(dragged, row); tvAdminSettings.slides = [...row.parentNode.children].map((el) => tvAdminSettings.slides.find((s) => s.id === el.dataset.tvSlide)); tvMarkDirty(); } }); });
    const upload = document.getElementById("tv-photo-upload");
    const dropzone = document.getElementById("tv-photo-dropzone");
    upload?.addEventListener("change", (e) => tvUploadPhotos([...e.target.files]));
    ["dragenter", "dragover"].forEach((eventName) => dropzone?.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.add("border-indigo-500", "bg-indigo-100"); }));
    ["dragleave", "drop"].forEach((eventName) => dropzone?.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.remove("border-indigo-500", "bg-indigo-100"); }));
    dropzone?.addEventListener("drop", (event) => tvUploadPhotos([...event.dataTransfer.files]));
    const noticeUpload = document.getElementById("tv-notice-image-upload");
    const noticeDropzone = document.getElementById("tv-notice-dropzone");
    noticeUpload?.addEventListener("change", (event) => tvUploadNoticeImage(event.target.files && event.target.files[0]));
    ["dragenter", "dragover"].forEach((eventName) => noticeDropzone?.addEventListener(eventName, (event) => { event.preventDefault(); noticeDropzone.classList.add("border-indigo-500", "bg-indigo-100"); }));
    ["dragleave", "drop"].forEach((eventName) => noticeDropzone?.addEventListener(eventName, (event) => { event.preventDefault(); noticeDropzone.classList.remove("border-indigo-500", "bg-indigo-100"); }));
    noticeDropzone?.addEventListener("drop", (event) => tvUploadNoticeImage(event.dataTransfer.files && event.dataTransfer.files[0]));
}
async function saveTvSettings() {
    if (tvAdminSaving) return null;
    try {
        tvReadForm();
    } catch (error) {
        logError("tv.save.form", error);
        showMessage("TV 설정 데이터 오류: " + (error.message || "unknown"));
        return null;
    }

    try {
        const user = await tvRequireAdminSession("TV 설정 저장");
        if (!user) return null;
        tvAdminSaving = true;
        const saveButton = document.querySelector("[data-tv-action=save]");
        if (saveButton) { saveButton.disabled = true; saveButton.textContent = "저장 중..."; }

        await db.ref("tvSettings").set({ ...tvAdminSettings, updatedAt: firebase.database.ServerValue.TIMESTAMP });
        tvAdminDirty = false;
        document.getElementById("tv-unsaved")?.classList.add("hidden");
        showMessage("TV 설정이 저장되어 모든 화면에 반영되었습니다.", "success");
    } catch (error) {
        logError("tv.save", error);
        const detail = error && (error.code || error.message) ? (error.code || error.message) : "unknown_error";
        showMessage("TV 설정 저장 실패: " + detail);
        return null;
    } finally {
        tvAdminSaving = false;
        const saveButton = document.querySelector("[data-tv-action=save]");
        if (saveButton) { saveButton.disabled = false; saveButton.textContent = "변경사항 저장"; }
    }
}
function openTvPreview() { window.open("./tv.html?preview=1", "nchm-tv-preview", "width=1280,height=720,menubar=no,toolbar=no"); }
function tvContentRef(type) { return db.ref("tvContent/" + type); }
function tvUploadErrorMessage(error) {
    const code = error && error.code ? error.code : "";
    if (code === "storage/unauthorized") return "Firebase Storage 권한이 없습니다. 관리자 계정 권한 또는 Storage Rules를 확인해 주세요.";
    if (code === "storage/canceled") return "업로드가 취소되었습니다.";
    if (code === "storage/retry-limit-exceeded") return "네트워크가 불안정해 업로드 시간이 초과되었습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.";
    if (code === "storage/quota-exceeded") return "Firebase Storage 용량 한도를 초과했습니다.";
    if (code === "storage/invalid-argument") return "선택한 이미지 파일을 업로드할 수 없습니다. 다른 이미지로 다시 시도해 주세요.";
    return "알 수 없는 오류가 발생했습니다" + (code ? " (" + code + ")" : "");
}
async function tvRequireAdminSession(actionLabel) {
    let user = auth.currentUser;
    if (!user || user.isAnonymous || String(user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        showMessage((actionLabel || "TV 관리 작업") + " 실패: 관리자 로그인 세션이 없습니다. 다시 로그인해 주세요.");
        return null;
    }
    await user.getIdToken(true);
    user = auth.currentUser;
    const token = await user?.getIdTokenResult();
    const tokenEmail = String(token?.claims?.email || user?.email || "").toLowerCase();
    if (!user || user.isAnonymous || tokenEmail !== ADMIN_EMAIL.toLowerCase()) {
        showMessage((actionLabel || "TV 관리 작업") + " 실패: 관리자 계정으로 다시 로그인해 주세요.");
        return null;
    }
    return user;
}
function tvLoadContentEditors() { ["events","notices","photos"].forEach((type) => tvContentRef(type).once("value").then((s) => tvRenderContent(type, s.val() || {}))); tvContentRef("attendanceEvents").once("value").then((s) => tvRenderAttendanceEvents(s.val() || {})); tvRenderStatus(); document.querySelectorAll("[data-tv-content-add]").forEach((b) => b.addEventListener("click", () => tvEditContent(b.dataset.tvContentAdd))); document.querySelector("[data-tv-attendance-add]")?.addEventListener("click", tvEditAttendanceEvent); }
function tvAttendanceStatus(event) { const today = formatLocalDate(); return event.startDate > today ? "예정" : (!event.endDate || event.endDate >= today) ? "진행중" : "종료"; }
function tvMaskName(name) { const value = String(name || "").trim(); return value.length < 2 ? value : value[0] + "*" + value.slice(-1); }
function tvAttendanceRanking(event) { const source = event.type === "ar" ? arLogs : visitLogs; const counts = source.reduce((result, log) => { const name = String(log.name || log.leaderName || "").trim(); if (name && log.date >= event.startDate && (!event.endDate || log.date <= event.endDate)) result[name] = (result[name] || 0) + 1; return result; }, {}); return Object.entries(counts).map(([name, count]) => ({ name, count })).filter((item) => item.count >= Number(event.criteriaCount || 1)).sort((a,b) => b.count - a.count || a.name.localeCompare(b.name)); }
function tvRenderAttendanceEvents(items) { const root = document.getElementById("tv-attendance-events-editor"); if (!root) return; const list = Object.entries(items).sort((a,b) => String(b[1].startDate || "").localeCompare(String(a[1].startDate || ""))); root.innerHTML = list.map(([id, event]) => { const status = tvAttendanceStatus(event); const ranking = tvAttendanceRanking(event); return `<article class="rounded-xl border border-slate-200 bg-white p-4"><div class="flex items-center justify-between gap-3"><b class="text-slate-800">${event.type === "ar" ? "🎮 AR" : "🎉 방문"} ${tvEscape(event.title || "이벤트")}</b><span class="rounded-full px-2.5 py-1 text-xs font-bold ${status === "진행중" ? "bg-emerald-50 text-emerald-700" : status === "예정" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}">${status}</span></div><dl class="mt-3 grid grid-cols-2 gap-y-2 text-xs text-slate-600"><dt>기간</dt><dd>${tvEscape(event.startDate)} ~ ${tvEscape(event.endDate || "미정")}</dd><dt>당첨 인원</dt><dd>${Number(event.winnerCount || 0)}명</dd><dt>당첨 기준</dt><dd>${Number(event.criteriaCount || 1)}회 이상</dd><dt>조건 충족</dt><dd class="font-bold text-indigo-700">${ranking.length}명</dd></dl><div class="mt-4 rounded-lg bg-slate-50 p-3"><b class="text-xs text-slate-700">실시간 조건 충족 순위</b><ol class="mt-2 space-y-1 text-xs text-slate-600">${ranking.slice(0, 5).map((item, index) => `<li class="flex justify-between"><span>${index + 1}위 ${tvMaskName(item.name)}</span><strong>${item.count}회</strong></li>`).join("") || "<li>아직 조건을 만족한 이용자가 없습니다.</li>"}</ol></div><div class="mt-3 flex gap-3 text-xs font-bold"><button data-tv-attendance-edit="${id}" class="text-indigo-600">수정</button><button data-tv-attendance-delete="${id}" class="text-rose-600">삭제</button></div></article>`; }).join("") || "<p class='text-sm text-slate-500'>아직 등록된 출석 이벤트가 없습니다.</p>"; root.querySelectorAll("[data-tv-attendance-edit]").forEach((b) => b.addEventListener("click", () => tvEditAttendanceEvent(b.dataset.tvAttendanceEdit))); root.querySelectorAll("[data-tv-attendance-delete]").forEach((b) => b.addEventListener("click", () => { if (confirm("이 출석 이벤트를 삭제할까요?")) tvContentRef("attendanceEvents").child(b.dataset.tvAttendanceDelete).remove().then(() => tvLoadContentEditors()); })); }
function tvEditAttendanceEvent(id) { tvContentRef("attendanceEvents").child(id || "").once("value").then((snapshot) => { const old = snapshot.val() || {}; const type = prompt("이벤트 종류: visit(방문) 또는 ar(AR)", old.type || "visit"); if (!type || !["visit", "ar"].includes(type)) return; const title = prompt("이벤트 이름", old.title || ""); if (!title) return; const startDate = prompt("시작일 (YYYY-MM-DD)", old.startDate || formatLocalDate()); const endDate = prompt("종료일 (YYYY-MM-DD)", old.endDate || ""); const criteriaCount = Number(prompt("당첨 기준 횟수", old.criteriaCount || (type === "ar" ? 3 : 5))) || 1; const winnerCount = Number(prompt("당첨 인원", old.winnerCount || 10)) || 0; const description = prompt("안내 문구 (선택)", old.description || ""); const key = id || tvContentRef("attendanceEvents").push().key; return tvContentRef("attendanceEvents").child(key).set({ ...old, type, title, startDate, endDate, criteriaCount, criteriaLabel: `${criteriaCount}회 이상`, winnerCount, description, enabled: true, createdAt: old.createdAt || firebase.database.ServerValue.TIMESTAMP }); }).then(() => tvLoadContentEditors()).catch((error) => { logError("tv.attendanceEvent", error); showMessage("출석 이벤트를 저장하지 못했습니다."); }); }
function tvRenderContent(type, items) {
    const root = document.getElementById("tv-" + type + "-editor");
    if (!root) return;
    const list = Object.entries(items).sort((a,b) => (a[1].order || 0) - (b[1].order || 0));
    root.innerHTML = list.map(([id, item]) => {
        if (type === "photos") return `<div draggable="true" data-photo="${id}" class="relative"><img src="${tvEscape(item.url)}" class="h-20 w-full object-cover rounded"><button type="button" data-tv-content-delete="${type}:${id}" class="absolute top-1 right-1 bg-white text-red-600 rounded px-1">×</button></div>`;
        const hasImage = Boolean(item.image || item.imageUrl || item.url);
        return `<div class="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-sm"><div class="flex gap-3">${hasImage ? `<img src="${tvEscape(item.image || item.imageUrl || item.url)}" alt="" class="h-16 w-20 flex-none rounded-lg object-cover bg-slate-200">` : ""}<div class="min-w-0 flex-1"><b class="block truncate text-slate-800">${tvEscape(item.title)}</b><div class="mt-1 text-xs text-slate-500">${tvEscape(item.startDate || "")} ~ ${tvEscape(item.endDate || "계속 표시")}</div>${hasImage ? "<div class='mt-1 text-xs font-bold text-indigo-600'>이미지 공지: TV 전체 화면 표시</div>" : ""}</div></div><div class="mt-3 flex gap-3 text-xs font-bold"><button type="button" data-tv-content-edit="${type}:${id}" class="text-indigo-600">수정</button><button type="button" data-tv-content-delete="${type}:${id}" class="text-rose-600">삭제</button></div></div>`;
    }).join("") || "<p class='text-sm text-slate-400'>등록된 항목이 없습니다.</p>";
    root.querySelectorAll("[data-tv-content-edit]").forEach((button) => button.addEventListener("click", () => tvEditContent(...button.dataset.tvContentEdit.split(":"))));
    root.querySelectorAll("[data-tv-content-delete]").forEach((button) => button.addEventListener("click", () => {
        const [contentType, contentId] = button.dataset.tvContentDelete.split(":");
        if (confirm("이 항목을 삭제할까요?")) tvContentRef(contentType).child(contentId).remove().then(() => tvLoadContentEditors()).catch((error) => { logError("tv.content.delete", error); showMessage("항목을 삭제하지 못했습니다."); });
    }));
}
function tvEditContent(type, id) {
    tvContentRef(type).child(id || "").once("value").then((snapshot) => {
        const old = snapshot.val() || {};
        const title = prompt(type === "events" ? "이벤트 제목" : "공지 제목", old.title || "");
        if (!title) return null;
        const description = prompt(type === "notices" ? "텍스트 공지 내용 (이미지 공지는 비워도 됩니다)" : "설명", old.description || "");
        const startDate = prompt("시작일 (YYYY-MM-DD)", old.startDate || formatLocalDate());
        const endDate = prompt("종료일 (YYYY-MM-DD, 비워두면 계속 표시)", old.endDate || "");
        const priority = Number(prompt("우선순위 (높을수록 먼저 표시)", old.priority || 0)) || 0;
        const emergency = type === "notices" ? confirm("긴급 공지로 표시할까요?") : Boolean(old.emergency);
        const image = type === "events" || type === "notices" ? prompt("이미지 URL (선택)", old.image || old.imageUrl || old.url || "") : "";
        const key = id || tvContentRef(type).push().key;
        return tvContentRef(type).child(key).set({ ...old, title, description, startDate, endDate, priority, emergency, image, enabled: true, createdAt: old.createdAt || firebase.database.ServerValue.TIMESTAMP });
    }).then((result) => {
        if (result !== null) tvLoadContentEditors();
    }).catch((error) => {
        logError("tv.content.edit", error);
        showMessage("항목을 저장하지 못했습니다: " + (error.code || "알 수 없는 오류"));
    });
}
async function tvUploadNoticeImage(file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
        showMessage("10MB 이하의 JPG, PNG, WEBP 이미지 파일을 선택해 주세요.");
        return;
    }
    if (!firebase.storage) {
        showMessage("공지 이미지 저장 기능을 사용할 수 없습니다. Firebase Storage 설정을 확인해 주세요.");
        return;
    }
    try {
        const user = await tvRequireAdminSession("공지 이미지 업로드");
        if (!user) return;
    } catch (error) {
        logError("tv.notice.upload.auth", error);
        showMessage("공지 이미지 업로드 실패: 관리자 인증을 갱신하지 못했습니다.");
        return;
    }
    const progress = document.getElementById("tv-notice-upload-progress");
    const noticeUpload = document.getElementById("tv-notice-image-upload");
    const safeName = file.name.replace(/[^\w.-]/g, "_");
    const path = "tv/notices/" + Date.now() + "-" + safeName;
    const storageRef = firebase.storage().ref(path);
    const task = storageRef.put(file, { contentType: file.type });
    let lastTransferred = 0;
    const stallNoticeTimer = window.setTimeout(() => {
        if (lastTransferred === 0 && progress) progress.textContent = "업로드가 시작되지 않았습니다. Firebase Storage 권한 또는 네트워크를 확인해 주세요.";
    }, 15000);
    const stallCancelTimer = window.setTimeout(() => {
        if (lastTransferred === 0) {
            task.cancel();
            if (progress) progress.textContent = "업로드가 중단되었습니다. Firebase Storage Rules를 확인한 뒤 다시 시도해 주세요.";
        }
    }, 45000);
    task.on("state_changed", (snapshot) => {
        lastTransferred = snapshot.bytesTransferred;
        if (progress) {
            progress.textContent = snapshot.bytesTransferred > 0
                ? "공지 이미지 업로드 중... " + Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100) + "%"
                : "공지 이미지 업로드 준비 중입니다...";
        }
    }, (error) => {
        window.clearTimeout(stallNoticeTimer);
        window.clearTimeout(stallCancelTimer);
        logError("tv.notice.upload", error);
        if (progress) progress.textContent = "공지 이미지 업로드에 실패했습니다.";
        if (noticeUpload) noticeUpload.value = "";
        showMessage("공지 이미지 업로드 실패: " + tvUploadErrorMessage(error));
    }, () => task.snapshot.ref.getDownloadURL().then((url) => {
        window.clearTimeout(stallNoticeTimer);
        window.clearTimeout(stallCancelTimer);
        const title = file.name.replace(/\.[^.]+$/, "") || "이미지 공지";
        return tvContentRef("notices").push({
            title,
            description: "",
            image: url,
            imagePath: path,
            startDate: formatLocalDate(),
            endDate: "",
            priority: Date.now(),
            emergency: false,
            enabled: true,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });
    }).then(() => {
        if (progress) progress.textContent = "공지 이미지가 등록되었습니다.";
        if (noticeUpload) noticeUpload.value = "";
        tvContentRef("notices").once("value").then((snapshot) => tvRenderContent("notices", snapshot.val() || {}));
    }).catch((error) => {
        window.clearTimeout(stallNoticeTimer);
        window.clearTimeout(stallCancelTimer);
        logError("tv.notice.upload.save", error);
        showMessage("업로드한 공지 이미지 주소를 저장하지 못했습니다: " + ((error && error.code) || "알 수 없는 오류"));
    }));
}
function tvUploadPhotos(files) {
    const validFiles = files.filter((file) => file && file.type.startsWith("image/") && file.size <= 10 * 1024 * 1024);
    if (!validFiles.length) { showMessage("10MB 이하의 JPG, PNG, WEBP 이미지 파일을 선택해 주세요."); return; }
    if (validFiles.length !== files.length) showMessage("이미지 파일만 업로드됩니다. 10MB를 넘는 파일은 제외했습니다.", "info");
    if (!firebase.storage) { showMessage("사진 저장 기능을 사용할 수 없습니다. Firebase Storage 설정을 확인해 주세요."); return; }
    const progress = document.getElementById("tv-upload-progress");
    validFiles.forEach((file, index) => {
        const path = "tv/photos/" + Date.now() + "-" + index + "-" + file.name.replace(/[^\w.-]/g, "_");
        const task = firebase.storage().ref(path).put(file);
        task.on("state_changed", (snapshot) => {
            if (progress) progress.textContent = `사진 ${index + 1}/${validFiles.length} 업로드 중… ${Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100)}%`;
        }, (error) => {
            logError("tv.upload", error);
            if (progress) progress.textContent = "사진 업로드에 실패했습니다. 다시 시도해 주세요.";
            showMessage("사진 업로드에 실패했습니다: " + (error.code || "알 수 없는 오류"));
        }, () => task.snapshot.ref.getDownloadURL().then((url) => tvContentRef("photos").push({ url, path, order: Date.now(), createdAt: firebase.database.ServerValue.TIMESTAMP })).then(() => {
            if (progress) progress.textContent = `사진 ${index + 1}/${validFiles.length} 업로드 완료`;
            tvContentRef("photos").once("value").then((snapshot) => tvRenderContent("photos", snapshot.val() || {}));
        }).catch((error) => { logError("tv.upload.url", error); showMessage("업로드한 사진 주소를 저장하지 못했습니다."); }));
    });
}
function tvRenderStatus() { const card = document.getElementById("tv-status-card"); if (!card) return; db.ref("tvStatus").once("value").then((s) => { const v = s.val() || {}; card.innerHTML = `<b class="text-slate-800">${v.online ? "● 온라인" : "● 오프라인"}</b><br>마지막 동기화: ${v.lastSync ? new Date(v.lastSync).toLocaleString("ko-KR") : "아직 없음"}<br>현재 화면: ${tvEscape(v.currentSlide || "-")}<br>재생목록: ${(tvAdminSettings.slides || []).filter((x) => x.enabled).length}개 화면`; }); }
function loadTvSettings() {
    // The management shell must never depend on Firebase responding. Render
    // defaults first, then replace them when the realtime snapshot arrives.
    if (!tvAdminSettings) {
        tvAdminSettings = tvMerge(TV_DEFAULTS, {});
        renderTvManagement();
    }

    if (tvAdminSettingsListener) return;
    tvAdminSettingsListener = db.ref("tvSettings");
    tvAdminSettingsListener.on("value", (snap) => {
        if (tvAdminDirty) return;
        tvAdminSettings = tvMerge(TV_DEFAULTS, snap.val() || {});
        if (!tvPanel().classList.contains("hidden")) renderTvManagement();
    }, (error) => {
        logError("tv.settings.load", error);
        // Defaults are already rendered; leave the UI usable for a retry/save.
        showMessage("TV 설정을 불러오지 못했습니다. 기본 설정을 표시합니다.", "info");
    });
}
window.addEventListener("beforeunload", (e) => { if (tvAdminDirty) { e.preventDefault(); e.returnValue = ""; } });
