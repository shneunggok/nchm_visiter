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

function tvMerge(base, value) {
    const result = Array.isArray(base) ? base.slice() : { ...base };
    Object.keys(value || {}).forEach((key) => {
        result[key] = value[key] && typeof value[key] === "object" && !Array.isArray(value[key]) && base[key] ? tvMerge(base[key], value[key]) : value[key];
    });
    return result;
}
function tvEscape(value) { return escapeHtml(value == null ? "" : value); }
function tvPanel() { return document.getElementById("admin-tv-settings"); }
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
    s.visitors.maximum = Number(document.getElementById("tv-visitors-maximum").value) || 0;
    s.visitors.order = document.getElementById("tv-visitors-order").value;
    s.visitors.showSchool = document.getElementById("tv-show-school").checked;
    s.visitors.showNickname = document.getElementById("tv-show-nickname").checked;
    s.ranking.limit = Number(document.getElementById("tv-ranking-limit").value);
    s.ranking.period = document.getElementById("tv-ranking-period").value;
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
      <div class="bg-white rounded-[32px] p-6 sm:p-8 border border-slate-200 card-shadow space-y-7">
        <div class="flex flex-wrap justify-between items-start gap-4"><div><h2 class="text-xl font-bold text-slate-800">TV 디스플레이 설정</h2><p class="mt-2 text-sm text-slate-500">저장 즉시 모든 TV에 실시간 반영됩니다.</p></div><div class="flex gap-2"><span id="tv-unsaved" class="${tvAdminDirty ? "" : "hidden"} text-amber-600 text-sm font-bold">저장되지 않은 변경</span><button type="button" data-tv-action="preview" class="bg-indigo-600 text-white font-bold px-4 py-2 rounded-xl">미리보기</button><button type="button" data-tv-action="save" class="bg-slate-800 text-white font-bold px-4 py-2 rounded-xl">저장</button></div></div>
        <div class="flex flex-wrap gap-2 border-b pb-4 text-sm font-bold" id="tv-tabs">
          ${["slides:슬라이드", "content:콘텐츠", "appearance:화면", "operation:운영", "status:상태"].map((x, i) => { const [id, label] = x.split(":"); return `<button type="button" data-tv-tab="${id}" class="px-3 py-2 rounded-lg ${i ? "text-slate-500" : "bg-slate-100 text-slate-800"}">${label}</button>`; }).join("")}
        </div>
        <div id="tv-tab-slides" class="tv-tab space-y-3"><p class="text-sm text-slate-500">끌어서 순서를 바꾸고, 각 화면의 노출 여부와 시간을 정하세요.</p><div id="tv-slide-list" class="space-y-2">${s.slides.map((slide) => `<div draggable="true" data-tv-slide="${slide.id}" class="choice-btn rounded-2xl p-4 flex flex-wrap items-center gap-3"><span class="cursor-move text-slate-400">⋮⋮</span><b class="flex-1">${TV_LABELS[slide.id] || tvEscape(slide.id)}</b><label class="text-sm">노출 <input type="checkbox" ${slide.enabled ? "checked" : ""}></label><select class="border rounded-lg p-2 text-sm">${[5,8,10,15,20,30].map((n) => `<option value="${n}" ${slide.duration === n ? "selected" : ""}>${n}초</option>`).join("")}</select><button type="button" data-tv-duplicate="${slide.id}" class="text-indigo-600 text-sm">복제</button><button type="button" data-tv-delete="${slide.id}" class="text-red-500 text-sm">삭제</button></div>`).join("")}</div></div>
        <div id="tv-tab-content" class="tv-tab hidden space-y-6">
          <div class="grid sm:grid-cols-2 gap-4"><section class="rounded-2xl bg-slate-50 p-4 space-y-2"><h3 class="font-bold">환영 화면</h3><input id="tv-welcome-title" value="${tvEscape(s.welcome.title)}" class="w-full p-2 rounded border" placeholder="제목"><input id="tv-welcome-subtitle" value="${tvEscape(s.welcome.subtitle)}" class="w-full p-2 rounded border" placeholder="부제목"><textarea id="tv-welcome-description" class="w-full p-2 rounded border" placeholder="설명">${tvEscape(s.welcome.description)}</textarea><input id="tv-welcome-logo" value="${tvEscape(s.welcome.logo)}" class="w-full p-2 rounded border" placeholder="로고 이미지 URL"></section>
          <section class="rounded-2xl bg-slate-50 p-4 space-y-2"><h3 class="font-bold">방문자 · 출석왕</h3><label class="block text-sm">최대 표시 인원 <input id="tv-visitors-maximum" type="number" min="0" value="${s.visitors.maximum}" class="ml-2 p-2 rounded border w-20"></label><select id="tv-visitors-order" class="p-2 rounded border"><option value="count">인원순</option><option value="recent">최근순</option></select><label class="block text-sm"><input id="tv-show-school" type="checkbox" ${s.visitors.showSchool ? "checked" : ""}> 학교 표시</label><label class="block text-sm"><input id="tv-show-nickname" type="checkbox" ${s.visitors.showNickname ? "checked" : ""}> 닉네임 표시</label><select id="tv-ranking-limit" class="p-2 rounded border">${[3,5,10].map((n) => `<option value="${n}" ${s.ranking.limit === n ? "selected" : ""}>상위 ${n}명</option>`).join("")}</select><select id="tv-ranking-period" class="p-2 rounded border">${["daily:일간","monthly:월간","yearly:연간","all:전체"].map((x) => { const [v,l]=x.split(":"); return `<option value="${v}" ${s.ranking.period === v ? "selected" : ""}>${l}</option>`; }).join("")}</select></section></div>
          <div class="grid sm:grid-cols-3 gap-4"><section class="rounded-2xl bg-slate-50 p-4"><h3 class="font-bold mb-3">이벤트</h3><div id="tv-events-editor"></div><button type="button" data-tv-content-add="events" class="mt-3 text-indigo-600 font-bold">+ 이벤트 추가</button></section><section class="rounded-2xl bg-slate-50 p-4"><h3 class="font-bold mb-3">공지사항</h3><div id="tv-notices-editor"></div><button type="button" data-tv-content-add="notices" class="mt-3 text-indigo-600 font-bold">+ 공지 추가</button></section><section class="rounded-2xl bg-slate-50 p-4"><h3 class="font-bold mb-3">사진</h3><input id="tv-photo-upload" type="file" accept="image/*" multiple class="text-sm"><div id="tv-upload-progress" class="text-xs text-slate-500 mt-2"></div><div id="tv-photos-editor" class="grid grid-cols-2 gap-2 mt-3"></div></section></div>
        </div>
        <div id="tv-tab-appearance" class="tv-tab hidden grid sm:grid-cols-2 gap-5"><section class="space-y-3"><h3 class="font-bold">테마 · 배경</h3><select id="tv-theme" class="p-2 border rounded"><option value="light" ${s.theme === "light" ? "selected" : ""}>라이트</option><option value="dark" ${s.theme === "dark" ? "selected" : ""}>다크</option><option value="blue" ${s.theme === "blue" ? "selected" : ""}>블루</option></select><label class="block">색상 <input id="tv-bg-color" type="color" value="${tvEscape(s.background.color)}"></label><input id="tv-bg-image" value="${tvEscape(s.background.image)}" class="w-full p-2 border rounded" placeholder="배경 이미지 URL"><input id="tv-bg-video" value="${tvEscape(s.background.video)}" class="w-full p-2 border rounded" placeholder="향후 비디오 URL"></section><section class="space-y-3"><h3 class="font-bold">자동 저장</h3><label><input id="tv-auto-save" type="checkbox" ${s.autoSave ? "checked" : ""}> 변경 후 자동 저장</label><button type="button" data-tv-action="reset" class="block text-red-600 font-bold">기본 설정으로 재설정</button></section></div>
        <div id="tv-tab-operation" class="tv-tab hidden space-y-4"><h3 class="font-bold">운영 시간</h3><label>시작 <input id="tv-open" type="time" value="${s.operatingHours.open}" class="p-2 border rounded"></label><label>종료 <input id="tv-close" type="time" value="${s.operatingHours.close}" class="p-2 border rounded"></label><label><input id="tv-holiday" type="checkbox" ${s.operatingHours.holidayMode ? "checked" : ""}> 휴일 모드 (자동 휴무 화면)</label></div>
        <div id="tv-tab-status" class="tv-tab hidden"><div id="tv-status-card" class="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">상태를 불러오는 중입니다.</div></div>
      </div>`;
    tvBindManagement();
    tvLoadContentEditors();
}
function tvBindManagement() {
    tvPanel().querySelectorAll("input,select,textarea").forEach((el) => el.addEventListener("change", tvMarkDirty));
    tvPanel().querySelectorAll("[data-tv-tab]").forEach((btn) => btn.addEventListener("click", () => { tvPanel().querySelectorAll(".tv-tab").forEach((el) => el.classList.add("hidden")); document.getElementById("tv-tab-" + btn.dataset.tvTab).classList.remove("hidden"); }));
    tvPanel().querySelector("[data-tv-action=save]").addEventListener("click", saveTvSettings);
    tvPanel().querySelector("[data-tv-action=preview]").addEventListener("click", openTvPreview);
    tvPanel().querySelector("[data-tv-action=reset]").addEventListener("click", () => { if (confirm("TV 설정을 기본값으로 되돌릴까요?")) { tvAdminSettings = structuredClone(TV_DEFAULTS); tvMarkDirty(); renderTvManagement(); } });
    tvPanel().querySelectorAll("[data-tv-duplicate]").forEach((b) => b.addEventListener("click", () => { const source = tvAdminSettings.slides.find((s) => s.id === b.dataset.tvDuplicate); tvAdminSettings.slides.push({ ...source, id: source.id + "-" + Date.now() }); tvMarkDirty(); renderTvManagement(); }));
    tvPanel().querySelectorAll("[data-tv-delete]").forEach((b) => b.addEventListener("click", () => { if (tvAdminSettings.slides.length > 1) { tvAdminSettings.slides = tvAdminSettings.slides.filter((s) => s.id !== b.dataset.tvDelete); tvMarkDirty(); renderTvManagement(); } }));
    let dragged; tvPanel().querySelectorAll("[data-tv-slide]").forEach((row) => { row.addEventListener("dragstart", () => dragged = row); row.addEventListener("dragover", (e) => e.preventDefault()); row.addEventListener("drop", () => { if (dragged !== row) { row.parentNode.insertBefore(dragged, row); tvAdminSettings.slides = [...row.parentNode.children].map((el) => tvAdminSettings.slides.find((s) => s.id === el.dataset.tvSlide)); tvMarkDirty(); } }); });
    document.getElementById("tv-photo-upload")?.addEventListener("change", (e) => tvUploadPhotos([...e.target.files]));
}
async function saveTvSettings() {
    try {
        tvReadForm();
    } catch (error) {
        logError("tv.save.form", error);
        showMessage("TV 설정 데이터 오류: " + (error.message || "unknown"));
        return null;
    }

    const user = auth.currentUser;
    if (!user) {
        showMessage("TV 설정 저장 실패: 관리자 로그인 세션이 없습니다. 다시 로그인해 주세요.");
        return null;
    }

    try {
        // A stale anonymous token is the only client-side state that can make
        // an otherwise valid administrator session fail the email-based rule.
        await user.getIdToken(true);
        const token = await user.getIdTokenResult();
        if (token.claims.email !== ADMIN_EMAIL) {
            showMessage("TV 설정 저장 실패: 관리자 계정으로 다시 로그인해 주세요.");
            return null;
        }

        await db.ref("tvSettings").set({ ...tvAdminSettings, updatedAt: firebase.database.ServerValue.TIMESTAMP });
        tvAdminDirty = false;
        document.getElementById("tv-unsaved")?.classList.add("hidden");
        showMessage("TV 설정이 저장되어 모든 화면에 반영되었습니다.", "success");
    } catch (error) {
        logError("tv.save", error);
        const detail = error && (error.code || error.message) ? (error.code || error.message) : "unknown_error";
        showMessage("TV 설정 저장 실패: " + detail);
        return null;
    }
}
function openTvPreview() { window.open("./tv.html?preview=1", "nchm-tv-preview", "width=1280,height=720,menubar=no,toolbar=no"); }
function tvContentRef(type) { return db.ref("tvContent/" + type); }
function tvLoadContentEditors() { ["events","notices","photos"].forEach((type) => tvContentRef(type).once("value").then((s) => tvRenderContent(type, s.val() || {}))); tvRenderStatus(); document.querySelectorAll("[data-tv-content-add]").forEach((b) => b.addEventListener("click", () => tvEditContent(b.dataset.tvContentAdd))); }
function tvRenderContent(type, items) { const root = document.getElementById("tv-" + type + "-editor"); if (!root) return; const list = Object.entries(items).sort((a,b) => (a[1].order || 0) - (b[1].order || 0)); root.innerHTML = list.map(([id, item]) => type === "photos" ? `<div draggable="true" data-photo="${id}" class="relative"><img src="${tvEscape(item.url)}" class="h-20 w-full object-cover rounded"><button data-tv-content-delete="${type}:${id}" class="absolute top-1 right-1 bg-white text-red-600 rounded px-1">×</button></div>` : `<div class="border-b py-2 text-sm"><b>${tvEscape(item.title)}</b><div class="text-slate-500">${tvEscape(item.startDate || "")} ~ ${tvEscape(item.endDate || "")}</div><button data-tv-content-edit="${type}:${id}" class="text-indigo-600">수정</button> <button data-tv-content-delete="${type}:${id}" class="text-red-500">삭제</button></div>`).join("") || "<p class='text-sm text-slate-400'>등록된 항목이 없습니다.</p>"; root.querySelectorAll("[data-tv-content-edit]").forEach((b) => b.addEventListener("click", () => tvEditContent(...b.dataset.tvContentEdit.split(":")))); root.querySelectorAll("[data-tv-content-delete]").forEach((b) => b.addEventListener("click", () => { const [t,id]=b.dataset.tvContentDelete.split(":"); tvContentRef(t).child(id).remove(); })); }
function tvEditContent(type, id) { tvContentRef(type).child(id || "").once("value").then((s) => { const old = s.val() || {}; const title = prompt(type === "events" ? "이벤트 제목" : "공지 제목", old.title || ""); if (!title) return; const description = prompt("설명", old.description || ""); const startDate = prompt("시작일 (YYYY-MM-DD)", old.startDate || formatLocalDate()); const endDate = prompt("종료일 (YYYY-MM-DD, 비워두면 계속 표시)", old.endDate || ""); const priority = Number(prompt("우선순위 (높을수록 먼저 표시)", old.priority || 0)) || 0; const emergency = type === "notices" && confirm("긴급 공지로 표시할까요?"); const image = type === "events" ? prompt("이미지 URL (선택)", old.image || "") : ""; const key = id || tvContentRef(type).push().key; tvContentRef(type).child(key).set({ ...old, title, description, startDate, endDate, priority, emergency, image, enabled: true, createdAt: old.createdAt || firebase.database.ServerValue.TIMESTAMP }); }); }
function tvUploadPhotos(files) { if (!files.length) return; if (!firebase.storage) { showMessage("Firebase Storage를 사용할 수 없습니다."); return; } const progress = document.getElementById("tv-upload-progress"); files.forEach((file, index) => { const path = "tv/photos/" + Date.now() + "-" + index + "-" + file.name.replace(/[^\w.-]/g, "_"); const task = firebase.storage().ref(path).put(file); task.on("state_changed", (s) => progress.textContent = `업로드 ${index + 1}/${files.length}: ${Math.round(s.bytesTransferred / s.totalBytes * 100)}%`, (e) => { logError("tv.upload", e); showMessage("사진 업로드에 실패했습니다."); }, () => task.snapshot.ref.getDownloadURL().then((url) => tvContentRef("photos").push({ url, path, order: Date.now(), createdAt: firebase.database.ServerValue.TIMESTAMP }))); }); }
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
