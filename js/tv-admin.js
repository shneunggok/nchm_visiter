/* TV administrator: all editable TV data is kept in Firebase RTDB. */
const TV_DEFAULTS = {
    autoSave: true,
    theme: "dark",
    background: { color: "#0B1220", image: "", video: "", preset: "" },
    welcome: { title: "시흥시능곡청소년문화의집", subtitle: "청소년의 꿈이 자라는 공간", description: "", logo: "" },
    visitors: { maximum: 0, showSchool: false, showNickname: false, order: "count" },
    ranking: { limit: 5, period: "monthly" },
    ar: { showCurrentReservation: true, showCurrentUsage: true, showWaitingQueue: true, showTodayCount: true },
    slides: [
        { id: "welcome", enabled: true, duration: 8 },
        { id: "visitors", enabled: true, duration: 8 },
        { id: "attendanceVisit", name: "방문 이벤트 순위", enabled: true, duration: 15 },
        { id: "attendanceAr", name: "AR 이벤트 순위", enabled: true, duration: 15 },
        { id: "ar", enabled: true, duration: 8 },
        { id: "events", enabled: true, duration: 8 },
        { id: "notices", enabled: true, duration: 8 }
    ]
};
const TV_LABELS = { welcome: "환영 화면", visitors: "오늘의 방문자", attendanceVisit: "방문 이벤트 순위", attendanceAr: "AR 이벤트 순위", ar: "AR 현황", events: "이벤트", notices: "공지사항" };
let tvAdminSettings = null;
let tvAdminDirty = false;
let tvAdminSaveTimer = null;
let tvAdminSettingsListener = null;
let tvAdminSaving = false;
let tvAdminRevision = 0;
let tvAdminAttemptedRevision = -1;
let tvAdminSaveState = "saved";
const tvAdminOperationLocks = new Set();
const TV_CLOUD_PENDING_KEY = "nchm.tv.cloudinary.pending.v1";
const tvAdminContentFilters = { notices: "all", events: "all", attendance: "all" };
const tvAdminContentCache = { notices: {}, events: {}, attendance: {} };
let tvNoticeSelectedFile = null;
let tvNoticePreviewUrl = "";
let tvNoticeUploading = false;
let tvAdminEditorModal = null;

function tvMerge(base, value) {
    const result = Array.isArray(base) ? base.slice() : { ...base };
    Object.keys(value || {}).forEach((key) => {
        result[key] = value[key] && typeof value[key] === "object" && !Array.isArray(value[key]) && base[key] ? tvMerge(base[key], value[key]) : value[key];
    });
    return result;
}
function tvNormalizeSlides(settings) {
    if (!settings) return [];
    if (!Array.isArray(settings.slides)) settings.slides = [];
    return settings.slides;
}
function tvEscape(value) { return escapeHtml(value == null ? "" : value); }
function tvPanel() { return document.getElementById("admin-tv-settings"); }
function tvButton(label, action, classes) { return `<button type="button" data-tv-action="${action}" class="${classes}">${label}</button>`; }
function tvField(label, input, help) { return `<label class="block space-y-1.5"><span class="block text-sm font-bold text-slate-700">${label}</span>${input}${help ? `<span class="block text-xs leading-5 text-slate-500">${help}</span>` : ""}</label>`; }
function tvAcquireLock(key) {
    if (tvAdminOperationLocks.has(key)) return false;
    tvAdminOperationLocks.add(key);
    return true;
}
function tvReleaseLock(key) { tvAdminOperationLocks.delete(key); }
function tvReadCloudPending() {
    try {
        return JSON.parse(localStorage.getItem(TV_CLOUD_PENDING_KEY) || "{}") || {};
    } catch (error) {
        return {};
    }
}
function tvWriteCloudPending(value) {
    if (Object.keys(value || {}).length) localStorage.setItem(TV_CLOUD_PENDING_KEY, JSON.stringify(value));
    else localStorage.removeItem(TV_CLOUD_PENDING_KEY);
}
function tvRememberManualCloudCleanup(images, reason) {
    const pending = tvReadCloudPending();
    pending.cleanup = Array.isArray(pending.cleanup) ? pending.cleanup : [];
    images.filter((image) => image?.secure_url || image?.public_id).forEach((image) => {
        pending.cleanup.push({
            secure_url: image.secure_url || "",
            public_id: image.public_id || "",
            reason,
            createdAt: Date.now()
        });
    });
    pending.cleanup = pending.cleanup.slice(-100);
    tvWriteCloudPending(pending);
}
function tvSetSaveState(state, detail) {
    tvAdminSaveState = state;
    const badge = document.getElementById("tv-save-status");
    if (!badge) return;
    const labels = { dirty: "저장할 변경사항 있음", saving: "저장 중…", saved: "저장됨", error: "저장 실패 · 다시 시도" };
    badge.textContent = detail || labels[state] || state;
    badge.className = "tv-admin-save-state";
    badge.style.background = state === "error" ? "#fff1f2" : state === "saved" ? "#ecfdf5" : "#fffbeb";
    badge.style.color = state === "error" ? "#be123c" : state === "saved" ? "#047857" : "#92400e";
}
function tvScheduleAutoSave() {
    clearTimeout(tvAdminSaveTimer);
    if (!tvAdminSettings?.autoSave || !TVCommon.canAutoSaveRevision(tvAdminRevision, tvAdminAttemptedRevision)) return;
    tvAdminSaveTimer = setTimeout(() => saveTvSettings({ automatic: true }), 500);
}
function tvMarkDirty() {
    tvAdminDirty = true;
    tvAdminRevision += 1;
    tvSetSaveState("dirty");
    tvScheduleAutoSave();
}
function tvReadForm() {
    const s = tvAdminSettings;
    s.autoSave = document.getElementById("tv-auto-save").checked;
    s.theme = document.getElementById("tv-theme").value;
    s.background.color = document.getElementById("tv-bg-color").value;
    s.background.image = document.getElementById("tv-bg-image").value.trim();
    s.background.preset = document.getElementById("tv-bg-preset").value;
    s.welcome.title = document.getElementById("tv-welcome-title").value.trim();
    s.welcome.subtitle = document.getElementById("tv-welcome-subtitle").value.trim();
    s.welcome.logo = document.getElementById("tv-welcome-logo").value.trim();
    // 운영시간 설정은 더 이상 사용하지 않으며, 기존 RTDB 데이터도 다음 저장 시 정리한다.
    delete s.operatingHours;
    const originalSlides = tvNormalizeSlides(s);
    const duplicateSlides = originalSlides.filter((slide, index) => {
        const source = TVCommon.sourceId(slide);
        return !TVCommon.FIXED_SLIDE_IDS.includes(source) ||
            originalSlides.findIndex((candidate) => TVCommon.sourceId(candidate) === source) !== index;
    });
    const fixedSlides = [...document.querySelectorAll("[data-tv-slide]")].map((row) => ({
        id: row.dataset.tvSlide,
        name: TV_LABELS[row.dataset.tvSlide],
        enabled: row.querySelector("input[type=checkbox]").checked,
        duration: Number(row.querySelector("select").value)
    }));
    if (!fixedSlides.some((slide) => slide.enabled)) {
        fixedSlides.find((slide) => slide.id === "welcome").enabled = true;
        document.querySelector('[data-tv-slide="welcome"] input[type=checkbox]').checked = true;
        showMessage("모든 화면을 끌 수 없어 환영 화면을 유지했습니다.", "info");
    }
    s.slides = fixedSlides.concat(duplicateSlides);
}
function renderTvManagement() {
    const s = tvAdminSettings || TV_DEFAULTS;
    const fixedSlides = TVCommon.normalizeFixedSlides(tvNormalizeSlides(s), TV_DEFAULTS.slides);
    const pendingCloud = tvReadCloudPending();
    const pendingNotice = pendingCloud.notice;
    const cleanupItems = Array.isArray(pendingCloud.cleanup) ? pendingCloud.cleanup : [];
    const backgroundPresets = TVCommon.backgroundPresets();
    const selectedBackgroundPreset = s.background.preset ||
        backgroundPresets.find((preset) => preset.background.toLowerCase() === String(s.background.color || "").toLowerCase())?.id ||
        ({ dark: "midnight-mint", blue: "graphite-sky", light: "warm-ivory" }[s.theme] || "midnight-mint");
    const p = tvPanel();
    if (!p) return;
    // A settings refresh replaces the whole management panel. Close an open
    // editor first so its promise and page scroll lock cannot be orphaned.
    tvCloseEditorModal(null);
    p.innerHTML = `
      <div class="tv-admin-shell">
        <header class="tv-admin-header">
          <div><p class="tv-admin-eyebrow">DISPLAY OPERATIONS</p><h2 class="tv-admin-title">TV 관리</h2><p class="tv-admin-description">재생 순서와 화면 디자인은 상단의 ‘화면 설정 저장’으로 반영됩니다. 공지·행사·출석 이벤트는 각 콘텐츠의 등록 또는 수정 저장 버튼으로 별도 반영됩니다.</p></div>
          <div class="tv-admin-actions"><span id="tv-save-status" class="tv-admin-save-state">${tvAdminSaveState === "saved" ? "저장됨" : "저장할 변경사항 있음"}</span><button type="button" data-tv-action="preview" class="tv-admin-button">미리보기</button><button type="button" data-tv-action="save" class="tv-admin-button tv-admin-button--primary">화면 설정 저장</button></div>
        </header>
        <div class="tv-admin-layout">
          <nav class="tv-admin-nav" aria-label="TV 관리 메뉴">
            ${[
                ["overview", "●", "운영 상태"],
                ["slides", "↕", "재생 순서"],
                ["content", "▤", "콘텐츠 관리"],
                ["appearance", "◐", "화면 디자인"],
                ["other", "⋯", "기타 설정"]
            ].map(([id, icon, label], index) => `<button type="button" data-tv-tab="${id}" class="tv-admin-nav-button ${index === 0 ? "is-active" : ""}"><span class="tv-admin-nav-icon" aria-hidden="true">${icon}</span>${label}</button>`).join("")}
          </nav>
          <main class="tv-admin-content">
            <section id="tv-tab-overview" class="tv-admin-tab">
              <div class="tv-admin-section-header"><div><h3>운영 상태</h3><p>실제 TV 연결과 현재 노출 중인 콘텐츠를 한눈에 확인합니다.</p></div><button type="button" data-tv-action="refresh-status" class="tv-admin-button">상태 새로고침</button></div>
              <div id="tv-status-card" class="tv-admin-status-grid" aria-live="polite">
                <div class="tv-admin-stat tv-admin-stat--connection"><span>TV 연결</span><strong id="tv-status-online">확인 중</strong></div>
                <div class="tv-admin-stat"><span>마지막 동기화</span><strong id="tv-status-sync">-</strong></div>
                <div class="tv-admin-stat"><span>현재 화면</span><strong id="tv-status-slide">-</strong></div>
                <div class="tv-admin-stat"><span>진행 콘텐츠</span><strong id="tv-status-content-count">확인 중</strong></div>
              </div>
              <p class="tv-admin-overview-note">TV 상태는 이 화면에 들어오거나 ‘상태 새로고침’을 누를 때만 조회합니다! </p>
            </section>

            <section id="tv-tab-slides" class="tv-admin-tab" hidden>
              <div class="tv-admin-section-header"><div><h3>재생 순서</h3><p>고정 7개 화면의 순서, 표시 여부와 유지 시간을 관리합니다.</p></div></div>
              <div id="tv-slide-list" class="tv-admin-playlist">${fixedSlides.map((slide, index) => `<div draggable="true" data-tv-slide="${slide.id}" class="tv-admin-slide"><span class="tv-admin-drag" aria-hidden="true">⋮⋮</span><b class="tv-admin-slide-title">${index + 1}. ${tvEscape(TV_LABELS[slide.id])}</b><label class="tv-admin-slide-controls"><input type="checkbox" ${slide.enabled ? "checked" : ""}> 표시</label><label class="tv-admin-slide-controls"><select aria-label="${tvEscape(TV_LABELS[slide.id])} 유지 시간">${[5,8,10,15,20,30].map((n) => `<option value="${n}" ${Number(slide.duration) === n ? "selected" : ""}>${n}초</option>`).join("")}</select></label><span><button type="button" data-tv-move="up" class="tv-admin-icon-button" aria-label="${tvEscape(TV_LABELS[slide.id])} 위로 이동">↑</button><button type="button" data-tv-move="down" class="tv-admin-icon-button" aria-label="${tvEscape(TV_LABELS[slide.id])} 아래로 이동">↓</button></span></div>`).join("")}</div>
            </section>

            <section id="tv-tab-content" class="tv-admin-tab" hidden>
              <div class="tv-admin-section-header"><div><h3>콘텐츠 관리</h3><p>공지, 일반 행사, 출석 이벤트는 서로 독립적으로 저장됩니다.</p></div></div>
              <div class="tv-admin-content-groups">
                <section class="tv-admin-content-group"><div class="tv-admin-content-toolbar"><div><h4>📢 공지</h4><p>텍스트 공지와 전체 화면 이미지 공지를 관리합니다.</p></div><button type="button" data-tv-content-add="notices" class="tv-admin-button tv-admin-button--primary">공지 등록</button></div><div class="tv-admin-filters" data-tv-filters="notices"></div><label id="tv-notice-dropzone" class="tv-admin-upload"><span><b>이미지 공지 선택</b><br><small>1920 × 1080 권장 · JPG, PNG, WEBP · 최대 10MB</small></span><input id="tv-notice-image-upload" type="file" accept="image/*" class="sr-only"></label><div id="tv-notice-preview" class="hidden"><img alt="선택한 공지 이미지 미리보기"></div><button id="tv-notice-upload-button" type="button" ${pendingNotice ? "" : "disabled"} class="tv-admin-button tv-admin-button--primary">${pendingNotice ? "업로드된 이미지 등록 다시 시도" : "이미지 공지 등록"}</button><div id="tv-notice-upload-progress" class="tv-admin-item-meta" aria-live="polite">${pendingNotice ? "Cloudinary 업로드 완료 · Firebase 등록 대기 중" : ""}</div><div id="tv-notices-editor" class="tv-admin-list"></div></section>
                <section class="tv-admin-content-group"><div class="tv-admin-content-toolbar"><div><h4>🗓 일반 행사</h4><p>행사 안내와 여러 장의 이미지를 관리합니다.</p></div><button type="button" data-tv-content-add="events" class="tv-admin-button tv-admin-button--primary">행사 등록</button></div><div class="tv-admin-filters" data-tv-filters="events"></div><div id="tv-event-upload-progress" class="tv-admin-item-meta" aria-live="polite"></div><div id="tv-events-editor" class="tv-admin-list"></div></section>
                <section class="tv-admin-content-group"><div class="tv-admin-content-toolbar"><div><h4>🏆 출석 이벤트</h4><p>방문·AR 출석 기준과 결과 순위를 관리합니다.</p></div><button type="button" data-tv-attendance-add class="tv-admin-button tv-admin-button--primary">출석 이벤트 등록</button></div><div class="tv-admin-filters" data-tv-filters="attendance"></div><div id="tv-attendance-events-editor" class="tv-admin-list"></div></section>
              </div>
            </section>

            <section id="tv-tab-appearance" class="tv-admin-tab" hidden>
              <div class="tv-admin-section-header"><div><h3>화면 디자인</h3><p>어울리는 배경을 고르고 환영 문구만 입력하면 됩니다. 선택 결과는 미리보기와 실제 TV에 똑같이 표시됩니다.</p></div></div>
              <section class="tv-admin-design-step">
                <div class="tv-admin-step-heading"><span>1</span><div><h4>추천 배경 고르기</h4><p>색상 코드를 입력할 필요 없이 원하는 분위기를 선택하세요. 추천 배경을 고르면 기존 사진 배경은 해제됩니다.</p></div></div>
                <div class="tv-admin-background-grid" role="radiogroup" aria-label="추천 TV 배경">
                  ${backgroundPresets.map((preset) => `<button type="button" data-tv-background-preset="${preset.id}" class="tv-admin-background ${selectedBackgroundPreset === preset.id ? "is-active" : ""}" aria-pressed="${selectedBackgroundPreset === preset.id}"><span class="tv-admin-background-preview" style="background:${preset.preview}"><i style="background:${preset.accent}"></i></span><span class="tv-admin-background-copy"><strong>${tvEscape(preset.name)}</strong><small>${tvEscape(preset.description)}</small></span><span class="tv-admin-background-check" aria-hidden="true">✓</span></button>`).join("")}
                </div>
                <div id="tv-image-background-notice" class="tv-admin-design-notice" ${s.background.image ? "" : "hidden"}>
                  <span>현재 사진 배경이 설정되어 있어 추천 배경보다 사진이 우선 표시됩니다.</span>
                  <button type="button" data-tv-clear-bg-image class="tv-admin-button">사진 배경 사용 중지</button>
                </div>
                <input id="tv-theme" type="hidden" value="${tvEscape(s.theme)}">
                <input id="tv-bg-preset" type="hidden" value="${tvEscape(selectedBackgroundPreset)}">
              </section>
              <section class="tv-admin-design-step">
                <div class="tv-admin-step-heading"><span>2</span><div><h4>환영 문구 확인하기</h4><p>처음 보이는 환영 화면의 두 문장입니다.</p></div></div>
                <div class="tv-admin-form-grid">
                  <label class="tv-admin-field tv-admin-field--wide"><span>큰 제목 *</span><input id="tv-welcome-title" value="${tvEscape(s.welcome.title)}" required><small>예: 시흥시능곡청소년문화의집</small></label>
                  <label class="tv-admin-field tv-admin-field--wide"><span>제목 아래 문구 *</span><input id="tv-welcome-subtitle" value="${tvEscape(s.welcome.subtitle)}" required><small>예: 청소년의 꿈이 자라는 공간</small></label>
                </div>
              </section>
              <details class="tv-admin-advanced">
                <summary>고급 설정 <small>직접 색상·사진·로고를 지정할 때만 사용</small></summary>
                <div class="tv-admin-form-grid">
                  <label class="tv-admin-field"><span>직접 배경색</span><input id="tv-bg-color" type="color" value="${tvEscape(s.background.color)}"><small>색상을 직접 바꾸면 추천 배경 선택이 해제됩니다.</small></label>
                  <label class="tv-admin-field"><span>사진 배경 주소 <small>(선택)</small></span><input id="tv-bg-image" value="${tvEscape(s.background.image)}" placeholder="https://..."><small>사진을 사용하면 글자가 잘 보이도록 어두운 막이 자동 적용됩니다.</small></label>
                  <label class="tv-admin-field tv-admin-field--wide"><span>다른 로고 이미지 주소 <small>(선택)</small></span><input id="tv-welcome-logo" value="${tvEscape(s.welcome.logo)}" placeholder="https://..."><small>비워두면 현재 문화의집 로고를 그대로 사용합니다.</small></label>
                </div>
              </details>
            </section>

            <section id="tv-tab-other" class="tv-admin-tab" hidden>
              <div class="tv-admin-section-header"><div><h3>기타 설정</h3><p>자동 저장 범위와 초기화처럼 자주 사용하지 않는 설정입니다.</p></div></div>
              <div class="tv-admin-form-card">
                <label class="tv-admin-slide-controls"><input id="tv-auto-save" type="checkbox" ${s.autoSave ? "checked" : ""}> 재생 순서와 화면 디자인을 변경하면 자동 저장</label>
                <p class="tv-admin-description">공지·행사·출석 이벤트 등록에는 자동 저장이 적용되지 않습니다.</p>
                <div class="tv-admin-inline-actions" style="margin-top:18px"><button type="button" data-tv-action="reset" class="tv-admin-button tv-admin-button--danger">전체 화면 설정 초기화</button></div>
                <p class="tv-admin-description">홈페이지 관련 모든 문의는 choewonhyeog387@gmail.com</p>
                ${cleanupItems.length ? `<details class="tv-admin-item" style="margin-top:18px"><summary><b>Cloudinary 수동 정리 목록 ${cleanupItems.length}건</b></summary><ul class="tv-admin-item-meta">${cleanupItems.slice(-10).reverse().map((item) => `<li>${tvEscape(item.public_id || item.secure_url)} · ${tvEscape(item.reason)}</li>`).join("")}</ul><p class="tv-admin-item-meta">Cloudinary 콘솔에서 확인 후 직접 삭제하세요. 최근 100건만 보관됩니다.</p></details>` : ""}
              </div>
            </section>
          </main>
        </div>
      </div>
      <div id="tv-content-modal" class="tv-admin-modal" hidden></div>`;
    tvBindManagement();
    tvSetSaveState(tvAdminDirty ? tvAdminSaveState === "error" ? "error" : "dirty" : "saved");
    tvLoadContentEditors();
}
function tvBindManagement() {
    tvPanel().querySelectorAll("#tv-tab-slides input,#tv-tab-slides select,#tv-tab-appearance input,#tv-tab-appearance select,#tv-tab-appearance textarea,#tv-tab-other input").forEach((el) => el.addEventListener(el.matches("input[type=text], input:not([type]), textarea") ? "input" : "change", tvMarkDirty));
    tvPanel().querySelectorAll("[data-tv-tab]").forEach((btn) => btn.addEventListener("click", () => {
        tvPanel().querySelectorAll(".tv-admin-tab").forEach((el) => { el.hidden = true; });
        tvPanel().querySelectorAll("[data-tv-tab]").forEach((tab) => tab.classList.remove("is-active"));
        btn.classList.add("is-active");
        document.getElementById("tv-tab-" + btn.dataset.tvTab).hidden = false;
    }));
    tvPanel().querySelector("[data-tv-action=save]").addEventListener("click", () => saveTvSettings({ manual: true }));
    tvPanel().querySelector("[data-tv-action=preview]").addEventListener("click", openTvPreview);
    tvPanel().querySelector("[data-tv-action=refresh-status]")?.addEventListener("click", tvRenderStatus);
    tvPanel().querySelector("[data-tv-action=reset]").addEventListener("click", () => { if (confirm("TV 설정을 기본값으로 되돌릴까요?")) { tvAdminSettings = structuredClone(TV_DEFAULTS); tvMarkDirty(); renderTvManagement(); } });
    let dragged;
    tvPanel().querySelectorAll("[data-tv-slide]").forEach((row) => {
        row.addEventListener("dragstart", () => dragged = row);
        row.addEventListener("dragover", (event) => event.preventDefault());
        row.addEventListener("drop", () => {
            if (dragged !== row) {
                row.parentNode.insertBefore(dragged, row);
                tvMarkDirty();
                tvRefreshSlideNumbers();
            }
        });
    });
    tvPanel().querySelectorAll("[data-tv-move]").forEach((button) => button.addEventListener("click", () => {
        const row = button.closest("[data-tv-slide]");
        const sibling = button.dataset.tvMove === "up" ? row.previousElementSibling : row.nextElementSibling;
        if (!sibling) return;
        if (button.dataset.tvMove === "up") row.parentNode.insertBefore(row, sibling);
        else row.parentNode.insertBefore(sibling, row);
        tvMarkDirty();
        tvRefreshSlideNumbers();
    }));
    tvPanel().querySelectorAll("[data-tv-background-preset]").forEach((button) => button.addEventListener("click", () => {
        const preset = TVCommon.backgroundPreset(button.dataset.tvBackgroundPreset);
        if (!preset) return;
        document.getElementById("tv-theme").value = preset.theme;
        document.getElementById("tv-bg-preset").value = preset.id;
        document.getElementById("tv-bg-color").value = preset.background;
        document.getElementById("tv-bg-image").value = "";
        document.getElementById("tv-image-background-notice").hidden = true;
        tvPanel().querySelectorAll("[data-tv-background-preset]").forEach((item) => {
            const active = item === button;
            item.classList.toggle("is-active", active);
            item.setAttribute("aria-pressed", String(active));
        });
        tvMarkDirty();
    }));
    document.getElementById("tv-bg-color")?.addEventListener("input", () => {
        document.getElementById("tv-bg-preset").value = "";
        tvPanel().querySelectorAll("[data-tv-background-preset]").forEach((item) => {
            item.classList.remove("is-active");
            item.setAttribute("aria-pressed", "false");
        });
    });
    document.getElementById("tv-bg-image")?.addEventListener("input", (event) => {
        const notice = document.getElementById("tv-image-background-notice");
        if (!notice) return;
        notice.hidden = !event.target.value.trim();
    });
    tvPanel().querySelector("[data-tv-clear-bg-image]")?.addEventListener("click", () => {
        const imageInput = document.getElementById("tv-bg-image");
        const notice = document.getElementById("tv-image-background-notice");
        if (imageInput) imageInput.value = "";
        if (notice) notice.hidden = true;
        tvMarkDirty();
    });
    const noticeUpload = document.getElementById("tv-notice-image-upload");
    const noticeDropzone = document.getElementById("tv-notice-dropzone");
    noticeUpload?.addEventListener("change", (event) => tvSelectNoticeImage(event.target.files && event.target.files[0]));
    ["dragenter", "dragover"].forEach((eventName) => noticeDropzone?.addEventListener(eventName, (event) => { event.preventDefault(); noticeDropzone.classList.add("border-indigo-500", "bg-indigo-100"); }));
    ["dragleave", "drop"].forEach((eventName) => noticeDropzone?.addEventListener(eventName, (event) => { event.preventDefault(); noticeDropzone.classList.remove("border-indigo-500", "bg-indigo-100"); }));
    noticeDropzone?.addEventListener("drop", (event) => tvSelectNoticeImage(event.dataTransfer.files && event.dataTransfer.files[0]));
    document.getElementById("tv-notice-upload-button")?.addEventListener("click", tvUploadNoticeImage);
}
function tvRefreshSlideNumbers() {
    tvPanel()?.querySelectorAll("[data-tv-slide]").forEach((row, index) => {
        const title = row.querySelector(".tv-admin-slide-title");
        if (title) title.textContent = `${index + 1}. ${TV_LABELS[row.dataset.tvSlide]}`;
    });
}
async function saveTvSettings(options = {}) {
    if (tvAdminSaving) return null;
    try {
        tvReadForm();
    } catch (error) {
        logError("tv.save.form", error);
        showMessage("TV 설정 데이터 오류: " + (error.message || "unknown"));
        return null;
    }

    const saveRevision = tvAdminRevision;
    tvAdminAttemptedRevision = Math.max(tvAdminAttemptedRevision, saveRevision);
    tvAdminSaving = true;
    tvSetSaveState("saving");
    try {
        const user = await tvRequireAdminSession("TV 설정 저장");
        if (!user) {
            tvSetSaveState("error", "인증 필요 · 다시 시도");
            return null;
        }
        const saveButton = document.querySelector("[data-tv-action=save]");
        if (saveButton) { saveButton.disabled = true; saveButton.textContent = "저장 중..."; }

        await db.ref("tvSettings").set({ ...tvAdminSettings, updatedAt: firebase.database.ServerValue.TIMESTAMP });
        tvAdminDirty = tvAdminRevision !== saveRevision;
        tvSetSaveState(tvAdminDirty ? "dirty" : "saved");
        showMessage("TV 설정이 저장되어 모든 화면에 반영되었습니다.", "success");
        if (tvAdminDirty && tvAdminSettings.autoSave) tvScheduleAutoSave();
        return true;
    } catch (error) {
        logError("tv.save", error);
        const detail = error && (error.code || error.message) ? (error.code || error.message) : "unknown_error";
        showMessage("TV 설정 저장 실패: " + detail);
        tvSetSaveState("error");
        return null;
    } finally {
        tvAdminSaving = false;
        const saveButton = document.querySelector("[data-tv-action=save]");
        if (saveButton) { saveButton.disabled = false; saveButton.textContent = "화면 설정 저장"; }
        if (tvAdminDirty && TVCommon.canAutoSaveRevision(tvAdminRevision, tvAdminAttemptedRevision)) {
            tvScheduleAutoSave();
        }
    }
}
function openTvPreview() {
    try {
        tvReadForm();
        const notice = tvNoticePreviewUrl ? {
            type: "image",
            secure_url: tvNoticePreviewUrl,
            title: tvNoticeSelectedFile?.name || "미리보기 이미지",
            enabled: true,
            priority: Number.MAX_SAFE_INTEGER,
            startDate: formatLocalDate(),
            endDate: ""
        } : null;
        sessionStorage.setItem("nchm.tv.preview.v1", JSON.stringify({ settings: tvAdminSettings, notice }));
    } catch (error) {
        logError("tv.preview", error);
        showMessage("미리보기 설정을 준비하지 못했습니다.");
        return;
    }
    window.open("./tv.html?preview=1", "nchm-tv-preview", "width=1280,height=720,menubar=no,toolbar=no");
}
function tvContentRef(type) { return db.ref("tvContent/" + type); }
function tvRenderContentFilters(type) {
    const root = document.querySelector(`[data-tv-filters="${type}"]`);
    if (!root) return;
    const labels = { all: "전체", active: "진행 중", upcoming: "예정", ended: "종료" };
    root.innerHTML = Object.entries(labels).map(([value, label]) => `<button type="button" data-tv-filter="${value}" class="tv-admin-filter ${tvAdminContentFilters[type] === value ? "is-active" : ""}">${label}</button>`).join("");
    root.querySelectorAll("[data-tv-filter]").forEach((button) => button.addEventListener("click", () => {
        tvAdminContentFilters[type] = button.dataset.tvFilter;
        if (type === "attendance") tvRenderAttendanceEvents(tvAdminContentCache.attendance);
        else tvRenderContent(type, tvAdminContentCache[type]);
    }));
}
function tvMatchesAdminFilter(item, filter) {
    if (filter === "all") return true;
    return TVCommon.dateStatus(item, formatLocalDate()) === filter;
}
function tvUploadErrorMessage(error) {
    if (error && error.message) return error.message;
    return "Cloudinary 업로드 중 알 수 없는 오류가 발생했습니다.";
}

async function tvUploadToCloudinary(file, assetFolder) {
    const uploadFile = await tvPrepareUploadImage(file);
    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);
    formData.append("asset_folder", assetFolder);
    const response = await fetch(
        "https://api.cloudinary.com/v1_1/" + encodeURIComponent(CLOUDINARY_CONFIG.cloudName) + "/image/upload",
        { method: "POST", body: formData }
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.secure_url || !result.public_id) {
        throw new Error(result.error && result.error.message ? result.error.message : "Cloudinary 업로드에 실패했습니다.");
    }
    return result;
}
async function tvPrepareUploadImage(file) {
    if (!file || !file.type?.startsWith("image/") || typeof createImageBitmap !== "function") return file;
    let bitmap;
    try {
        bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 1920 / bitmap.width, 1080 / bitmap.height);
        if (scale === 1 && file.size <= 1024 * 1024 && file.type === "image/webp") return file;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
        if (!blob || blob.size >= file.size) return file;
        return new File([blob], String(file.name || "tv-image").replace(/\.[^.]+$/, "") + ".webp", {
            type: "image/webp",
            lastModified: file.lastModified || Date.now()
        });
    } catch (error) {
        logError("tv.image.optimize", error);
        return file;
    } finally {
        bitmap?.close?.();
    }
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
function tvLoadContentEditors() {
    ["events", "notices"].forEach((type) => {
        tvContentRef(type).once("value").then((snapshot) => {
            tvAdminContentCache[type] = snapshot.val() || {};
            tvRenderContent(type, tvAdminContentCache[type]);
            tvUpdateOverviewCounts();
        });
    });
    tvLoadAttendanceEventsEditor();
    tvRenderStatus();
    document.querySelectorAll("[data-tv-content-add]").forEach((button) => {
        button.onclick = () => tvEditContent(button.dataset.tvContentAdd, null, button);
    });
    const attendanceAddButton = document.querySelector("[data-tv-attendance-add]");
    if (attendanceAddButton) attendanceAddButton.onclick = () => tvEditAttendanceEvent(null, attendanceAddButton);
}
let tvAttendanceEditorRequestVersion = 0;
let tvAttendanceEditorItems = {};
const tvAttendanceResultCache = new Map();
const tvAttendanceResultLoads = new Set();
async function tvLoadAttendanceEventsEditor() {
    const requestVersion = ++tvAttendanceEditorRequestVersion;
    try {
        const snapshot = await tvContentRef("attendanceEvents").once("value");
        const items = snapshot.val() || {};
        if (requestVersion !== tvAttendanceEditorRequestVersion) return;
        Object.entries(items).forEach(([id, event]) => {
            const signature = JSON.stringify([event?.type, event?.startDate, event?.endDate, event?.criteriaCount]);
            const cached = tvAttendanceResultCache.get(id);
            if (cached?.signature === signature) {
                event.__logs = cached.logs;
                event.__truncated = cached.truncated;
            } else if (cached) {
                tvAttendanceResultCache.delete(id);
            }
        });
        tvAttendanceEditorItems = items;
        tvAdminContentCache.attendance = items;
        tvRenderAttendanceEvents(items);
        tvUpdateOverviewCounts();
        Object.entries(items).forEach(([id, event]) => {
            if (TVCommon.shouldAutoLoadAttendance(event, formatLocalDate()) && !event.__logs) {
                tvLoadAttendanceResult(id);
            }
        });
    } catch (error) {
        if (requestVersion !== tvAttendanceEditorRequestVersion) return;
        logError("tv.attendanceEvents.load", error);
        showMessage("출석 이벤트 현황을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
}
async function tvLoadAttendanceResult(id) {
    const event = tvAttendanceEditorItems[id];
    const lockKey = "attendance-result:" + id;
    if (!event || tvAttendanceResultLoads.has(id) || !tvAcquireLock(lockKey)) return;
    tvAttendanceResultLoads.add(id);
    tvRenderAttendanceEvents(tvAttendanceEditorItems);
    try {
        if (!["visit", "ar"].includes(event.type) || !isValidDateKey(event.startDate)) throw new Error("이벤트 날짜 또는 종류가 올바르지 않습니다.");
        const ref = event.type === "ar" ? arLogsRef : visitLogsRef;
        let query = ref.orderByChild("date").startAt(event.startDate);
        if (event.endDate && isValidDateKey(event.endDate)) query = query.endAt(event.endDate);
        const snapshot = await query.limitToLast(5001).once("value");
        const logs = [];
        snapshot.forEach((child) => {
            const value = child.val();
            if (value && typeof value === "object") logs.push({ _key: child.key, ...value });
        });
        event.__truncated = logs.length > 5000;
        event.__logs = event.__truncated ? logs.slice(-5000) : logs;
        tvAttendanceResultCache.set(id, {
            signature: JSON.stringify([event.type, event.startDate, event.endDate, event.criteriaCount]),
            logs: event.__logs,
            truncated: event.__truncated
        });
    } catch (error) {
        logError("tv.attendanceResult.load", error);
        showMessage("출석 결과를 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
        tvAttendanceResultLoads.delete(id);
        tvReleaseLock(lockKey);
        tvRenderAttendanceEvents(tvAttendanceEditorItems);
    }
}
function tvAttendanceStatus(event) { const today = formatLocalDate(); return event.startDate > today ? "예정" : (!event.endDate || event.endDate >= today) ? "진행중" : "종료"; }
function tvMaskName(name) { const value = String(name || "").trim(); return value.length < 2 ? value : value[0] + "*" + value.slice(-1); }
function tvAttendanceRanking(event) {
    const source = Array.isArray(event.__logs) ? event.__logs : [];
    const dailyParticipants = new Set();
    const counts = source.reduce((result, log) => {
        if (!log?.date || log.date < event.startDate || (event.endDate && log.date > event.endDate)) return result;
        const status = String(log.status || log.state || log.attendanceStatus || "").trim().toLowerCase();
        if (log.cancelled === true || log.canceled === true || log.deleted === true ||
            log.rejected === true || log.invalid === true || log.isTest === true ||
            log.testData === true || ["cancelled", "canceled", "cancel", "deleted", "delete",
                "rejected", "reject", "invalid", "void", "test", "취소", "취소됨",
                "삭제", "삭제됨", "거절", "거부", "무효", "테스트"].includes(status)) return result;
        const users = event.type === "ar"
            ? (Array.isArray(log.users) ? log.users : Object.values(log.users || {}))
            : [{ name: log.name || log.leaderName, age: log.age }];
        users.forEach((user) => {
            const name = String(user?.name || "").trim();
            const age = String(user?.age || "").trim();
            const uid = String(user?.uid || user?.userUid || user?.userId || user?.memberId || user?.visitorId || "").trim();
            const phone = String(user?.phone || user?.phoneNumber || user?.mobile || "").replace(/\D/g, "");
            if (!name && !uid && !phone) return;
            const normalizedName = name.replace(/\s+/g, "");
            const identityKey = uid ? `id:${uid}` : phone ? `phone:${phone}` : `name:${normalizedName}\u0000age:${age}`;
            const dailyKey = `${log.date}\u0000${identityKey}`;
            if (dailyParticipants.has(dailyKey)) return;
            dailyParticipants.add(dailyKey);
            if (!result[identityKey]) result[identityKey] = { name: name || "이용자", age, count: 0 };
            result[identityKey].count += 1;
        });
        return result;
    }, {});
    return Object.values(counts)
        .filter((item) => item.count >= Number(event.criteriaCount || 1))
        .sort((a,b) => b.count - a.count || a.name.localeCompare(b.name, "ko") || a.age.localeCompare(b.age, "ko"));
}
function tvRenderAttendanceEvents(items) {
    const root = document.getElementById("tv-attendance-events-editor");
    if (!root) return;
    tvAdminContentCache.attendance = items;
    tvRenderContentFilters("attendance");
    const list = Object.entries(items)
        .filter(([, event]) => tvMatchesAdminFilter(event, tvAdminContentFilters.attendance))
        .sort((a, b) => String(b[1].startDate || "").localeCompare(String(a[1].startDate || "")));
    root.innerHTML = list.map(([id, event]) => {
        const status = tvAttendanceStatus(event);
        const loaded = Array.isArray(event.__logs);
        const loading = tvAttendanceResultLoads.has(id);
        const ranking = loaded ? tvAttendanceRanking(event) : [];
        const result = loaded
            ? `<details class="tv-admin-item-meta"><summary><b>조건 충족 결과 ${ranking.length}명</b></summary><ol>${ranking.slice(0, 5).map((item, index) => `<li>${index + 1}위 ${tvMaskName(item.name)} · ${item.count}회</li>`).join("") || "<li>아직 조건을 만족한 이용자가 없습니다.</li>"}</ol>${event.__truncated ? "<p>최근 5,000건 기준의 제한된 결과입니다.</p>" : ""}</details>`
            : `<button type="button" data-tv-attendance-result="${id}" ${loading ? "disabled" : ""} class="tv-admin-button">${loading ? "결과 불러오는 중…" : "결과 불러오기"}</button>`;
        const badgeClass = status === "진행중" ? "tv-admin-badge--live" : status === "예정" ? "tv-admin-badge--upcoming" : "tv-admin-badge--ended";
        return `<article class="tv-admin-item ${status === "진행중" ? "is-live" : ""}"><div class="tv-admin-item-head"><div><p class="tv-admin-item-title">${event.type === "ar" ? "AR 출석" : "방문 출석"} · ${tvEscape(event.title || "이벤트")}</p><p class="tv-admin-item-meta">${tvEscape(event.startDate)} ~ ${tvEscape(event.endDate || "계속")} · 기준 ${Number(event.criteriaCount || 1)}회 · 당첨 ${Number(event.winnerCount || 0)}명</p></div><span class="tv-admin-badge ${badgeClass}">${status}${status === "진행중" ? " · TV 노출" : ""}</span></div><div class="tv-admin-item-actions">${result}<button data-tv-attendance-edit="${id}" class="tv-admin-text-action">수정</button><button data-tv-attendance-delete="${id}" class="tv-admin-text-action tv-admin-text-action--danger">삭제</button></div></article>`;
    }).join("") || "<p class='tv-admin-item-meta'>해당 상태의 출석 이벤트가 없습니다.</p>";
    root.querySelectorAll("[data-tv-attendance-result]").forEach((button) => button.addEventListener("click", () => tvLoadAttendanceResult(button.dataset.tvAttendanceResult)));
    root.querySelectorAll("[data-tv-attendance-edit]").forEach((button) => button.addEventListener("click", () => tvEditAttendanceEvent(button.dataset.tvAttendanceEdit, button)));
    root.querySelectorAll("[data-tv-attendance-delete]").forEach((button) => button.addEventListener("click", async () => {
        const id = button.dataset.tvAttendanceDelete;
        const event = tvAttendanceEditorItems[id];
        const active = TVCommon.isActive(event, formatLocalDate());
        const summary = `출석 이벤트: ${event?.title || "이벤트"}\n기간: ${event?.startDate || "-"} ~ ${event?.endDate || "계속"}\n상태: ${tvAttendanceStatus(event)}\n삭제 후 복구 기능은 없습니다.`;
        if (!confirm(summary + "\n\n삭제할까요?")) return;
        if (active && prompt("진행 중인 이벤트입니다. 삭제하려면 '삭제'를 입력하세요.") !== "삭제") return;
        const lock = "attendance-delete:" + id;
        if (!tvAcquireLock(lock)) return;
        button.disabled = true;
        try {
            await tvContentRef("attendanceEvents").child(id).remove();
            tvAttendanceResultCache.delete(id);
            await tvLoadAttendanceEventsEditor();
        } catch (error) {
            showMessage("출석 이벤트 삭제 실패: " + (error?.code || error?.message || "unknown_error"));
        } finally {
            tvReleaseLock(lock);
        }
    }));
}
function tvCloseEditorModal(value) {
    const modal = tvAdminEditorModal;
    if (!modal) return false;
    tvAdminEditorModal = null;
    document.removeEventListener("keydown", modal.onKeydown);
    modal.root.onclick = null;
    if (modal.root.isConnected) {
        modal.root.hidden = true;
        modal.root.innerHTML = "";
    }
    if (modal.previousParent?.isConnected && modal.root.parentNode !== modal.previousParent) {
        if (modal.previousNextSibling?.parentNode === modal.previousParent) {
            modal.previousParent.insertBefore(modal.root, modal.previousNextSibling);
        } else {
            modal.previousParent.appendChild(modal.root);
        }
    }
    document.body.style.overflow = modal.previousBodyOverflow;
    if (modal.returnFocus?.isConnected) modal.returnFocus.focus();
    modal.resolve(value ?? null);
    return true;
}
function tvOpenEditorModal(options) {
    const root = document.getElementById("tv-content-modal");
    if (!root) return Promise.resolve(null);
    tvCloseEditorModal(null);
    root.innerHTML = `<div class="tv-admin-dialog" role="dialog" aria-modal="true" aria-labelledby="tv-editor-title">
      <header class="tv-admin-dialog-header"><h3 id="tv-editor-title">${tvEscape(options.title)}</h3><button type="button" data-tv-modal-close class="tv-admin-icon-button" aria-label="편집 취소">×</button></header>
      <form id="tv-editor-form" novalidate>
        <div class="tv-admin-dialog-body"><div class="tv-admin-form-grid">${options.fields}</div><p id="tv-editor-error" class="tv-admin-form-error" role="alert"></p></div>
        <footer class="tv-admin-dialog-footer"><button type="button" data-tv-modal-close class="tv-admin-button">취소</button><button type="submit" class="tv-admin-button tv-admin-button--primary">${tvEscape(options.submitLabel)}</button></footer>
      </form>
    </div>`;
    const previousParent = root.parentNode;
    const previousNextSibling = root.nextSibling;
    // #section-admin keeps the completed fade-in transform. A fixed element
    // inside that transformed section is positioned against the long admin
    // panel instead of the viewport, which can place the dialog above the
    // visible screen. Portal the editor to body while it is open.
    if (root.parentNode !== document.body) {
        document.body.appendChild(root);
    }
    root.hidden = false;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const form = root.querySelector("#tv-editor-form");
    const error = root.querySelector("#tv-editor-error");
    return new Promise((resolve) => {
        const onKeydown = (event) => {
            if (event.key !== "Escape" || tvAdminEditorModal?.root !== root) return;
            event.preventDefault();
            tvCloseEditorModal(null);
        };
        tvAdminEditorModal = {
            root,
            resolve,
            onKeydown,
            previousBodyOverflow,
            previousParent,
            previousNextSibling,
            returnFocus: document.activeElement
        };
        document.addEventListener("keydown", onKeydown);
        root.querySelectorAll("[data-tv-modal-close]").forEach((button) => button.addEventListener("click", () => tvCloseEditorModal(null)));
        root.onclick = (event) => {
            if (event.target === root) tvCloseEditorModal(null);
        };
        form.addEventListener("input", () => {
            const start = form.elements.startDate?.value;
            const end = form.elements.endDate?.value;
            error.textContent = start && end && start > end ? "종료일은 시작일보다 빠를 수 없습니다." : "";
        });
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            if (!form.reportValidity()) return;
            const start = form.elements.startDate?.value;
            const end = form.elements.endDate?.value;
            if (start && end && start > end) {
                error.textContent = "종료일은 시작일보다 빠를 수 없습니다.";
                form.elements.endDate.focus();
                return;
            }
            tvCloseEditorModal(Object.fromEntries(new FormData(form).entries()));
        });
        form.querySelector("input,select,textarea")?.focus();
    });
}
async function tvEditAttendanceEvent(id, button) {
    const lockKey = "attendance-edit:" + (id || "new");
    if (!tvAcquireLock(lockKey)) return;
    const originalText = button?.textContent;
    if (button) {
        button.disabled = true;
        button.textContent = "처리 중…";
    }
    try {
        const old = id ? (await tvContentRef("attendanceEvents").child(id).once("value")).val() || {} : {};
        const data = await tvOpenEditorModal({
            title: id ? "출석 이벤트 수정" : "출석 이벤트 등록",
            submitLabel: id ? "수정 저장" : "출석 이벤트 등록",
            fields: `
              <label class="tv-admin-field"><span>이벤트 유형 *</span><select name="type" required><option value="visit" ${(old.type || "visit") === "visit" ? "selected" : ""}>방문 출석</option><option value="ar" ${old.type === "ar" ? "selected" : ""}>AR 출석</option></select></label>
              <label class="tv-admin-field"><span>이벤트 제목 *</span><input name="title" maxlength="120" value="${tvEscape(old.title || "")}" placeholder="예: 여름방학 출석 챌린지" required></label>
              <label class="tv-admin-field"><span>시작일 *</span><input name="startDate" type="date" value="${tvEscape(old.startDate || formatLocalDate())}" required></label>
              <label class="tv-admin-field"><span>종료일 <small>(선택)</small></span><input name="endDate" type="date" value="${tvEscape(old.endDate || "")}"></label>
              <label class="tv-admin-field"><span>순위 진입 기준 *</span><input name="criteriaCount" type="number" min="1" max="10000" value="${Number(old.criteriaCount || 5)}" required><small>기간 중 몇 회 이상 참여해야 순위에 표시되는지 설정합니다.</small></label>
              <label class="tv-admin-field"><span>당첨 인원 *</span><input name="winnerCount" type="number" min="0" max="10000" value="${Number(old.winnerCount || 10)}" required></label>
              <label class="tv-admin-field tv-admin-field--wide"><span>참여 안내 <small>(선택)</small></span><textarea name="description" maxlength="2000" placeholder="참여 방법을 짧게 입력하세요.">${tvEscape(old.description || "")}</textarea></label>
              <label class="tv-admin-field tv-admin-field--wide"><span>TV 순위표 제목 <small>(선택)</small></span><input name="tvTitle" maxlength="120" value="${tvEscape(old.tvTitle || "")}" placeholder="비워두면 이벤트 제목을 사용합니다."></label>
              <label class="tv-admin-field tv-admin-field--wide"><span>TV 부제 <small>(선택)</small></span><input name="tvSubtitle" maxlength="240" value="${tvEscape(old.tvSubtitle || "")}" placeholder="순위표 아래에 표시할 짧은 안내"></label>
              <label class="tv-admin-field tv-admin-field--wide"><span>참여자 없음 문구 <small>(선택)</small></span><input name="tvEmptyMessage" maxlength="160" value="${tvEscape(old.tvEmptyMessage || "")}" placeholder="아직 순위에 오른 참여자가 없습니다."></label>`
        });
        if (!data) return;
        const criteriaCount = Math.max(1, Number(data.criteriaCount) || 1);
        const winnerCount = Math.max(0, Number(data.winnerCount) || 0);
        const itemRef = id ? tvContentRef("attendanceEvents").child(id) : tvContentRef("attendanceEvents").push();
        await itemRef.set({
            ...old,
            type: data.type,
            title: data.title.trim(),
            startDate: data.startDate,
            endDate: data.endDate || "",
            criteriaCount,
            criteriaLabel: `${criteriaCount}회 이상`,
            winnerCount,
            description: data.description.trim(),
            tvTitle: data.tvTitle.trim(),
            tvSubtitle: data.tvSubtitle.trim(),
            tvEmptyMessage: data.tvEmptyMessage.trim(),
            enabled: true,
            createdAt: old.createdAt || firebase.database.ServerValue.TIMESTAMP
        });
        showMessage(id ? "출석 이벤트가 수정되었습니다." : "출석 이벤트가 생성되었습니다.", "success");
        tvLoadContentEditors();
    } catch (error) {
        logError("tv.attendanceEvent", error);
        showMessage("출석 이벤트 저장 실패: " + (error?.code || error?.message || "unknown_error"));
    } finally {
        tvReleaseLock(lockKey);
        if (button?.isConnected) {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}
function tvRenderContent(type, items) {
    const root = document.getElementById("tv-" + type + "-editor");
    if (!root) return;
    tvAdminContentCache[type] = items;
    tvRenderContentFilters(type);
    let list = Object.entries(items).filter(([, item]) => item && item.enabled !== false && tvMatchesAdminFilter(item, tvAdminContentFilters[type]));
    list = type === "notices" ? TVCommon.sortNotices(list) : TVCommon.sortEvents(list);
    const tvFirstId = list.find(([, item]) => TVCommon.isActive(item, formatLocalDate()))?.[0];
    root.innerHTML = list.map(([id, item], listIndex) => {
        const displayStatus = TVCommon.dateStatus(item, formatLocalDate());
        const statusLabel = displayStatus === "active" ? "진행 중 · TV 표시 대상" : displayStatus === "upcoming" ? "예정" : displayStatus === "ended" ? "종료" : "날짜 오류";
        const badgeClass = displayStatus === "active" ? "tv-admin-badge--live" : displayStatus === "upcoming" ? "tv-admin-badge--upcoming" : "tv-admin-badge--ended";
        const statusBadge = `<span class="tv-admin-badge ${badgeClass}">${id === tvFirstId ? "TV 우선 · " : ""}${statusLabel}</span>`;
        if (type === "events") {
            const eventImages = tvEventImages(item);
            const pendingUploads = tvReadCloudPending().events?.[id]?.uploaded || [];
            const thumbnails = eventImages.map((image, index) => `<span style="position:relative;display:inline-block"><img src="${tvEscape(image.secure_url)}" alt="" style="width:80px;height:52px;border-radius:8px;object-fit:cover"><button type="button" data-tv-event-image-delete="${id}:${index}" class="tv-admin-icon-button" style="position:absolute;right:-5px;top:-5px;width:28px;height:28px" aria-label="이벤트 이미지 삭제">×</button></span>`).join("");
            return `<article class="tv-admin-item ${displayStatus === "active" ? "is-live" : ""}"><div class="tv-admin-item-head"><div><p class="tv-admin-item-title">일반 행사 · ${tvEscape(item.title || "이벤트")}</p><p class="tv-admin-item-meta">${tvEscape(item.startDate || "")} ~ ${tvEscape(item.endDate || "계속")} · 이미지 ${eventImages.length}장</p></div>${statusBadge}</div>${thumbnails ? `<details class="tv-admin-item-meta"><summary>등록 이미지 보기</summary><div class="tv-admin-inline-actions">${thumbnails}</div></details>` : ""}${pendingUploads.length ? `<p class="tv-admin-item-meta">업로드 ${pendingUploads.length}장 등록 대기 · 같은 파일 선택 시 재개</p>` : ""}<div class="tv-admin-item-actions"><button type="button" data-tv-content-edit="${type}:${id}" class="tv-admin-text-action">수정</button><label class="tv-admin-text-action" style="display:inline-flex;align-items:center;cursor:pointer">이미지 추가<input type="file" accept="image/*" multiple class="sr-only" data-tv-event-images="${id}"></label><button type="button" data-tv-content-delete="${type}:${id}" class="tv-admin-text-action tv-admin-text-action--danger">삭제</button></div></article>`;
        }
        const imageUrl = item.secure_url || item.image || item.imageUrl || item.url;
        const hasImage = item.type === "image" || Boolean(imageUrl);
        return `<article class="tv-admin-item ${displayStatus === "active" ? "is-live" : ""}"><div class="tv-admin-item-head"><div class="tv-admin-inline-actions">${hasImage ? `<img src="${tvEscape(imageUrl)}" alt="" style="width:76px;height:50px;border-radius:8px;object-fit:cover">` : ""}<div><p class="tv-admin-item-title">${item.emergency ? "긴급 공지" : hasImage ? "이미지 공지" : "텍스트 공지"} · ${tvEscape(item.title || "공지")}</p><p class="tv-admin-item-meta">${tvEscape(item.startDate || "")} ~ ${tvEscape(item.endDate || "계속")}</p></div></div>${statusBadge}</div>${hasImage ? "<p class='tv-admin-item-meta'>이미지 공지가 활성화되면 텍스트 공지는 TV에서 숨겨집니다.</p>" : ""}<div class="tv-admin-item-actions">${hasImage ? "" : `<button type="button" data-tv-content-edit="${type}:${id}" class="tv-admin-text-action">수정</button>`}<button type="button" data-tv-content-delete="${type}:${id}" class="tv-admin-text-action tv-admin-text-action--danger">삭제</button></div></article>`;
    }).join("") || "<p class='tv-admin-item-meta'>해당 상태의 콘텐츠가 없습니다.</p>";
    root.querySelectorAll("[data-tv-content-edit]").forEach((button) => button.addEventListener("click", () => {
        const [type, id] = button.dataset.tvContentEdit.split(":");
        tvEditContent(type, id, button);
    }));
    root.querySelectorAll("[data-tv-event-images]").forEach((input) => input.addEventListener("change", () => tvUploadEventImages(input.dataset.tvEventImages, [...input.files], input)));
    root.querySelectorAll("[data-tv-event-image-delete]").forEach((button) => button.addEventListener("click", () => {
        const [eventId, imageIndex] = button.dataset.tvEventImageDelete.split(":");
        tvDeleteEventImage(eventId, Number(imageIndex), button);
    }));
    root.querySelectorAll("[data-tv-content-delete]").forEach((button) => button.addEventListener("click", () => {
        const [contentType, contentId] = button.dataset.tvContentDelete.split(":");
        const item = items[contentId] || {};
        const status = TVCommon.dateStatus(item, formatLocalDate());
        const imageCount = contentType === "events" ? tvEventImages(item).length : Number(Boolean(item.secure_url || item.image || item.imageUrl || item.url));
        const summary = `${contentType === "events" ? "이벤트" : "공지"}: ${item.title || "(제목 없음)"}\n기간: ${item.startDate || "-"} ~ ${item.endDate || "계속"}\n상태: ${status}\n연결 이미지: ${imageCount}개\n\n삭제 후 앱 내 복구 기능은 없습니다. Cloudinary 원본은 자동 삭제되지 않습니다.`;
        if (!confirm(summary + "\n\n삭제할까요?")) return;
        if (status === "active" && prompt("현재 표시 중인 항목입니다. 삭제하려면 '삭제'를 입력하세요.") !== "삭제") return;
        tvDeleteContent(contentType, contentId, button, item);
    }));
}

function tvEventImages(event) {
    const images = Array.isArray(event?.images)
        ? event.images
        : event?.images && typeof event.images === "object"
            ? Object.values(event.images)
            : [];
    if (event?.image && !images.length) {
        images.push({ secure_url: event.image, public_id: event.public_id || "" });
    }
    return images.filter((image) => image && image.secure_url);
}

async function tvDeleteContent(contentType, contentId, button, item = {}) {
    if (!contentType || !contentId || button?.disabled) return;
    const lockKey = "content-delete:" + contentType + ":" + contentId;
    if (!tvAcquireLock(lockKey)) return;
    const itemRef = tvContentRef(contentType).child(contentId);
    const originalText = button?.textContent || "삭제";
    try {
        const user = await tvRequireAdminSession("항목 삭제");
        if (!user) return;
        if (button) {
            button.disabled = true;
            button.textContent = "삭제 중…";
        }

        try {
            await itemRef.remove();
        } catch (error) {
            if (String(error?.code || "").toLowerCase() !== "permission_denied") throw error;

            // Some RTDB rules allow authenticated create/update operations but
            // reject deletes because a delete makes newData null. In that case,
            // archive the record so it immediately disappears from admin/TV.
            await itemRef.update({
                enabled: false,
                deletedAt: firebase.database.ServerValue.TIMESTAMP
            });
        }

        const cloudImages = contentType === "events"
            ? tvEventImages(item)
            : [{ secure_url: item.secure_url || item.image || item.imageUrl || item.url, public_id: item.public_id || "" }];
        tvRememberManualCloudCleanup(cloudImages, `${contentType}/${contentId} Firebase 삭제`);
        showMessage("항목이 삭제되었습니다.", "success");
        tvLoadContentEditors();
    } catch (error) {
        logError("tv.content.delete", error);
        const code = error?.code || "unknown_error";
        showMessage("항목 삭제 실패: " + code + ". Firebase Realtime Database Rules를 확인해 주세요.");
    } finally {
        tvReleaseLock(lockKey);
        if (button?.isConnected) {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}
async function tvEditContent(type, id, button) {
    const lockKey = "content-edit:" + type + ":" + (id || "new");
    if (!tvAcquireLock(lockKey)) return;
    const originalText = button?.textContent;
    if (button) {
        button.disabled = true;
        button.textContent = "처리 중…";
    }
    try {
        const old = id ? (await tvContentRef(type).child(id).once("value")).val() || {} : {};
        const isNotice = type === "notices";
        const data = await tvOpenEditorModal({
            title: id ? (isNotice ? "공지 수정" : "행사 수정") : (isNotice ? "공지 등록" : "행사 등록"),
            submitLabel: id ? "수정 저장" : (isNotice ? "공지 등록" : "행사 등록"),
            fields: `
              <label class="tv-admin-field tv-admin-field--wide"><span>${isNotice ? "공지" : "행사"} 제목 *</span><input name="title" maxlength="120" value="${tvEscape(old.title || "")}" placeholder="${isNotice ? "예: 시설 이용시간 변경 안내" : "예: 여름방학 청소년 프로그램"}" required></label>
              <label class="tv-admin-field tv-admin-field--wide"><span>주요 내용 <small>(선택)</small></span><textarea name="description" maxlength="${isNotice ? 4000 : 2000}" placeholder="TV에서 멀리서 읽을 수 있도록 핵심만 짧게 작성하세요.">${tvEscape(old.description || "")}</textarea></label>
              <label class="tv-admin-field"><span>게시 시작일 *</span><input name="startDate" type="date" value="${tvEscape(old.startDate || formatLocalDate())}" required></label>
              <label class="tv-admin-field"><span>게시 종료일 <small>(선택)</small></span><input name="endDate" type="date" value="${tvEscape(old.endDate || "")}"><small>비워두면 계속 표시됩니다.</small></label>
              <label class="tv-admin-field"><span>표시 우선순위</span><input name="priority" type="number" min="-9999" max="9999" value="${Number(old.priority || 0)}"><small>숫자가 높을수록 먼저 표시됩니다.</small></label>
              ${isNotice ? `<label class="tv-admin-field"><span>공지 강조</span><select name="emergency"><option value="false" ${!old.emergency ? "selected" : ""}>일반 공지</option><option value="true" ${old.emergency ? "selected" : ""}>긴급 공지</option></select><small>긴급 공지에만 위험 색상을 사용합니다.</small></label>` : ""}
            `
        });
        if (!data) return;
        const priority = Number(data.priority) || 0;
        const emergency = isNotice ? data.emergency === "true" : Boolean(old.emergency);
        const itemRef = id ? tvContentRef(type).child(id) : tvContentRef(type).push();
        const contentType = type === "notices" ? "text" : (old.type || "text");
        await itemRef.set({ ...old, type: contentType, title: data.title.trim(), description: data.description.trim(), startDate: data.startDate, endDate: data.endDate || "", priority, emergency, enabled: true, createdAt: old.createdAt || firebase.database.ServerValue.TIMESTAMP });
        showMessage(id ? "항목이 수정되었습니다." : "항목이 추가되었습니다.", "success");
        tvLoadContentEditors();
    } catch (error) {
        logError("tv.content.edit", error);
        showMessage("항목을 저장하지 못했습니다: " + (error.code || "알 수 없는 오류"));
    } finally {
        tvReleaseLock(lockKey);
        if (button?.isConnected) {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}
function tvSelectNoticeImage(file) {
    if (!file) return;
    if (tvReadCloudPending().notice) {
        showMessage("이미 업로드된 공지의 Firebase 등록을 먼저 완료해 주세요.");
        return;
    }
    if (!file.type || !file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
        showMessage("10MB 이하의 JPG, PNG, WEBP 이미지 파일을 선택해 주세요.");
        return;
    }
    if (tvNoticePreviewUrl) URL.revokeObjectURL(tvNoticePreviewUrl);
    tvNoticeSelectedFile = file;
    tvNoticePreviewUrl = URL.createObjectURL(file);
    const preview = document.getElementById("tv-notice-preview");
    const image = preview && preview.querySelector("img");
    if (image) image.src = tvNoticePreviewUrl;
    if (preview) preview.classList.remove("hidden");
    const button = document.getElementById("tv-notice-upload-button");
    if (button) button.disabled = false;
    const progress = document.getElementById("tv-notice-upload-progress");
    if (progress) progress.textContent = file.name + " · 업로드 준비 완료";
}

async function tvUploadNoticeImage() {
    const file = tvNoticeSelectedFile;
    let pendingStore = tvReadCloudPending();
    let pendingNotice = pendingStore.notice;
    if ((!file && !pendingNotice) || tvNoticeUploading || !tvAcquireLock("notice-upload")) return;
    const progress = document.getElementById("tv-notice-upload-progress");
    const noticeUpload = document.getElementById("tv-notice-image-upload");
    const uploadButton = document.getElementById("tv-notice-upload-button");
    try {
        const user = await tvRequireAdminSession("공지 이미지 업로드");
        if (!user) return;
        tvNoticeUploading = true;
        if (uploadButton) {
            uploadButton.disabled = true;
            uploadButton.textContent = "Cloudinary 업로드 중…";
        }
        if (progress) progress.textContent = "공지 이미지를 업로드하고 있습니다…";

        if (!pendingNotice) {
            const result = await tvUploadToCloudinary(file, CLOUDINARY_CONFIG.noticeAssetFolder);
            pendingNotice = {
                recordId: tvContentRef("notices").push().key,
                secure_url: result.secure_url,
                public_id: result.public_id,
                title: file.name.replace(/\.[^.]+$/, "") || "이미지 공지",
                createdAt: Date.now()
            };
            pendingStore.notice = pendingNotice;
            tvWriteCloudPending(pendingStore);
        }
        if (uploadButton) uploadButton.textContent = "Firebase 등록 중…";
        await tvContentRef("notices").child(pendingNotice.recordId).set({
            type: "image",
            title: pendingNotice.title,
            secure_url: pendingNotice.secure_url,
            public_id: pendingNotice.public_id,
            startDate: formatLocalDate(),
            endDate: "",
            priority: pendingNotice.createdAt,
            enabled: true,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });
        delete pendingStore.notice;
        tvWriteCloudPending(pendingStore);

        if (progress) progress.textContent = "공지 이미지가 등록되었습니다.";
        showMessage("공지 이미지가 등록되어 TV에 반영되었습니다.", "success");
        if (noticeUpload) noticeUpload.value = "";
        if (tvNoticePreviewUrl) URL.revokeObjectURL(tvNoticePreviewUrl);
        tvNoticePreviewUrl = "";
        tvNoticeSelectedFile = null;
        document.getElementById("tv-notice-preview")?.classList.add("hidden");
        await tvContentRef("notices").once("value").then((snapshot) => tvRenderContent("notices", snapshot.val() || {}));
    } catch (error) {
        logError("tv.notice.upload", error);
        if (progress) progress.textContent = "업로드 실패: " + tvUploadErrorMessage(error);
        showMessage("공지 이미지 업로드 실패: " + tvUploadErrorMessage(error));
        // Keep the selected file and existing RTDB notice data intact so the
        // administrator can retry without selecting the file again.
    } finally {
        tvNoticeUploading = false;
        tvReleaseLock("notice-upload");
        if (uploadButton) {
            const stillPending = tvReadCloudPending().notice;
            uploadButton.disabled = !tvNoticeSelectedFile && !stillPending;
            uploadButton.textContent = stillPending ? "업로드된 이미지 등록 다시 시도" : "이미지 공지 등록";
        }
    }
}
async function tvUploadEventImages(eventId, files, input) {
    const validFiles = files.filter((file) => file && file.type.startsWith("image/") && file.size <= 10 * 1024 * 1024);
    if (!validFiles.length) { showMessage("10MB 이하의 JPG, PNG, WEBP 이미지 파일을 선택해 주세요."); return; }
    if (validFiles.length !== files.length) showMessage("이미지 파일만 업로드됩니다. 10MB를 넘는 파일은 제외했습니다.", "info");
    const progress = document.getElementById("tv-event-upload-progress");
    const lockKey = "event-upload:" + eventId;
    if (!tvAcquireLock(lockKey)) return;
    try {
        const user = await tvRequireAdminSession("이벤트 이미지 업로드");
        if (!user) return;
        if (input) input.disabled = true;
        const eventRef = tvContentRef("events").child(eventId);
        const snapshot = await eventRef.once("value");
        const event = snapshot.val();
        if (!event || event.enabled === false) throw new Error("이벤트를 찾을 수 없습니다.");
        const images = tvEventImages(event);
        const pendingStore = tvReadCloudPending();
        pendingStore.events = pendingStore.events || {};
        const pendingEvent = pendingStore.events[eventId] || { uploaded: [] };
        for (let index = 0; index < validFiles.length; index += 1) {
            const fingerprint = TVCommon.cloudFileFingerprint(validFiles[index]);
            const reused = pendingEvent.uploaded.find((image) => image.fingerprint === fingerprint);
            if (reused) {
                if (!images.some((image) => image.secure_url === reused.secure_url)) images.push(reused);
                continue;
            }
            if (progress) progress.textContent = `이벤트 사진 ${index + 1}/${validFiles.length} 업로드 중…`;
            const result = await tvUploadToCloudinary(validFiles[index], CLOUDINARY_CONFIG.eventAssetFolder);
            const uploaded = {
                fingerprint,
                secure_url: result.secure_url,
                public_id: result.public_id
            };
            pendingEvent.uploaded.push(uploaded);
            pendingStore.events[eventId] = pendingEvent;
            tvWriteCloudPending(pendingStore);
            images.push(uploaded);
        }
        await eventRef.update({
            images,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        delete pendingStore.events[eventId];
        if (!Object.keys(pendingStore.events).length) delete pendingStore.events;
        tvWriteCloudPending(pendingStore);
        if (progress) progress.textContent = `이벤트 사진 ${validFiles.length}장이 추가되었습니다.`;
        showMessage("이벤트 사진이 추가되었습니다.", "success");
        tvLoadContentEditors();
    } catch (error) {
        logError("tv.events.images.upload", error);
        if (progress) progress.textContent = "이벤트 사진 업로드에 실패했습니다.";
        showMessage("이벤트 사진 업로드 실패: " + tvUploadErrorMessage(error));
    } finally {
        tvReleaseLock(lockKey);
        if (input?.isConnected) {
            input.disabled = false;
            input.value = "";
        }
    }
}

async function tvDeleteEventImage(eventId, imageIndex, button) {
    if (!eventId || !Number.isInteger(imageIndex)) return;
    const lockKey = "event-image-delete:" + eventId;
    if (!tvAcquireLock(lockKey)) return;
    try {
        const eventRef = tvContentRef("events").child(eventId);
        const snapshot = await eventRef.once("value");
        const event = snapshot.val();
        if (!event) return;
        const images = tvEventImages(event);
        const removed = images.splice(imageIndex, 1);
        if (button) button.disabled = true;
        await eventRef.update({ images, updatedAt: firebase.database.ServerValue.TIMESTAMP });
        tvRememberManualCloudCleanup(removed, "이벤트 이미지 Firebase 연결 제거");
        showMessage("Firebase에서 이미지를 제거했습니다. Cloudinary 원본은 정리 목록을 참고해 수동 삭제해야 합니다.", "success");
        tvLoadContentEditors();
    } catch (error) {
        logError("tv.events.images.delete", error);
        showMessage("이벤트 사진을 제거하지 못했습니다: " + (error?.code || "unknown_error"));
    } finally {
        tvReleaseLock(lockKey);
        if (button?.isConnected) button.disabled = false;
    }
}
function tvRenderStatus() {
    const card = document.getElementById("tv-status-card");
    if (!card || !tvAcquireLock("status-read")) return;
    const button = document.querySelector("[data-tv-action=refresh-status]");
    if (button) {
        button.disabled = true;
        button.textContent = "확인 중…";
    }
    return db.ref("tvStatus").once("value").then((snapshot) => {
        const value = snapshot.val() || {};
        const isOnline = value.online === true && Number(value.lastSync) >= Date.now() - 10 * 60 * 1000;
        const online = document.getElementById("tv-status-online");
        const sync = document.getElementById("tv-status-sync");
        const slide = document.getElementById("tv-status-slide");
        if (online) {
            online.textContent = isOnline ? "● 온라인" : "○ 오프라인";
            online.style.color = isOnline ? "#047857" : "#9f1239";
        }
        if (sync) sync.textContent = value.lastSync ? new Date(value.lastSync).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "아직 없음";
        if (slide) slide.textContent = TV_LABELS[TVCommon.sourceId({ id: value.currentSlide })] || value.currentSlide || "-";
        tvUpdateOverviewCounts();
    }).catch((error) => {
        logError("tv.status.load", error);
        const online = document.getElementById("tv-status-online");
        if (online) {
            online.textContent = "조회 실패";
            online.style.color = "#9f1239";
        }
    }).finally(() => {
        tvReleaseLock("status-read");
        if (button?.isConnected) {
            button.disabled = false;
            button.textContent = "상태 새로고침";
        }
    });
}
function tvUpdateOverviewCounts() {
    const count = ["notices", "events", "attendance"].reduce((total, type) => {
        return total + Object.values(tvAdminContentCache[type] || {}).filter((item) => item && item.enabled !== false && TVCommon.isActive(item, formatLocalDate())).length;
    }, 0);
    const target = document.getElementById("tv-status-content-count");
    if (target) target.textContent = `${count}건`;
}
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
function unloadTvManagement() {
    tvCloseEditorModal(null);
    clearTimeout(tvAdminSaveTimer);
    tvAdminSaveTimer = null;
    if (tvAdminSettingsListener) {
        tvAdminSettingsListener.off();
        tvAdminSettingsListener = null;
    }
    if (tvNoticePreviewUrl) {
        URL.revokeObjectURL(tvNoticePreviewUrl);
        tvNoticePreviewUrl = "";
    }
    tvNoticeSelectedFile = null;
}
window.addEventListener("beforeunload", (e) => { if (tvAdminDirty) { e.preventDefault(); e.returnValue = ""; } });
