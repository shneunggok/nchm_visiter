(function initializeSpecialDayFeatures() {
const SPECIAL_DAY_IMAGE_FOLDER = "site/special-days";
const SPECIAL_VISIT_RECEIPT_STORAGE_KEY = "nchm:special-visit-completion:v1";

let specialDaySettingsState = {};
let specialDaySettingsListener = null;
let specialVisitCompletionTimer = null;
let adminSpecialDayImage = { url: "", publicId: "" };
let adminSpecialDayPreviewObjectUrl = "";

function getSpecialDaySetting(date = new Date()) {
    const dateKey = date instanceof Date ? formatLocalDate(date) : String(date || "");
    return specialDaySettingsState?.[dateKey] || null;
}

function isSpecialDayArPaused(date = new Date()) {
    return getSpecialDaySetting(date)?.arPauseEnabled === true;
}

function formatSpecialDayDisplayDate(date = new Date()) {
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}. ${weekdays[date.getDay()]}요일 · 오늘만`;
}

function updateSpecialDayPublicUi(date = new Date()) {
    const setting = getSpecialDaySetting(date);
    const paused = setting?.arPauseEnabled === true;
    const notice = document.getElementById("special-day-ar-notice");
    const reservation = document.getElementById("ar-reservation-content");
    const dateLabel = document.getElementById("special-day-ar-date");
    const title = document.getElementById("special-day-ar-title");
    const message = document.getElementById("special-day-ar-message");
    const imageFrame = document.getElementById("special-day-ar-image-frame");
    const image = document.getElementById("special-day-ar-image");

    notice?.classList.toggle("hidden", !paused);
    reservation?.classList.toggle("hidden", paused);
    notice?.setAttribute("aria-hidden", String(!paused));
    reservation?.setAttribute("aria-hidden", String(paused));
    if (dateLabel) dateLabel.textContent = formatSpecialDayDisplayDate(date);
    if (title) title.textContent = setting?.arTitle || "오늘은 특별 행사가 진행됩니다!";
    if (message) message.textContent = setting?.arMessage || "행사 운영으로 오늘은 AR 예약이 어렵습니다.";
    if (image) {
        if (paused && setting?.arImageUrl) image.src = setting.arImageUrl;
        else image.removeAttribute("src");
        image.alt = `${setting?.arTitle || "특별 운영일"} 안내 포스터`;
    }
    imageFrame?.classList.toggle("hidden", !paused || !setting?.arImageUrl);
    if (dom.sectionAr) dom.sectionAr.dataset.specialDay = paused ? "active" : "inactive";

    if (setting?.visitReceiptEnabled === true) restoreSpecialVisitCompletion();
    else hideSpecialVisitCompletion();
    return paused;
}

function subscribeSpecialDaySettings() {
    if (specialDaySettingsListener) return;
    specialDaySettingsListener = db.ref("specialDaySettings");
    specialDaySettingsListener.on("value", (snapshot) => {
        specialDaySettingsState = snapshot.val() || {};
        updateSpecialDayPublicUi(new Date());
        if (typeof renderAdminSpecialDaySettings === "function") renderAdminSpecialDaySettings();
    }, (error) => logError("special-day-settings", error));
}

function saveSpecialVisitCompletionReceipt(receipt) {
    try {
        window.sessionStorage?.setItem(SPECIAL_VISIT_RECEIPT_STORAGE_KEY, JSON.stringify(receipt));
    } catch (error) {
        logError("special-visit-receipt-save", error);
    }
}

function removeSpecialVisitCompletionReceipt() {
    try {
        window.sessionStorage?.removeItem(SPECIAL_VISIT_RECEIPT_STORAGE_KEY);
    } catch (error) {
        logError("special-visit-receipt-remove", error);
    }
}

function hideSpecialVisitCompletion({ removeReceipt = true } = {}) {
    window.clearInterval(specialVisitCompletionTimer);
    specialVisitCompletionTimer = null;
    const modal = document.getElementById("special-visit-completion-modal");
    modal?.classList.add("hidden");
    modal?.setAttribute("aria-hidden", "true");
    if (removeReceipt) removeSpecialVisitCompletionReceipt();
}

function showSpecialVisitCompletion(personCount, completedAt = Date.now(), unlockAt) {
    const completedDate = new Date(completedAt);
    const setting = getSpecialDaySetting(completedDate);
    if (setting?.visitReceiptEnabled !== true) return false;
    const delaySeconds = [3, 5, 10, 15, 20, 30].includes(Number(setting.visitReceiptDelaySeconds)) ? Number(setting.visitReceiptDelaySeconds) : 10;
    const delayMs = delaySeconds * 1000;
    const normalizedUnlockAt = Number(unlockAt) || (Date.now() + delayMs);
    const modal = document.getElementById("special-visit-completion-modal");
    const title = document.getElementById("special-visit-completion-title");
    const message = document.getElementById("special-visit-completion-message");
    const count = document.getElementById("special-visit-completion-count");
    const time = document.getElementById("special-visit-completion-time");
    const button = document.getElementById("special-visit-completion-button");
    const cover = document.getElementById("special-visit-completion-button-cover");
    const buttonText = document.getElementById("special-visit-completion-button-text");
    if (!modal || !title || !message || !count || !time || !button || !cover || !buttonText) return false;

    const normalizedCount = Math.max(1, Math.min(10, Number(personCount) || 1));
    saveSpecialVisitCompletionReceipt({
        date: formatLocalDate(completedDate), personCount: normalizedCount,
        completedAt: completedDate.getTime(), unlockAt: normalizedUnlockAt
    });
    title.textContent = setting.visitReceiptTitle || "출석 완료";
    message.textContent = setting.visitReceiptMessage || "이 화면을 데스크 선생님에게 보여주세요.";
    count.textContent = `오늘 방문 ${normalizedCount}명`;
    time.textContent = `${String(completedDate.getHours()).padStart(2, "0")}:${String(completedDate.getMinutes()).padStart(2, "0")} 등록`;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    button.disabled = true;

    const remainingMs = Math.max(0, normalizedUnlockAt - Date.now());
    cover.style.transition = "none";
    cover.style.width = `${Math.min(100, (remainingMs / delayMs) * 100)}%`;
    cover.offsetWidth;
    cover.style.transition = `width ${remainingMs}ms linear`;
    cover.style.width = "0%";

    const updateCountdown = () => {
        const remainingSeconds = Math.max(0, Math.ceil((normalizedUnlockAt - Date.now()) / 1000));
        if (remainingSeconds > 0) {
            buttonText.textContent = `완료 (${remainingSeconds}초)`;
            return;
        }
        window.clearInterval(specialVisitCompletionTimer);
        specialVisitCompletionTimer = null;
        buttonText.textContent = "완료 ✓";
        button.disabled = false;
        button.focus();
    };
    window.clearInterval(specialVisitCompletionTimer);
    updateCountdown();
    if (button.disabled) specialVisitCompletionTimer = window.setInterval(updateCountdown, 250);
    return true;
}

function restoreSpecialVisitCompletion() {
    try {
        const receipt = JSON.parse(window.sessionStorage?.getItem(SPECIAL_VISIT_RECEIPT_STORAGE_KEY) || "null");
        if (!receipt || receipt.date !== formatLocalDate() || getSpecialDaySetting()?.visitReceiptEnabled !== true) return false;
        return showSpecialVisitCompletion(receipt.personCount, receipt.completedAt, receipt.unlockAt);
    } catch (error) {
        logError("special-visit-receipt-read", error);
        removeSpecialVisitCompletionReceipt();
        return false;
    }
}

function closeSpecialVisitCompletion() {
    const button = document.getElementById("special-visit-completion-button");
    if (!button || button.disabled) return false;
    hideSpecialVisitCompletion();
    document.querySelector("#visit-user-container input")?.focus();
    return true;
}

function setAdminSpecialDayStatus(message) {
    const status = document.getElementById("admin-special-day-status");
    if (status) status.textContent = message;
}

function updateAdminSpecialDayImagePreview(url) {
    const preview = document.getElementById("admin-special-day-image-preview");
    const image = preview?.querySelector("img");
    if (image) image.src = url || "";
    preview?.classList.toggle("hidden", !url);
}

function previewAdminSpecialDayImage(file) {
    if (adminSpecialDayPreviewObjectUrl) URL.revokeObjectURL(adminSpecialDayPreviewObjectUrl);
    adminSpecialDayPreviewObjectUrl = "";
    if (!file) {
        updateAdminSpecialDayImagePreview(adminSpecialDayImage.url);
        return;
    }
    if (!file.type?.startsWith("image/") || file.size > 10 * 1024 * 1024) {
        document.getElementById("admin-special-day-image-file").value = "";
        showMessage("포스터는 10MB 이하 이미지 파일만 선택할 수 있습니다.");
        return;
    }
    adminSpecialDayPreviewObjectUrl = URL.createObjectURL(file);
    updateAdminSpecialDayImagePreview(adminSpecialDayPreviewObjectUrl);
}

function clearAdminSpecialDayImage() {
    if (adminSpecialDayPreviewObjectUrl) URL.revokeObjectURL(adminSpecialDayPreviewObjectUrl);
    adminSpecialDayPreviewObjectUrl = "";
    adminSpecialDayImage = { url: "", publicId: "" };
    const input = document.getElementById("admin-special-day-image-file");
    if (input) input.value = "";
    updateAdminSpecialDayImagePreview("");
}

function resetAdminSpecialDayForm() {
    const today = formatLocalDate();
    document.getElementById("admin-special-day-date").value = today;
    document.getElementById("admin-special-day-ar-enabled").checked = false;
    document.getElementById("admin-special-day-ar-title").value = "오늘은 특별 행사가 진행됩니다!";
    document.getElementById("admin-special-day-ar-message").value = "행사 운영으로 오늘은 AR 예약이 어렵습니다.\n다음 운영일부터 다시 이용할 수 있습니다.";
    document.getElementById("admin-special-day-visit-enabled").checked = false;
    document.getElementById("admin-special-day-visit-title").value = "출석 완료";
    document.getElementById("admin-special-day-visit-message").value = "이 화면을 데스크 선생님에게 보여주세요.";
    document.getElementById("admin-special-day-visit-delay").value = "10";
    clearAdminSpecialDayImage();
    setAdminSpecialDayStatus("날짜와 사용할 기능을 선택해 주세요.");
}

function selectAdminSpecialDaySetting(date) {
    const value = specialDaySettingsState?.[date];
    if (!value) return false;
    document.getElementById("admin-special-day-date").value = date;
    document.getElementById("admin-special-day-ar-enabled").checked = value.arPauseEnabled === true;
    document.getElementById("admin-special-day-ar-title").value = value.arTitle || "오늘은 특별 행사가 진행됩니다!";
    document.getElementById("admin-special-day-ar-message").value = value.arMessage || "행사 운영으로 오늘은 AR 예약이 어렵습니다.";
    document.getElementById("admin-special-day-visit-enabled").checked = value.visitReceiptEnabled === true;
    document.getElementById("admin-special-day-visit-title").value = value.visitReceiptTitle || "출석 완료";
    document.getElementById("admin-special-day-visit-message").value = value.visitReceiptMessage || "이 화면을 데스크 선생님에게 보여주세요.";
    document.getElementById("admin-special-day-visit-delay").value = String(value.visitReceiptDelaySeconds || 10);
    const input = document.getElementById("admin-special-day-image-file");
    if (input) input.value = "";
    adminSpecialDayImage = { url: value.arImageUrl || "", publicId: value.arImagePublicId || "" };
    updateAdminSpecialDayImagePreview(adminSpecialDayImage.url);
    setAdminSpecialDayStatus(`${date} 설정을 수정하고 있습니다.`);
    document.getElementById("admin-special-day-management")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
}

function renderAdminSpecialDaySettings() {
    const target = document.getElementById("admin-special-day-list");
    if (!target) return;
    const items = Object.entries(specialDaySettingsState || {}).sort(([a], [b]) => a.localeCompare(b));
    target.innerHTML = items.length ? items.map(([date, item]) => {
        const features = [item.arPauseEnabled ? "AR 예약 중단" : "", item.visitReceiptEnabled ? `방문 확인 ${item.visitReceiptDelaySeconds || 10}초` : ""].filter(Boolean).join(" · ");
        return `<article class="admin-record-card"><div class="admin-record-card-main">${item.arImageUrl ? `<img class="admin-special-day-list-image" src="${escapeHtml(item.arImageUrl)}" alt="">` : ""}<div><strong>${escapeHtml(date)} · ${escapeHtml(features || "사용 기능 없음")}</strong><span>${escapeHtml(item.arTitle || item.visitReceiptTitle || "특별 운영일")}</span></div></div><div class="admin-record-card-actions"><button type="button" class="admin-secondary-button" onclick="selectAdminSpecialDaySetting('${escapeHtml(date)}')">수정</button><button type="button" class="admin-secondary-button admin-danger-button" onclick="deleteAdminSpecialDaySetting('${escapeHtml(date)}')">삭제</button></div></article>`;
    }).join("") : '<p class="admin-inline-status">등록된 특별 운영일 화면이 없습니다.</p>';
}

async function loadAdminSpecialDaySettings() {
    if (!isAdminUser) return false;
    const snapshot = await db.ref("specialDaySettings").once("value");
    specialDaySettingsState = snapshot.val() || {};
    renderAdminSpecialDaySettings();
    return true;
}

async function saveAdminSpecialDaySetting() {
    if (!isAdminUser) return false;
    const date = document.getElementById("admin-special-day-date")?.value;
    const arPauseEnabled = document.getElementById("admin-special-day-ar-enabled")?.checked === true;
    const visitReceiptEnabled = document.getElementById("admin-special-day-visit-enabled")?.checked === true;
    const arTitle = document.getElementById("admin-special-day-ar-title")?.value.trim() || "";
    const arMessage = document.getElementById("admin-special-day-ar-message")?.value.trim() || "";
    const visitReceiptTitle = document.getElementById("admin-special-day-visit-title")?.value.trim() || "";
    const visitReceiptMessage = document.getElementById("admin-special-day-visit-message")?.value.trim() || "";
    const visitReceiptDelaySeconds = Number(document.getElementById("admin-special-day-visit-delay")?.value);
    const imageFile = document.getElementById("admin-special-day-image-file")?.files?.[0];
    if (!isValidDateKey(date) || (!arPauseEnabled && !visitReceiptEnabled)) {
        showMessage("적용 날짜와 사용할 기능을 하나 이상 선택해 주세요.");
        return false;
    }
    if ((arPauseEnabled && (!arTitle || !arMessage)) || (visitReceiptEnabled && (!visitReceiptTitle || !visitReceiptMessage))) {
        showMessage("사용할 화면의 제목과 안내 문구를 입력해 주세요.");
        return false;
    }
    if (![3, 5, 10, 15, 20, 30].includes(visitReceiptDelaySeconds)) return false;

    const saveButton = document.getElementById("admin-special-day-save");
    if (saveButton) saveButton.disabled = true;
    setAdminSpecialDayStatus(imageFile ? "포스터를 업로드하고 있습니다…" : "특별 운영일을 저장하고 있습니다…");
    try {
        let nextImage = { ...adminSpecialDayImage };
        if (imageFile) {
            if (typeof tvUploadToCloudinary !== "function") throw new Error("IMAGE_UPLOAD_UNAVAILABLE");
            const uploaded = await tvUploadToCloudinary(imageFile, SPECIAL_DAY_IMAGE_FOLDER);
            nextImage = { url: uploaded.secure_url, publicId: uploaded.public_id };
        }
        const value = {
            arPauseEnabled, arTitle, arMessage,
            arImageUrl: nextImage.url || "", arImagePublicId: nextImage.publicId || "",
            visitReceiptEnabled, visitReceiptTitle, visitReceiptMessage, visitReceiptDelaySeconds,
            updatedBy: "admin", updatedAt: firebase.database.ServerValue.TIMESTAMP
        };
        const auditKey = db.ref("adminAudit").push().key;
        await db.ref().update({
            [`specialDaySettings/${date}`]: value,
            [`adminAudit/${auditKey}`]: adminAuditEntry("special_day", "settings", date, specialDaySettingsState?.[date] || null, value)
        });
        specialDaySettingsState[date] = value;
        adminSpecialDayImage = nextImage;
        const input = document.getElementById("admin-special-day-image-file");
        if (input) input.value = "";
        updateAdminSpecialDayImagePreview(nextImage.url);
        renderAdminSpecialDaySettings();
        updateSpecialDayPublicUi(new Date());
        setAdminSpecialDayStatus(`${date} 특별 운영일을 저장했습니다.`);
        showMessage("특별 운영일 화면을 저장했습니다.", "success");
        return true;
    } catch (error) {
        logError("admin-special-day-save", error);
        setAdminSpecialDayStatus("저장하지 못했습니다. 이미지와 네트워크 상태를 확인해 주세요.");
        showMessage("특별 운영일 화면을 저장하지 못했습니다.");
        return false;
    } finally {
        if (saveButton) saveButton.disabled = false;
    }
}

async function deleteAdminSpecialDaySetting(date) {
    if (!isAdminUser || !specialDaySettingsState?.[date]) return false;
    if (!window.confirm(`${date} 특별 운영일 화면을 삭제하시겠습니까?\n\n업로드한 Cloudinary 원본 이미지는 자동 삭제되지 않습니다.`)) return false;
    const before = specialDaySettingsState[date];
    const auditKey = db.ref("adminAudit").push().key;
    await db.ref().update({
        [`specialDaySettings/${date}`]: null,
        [`adminAudit/${auditKey}`]: adminAuditEntry("special_day", "settings", date, before, null)
    });
    delete specialDaySettingsState[date];
    renderAdminSpecialDaySettings();
    updateSpecialDayPublicUi(new Date());
    if (document.getElementById("admin-special-day-date")?.value === date) resetAdminSpecialDayForm();
    showMessage("특별 운영일 화면을 삭제했습니다.", "success");
    return true;
}

function initializeAdminSpecialDayUi() {
    const dateInput = document.getElementById("admin-special-day-date");
    if (dateInput && !dateInput.value) resetAdminSpecialDayForm();
    renderAdminSpecialDaySettings();
}

Object.assign(window, {
    isSpecialDayArPaused,
    updateSpecialDayPublicUi,
    subscribeSpecialDaySettings,
    showSpecialVisitCompletion,
    closeSpecialVisitCompletion,
    previewAdminSpecialDayImage,
    clearAdminSpecialDayImage,
    resetAdminSpecialDayForm,
    selectAdminSpecialDaySetting,
    loadAdminSpecialDaySettings,
    saveAdminSpecialDaySetting,
    deleteAdminSpecialDaySetting,
    initializeAdminSpecialDayUi,
    renderAdminSpecialDaySettings
});
})();
