let isAdminUser = false;
let adminLoginFailCount = 0;
let adminLoginLockedUntil = 0;
let adminIdleTimer = null;
let adminActivityWatchersInitialized = false;

const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
const ADMIN_LOGIN_LOCK_MS = 60 * 1000;
const ADMIN_IDLE_LOGOUT_MS = 30 * 60 * 1000;

function openPasswordModal() {
    if (isAdminUser) {
        enterAdminMode();
        return;
    }
    dom.passwordModal.classList.remove("hidden");
    dom.adminPasswordInput.value = "";
    dom.adminPasswordInput.focus();
    updateAdminLoginButtonState();
}

function closePasswordModal() {
    dom.passwordModal.classList.add("hidden");
}
//..
function updateAdminLoginButtonState() {
    const btn = dom.adminVerifyBtn;
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

    const password = dom.adminPasswordInput.value;
    if (!password) {
        showMessage("비밀번호를 입력해 주세요.");
        return;
    }

    try {
        const credential = await auth.signInWithEmailAndPassword(ADMIN_EMAIL, password);
        // Force the newly authenticated administrator token into the Firebase
        // client before opening admin-only tools such as TV settings.
        await credential.user.getIdToken(true);
        const tokenResult = await credential.user.getIdTokenResult();
        if (String(tokenResult.claims.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
            await auth.signOut();
            showMessage("관리자 권한이 없는 계정입니다.");
            return;
        }

        isAdminUser = true;
        adminLoginFailCount = 0;
        adminLoginLockedUntil = 0;

        closePasswordModal();
        subscribeVisitLogs();
        subscribeArLogsAll();
        enterAdminMode();
    } catch (e) {
        logError("verifyAdminPassword", e);
        adminLoginFailCount += 1;
        if (adminLoginFailCount >= ADMIN_LOGIN_MAX_ATTEMPTS) {
            adminLoginLockedUntil = Date.now() + ADMIN_LOGIN_LOCK_MS;
            adminLoginFailCount = 0;
        }
        showMessage("비밀번호가 틀렸습니다.");
        dom.adminPasswordInput.value = "";
        dom.adminPasswordInput.focus();
        updateAdminLoginButtonState();
    }
}

function enterAdminMode() {
    document.body.className = "pb-10 theme-admin";
    dom.mainTabs.classList.add("hidden");
    dom.sectionVisit.classList.add("hidden");
    dom.sectionAr.classList.add("hidden");
    dom.adminTabs.classList.remove("hidden");
    dom.sectionAdmin.classList.remove("hidden");
    dom.adminEntryBtn.classList.add("hidden");
    dom.exitAdminBtn.classList.remove("hidden");
    dom.mainContentContainer.classList.replace("max-w-xl", "max-w-6xl");
    if (typeof updateAttendanceEventBannerVisibility === "function") {
        updateAttendanceEventBannerVisibility();
    }
    updateAdminDashboard();
}

function exitAdmin() {
    dom.mainContentContainer.classList.replace("max-w-6xl", "max-w-xl");
    dom.adminTabs.classList.add("hidden");
    dom.sectionAdmin.classList.add("hidden");
    dom.exitAdminBtn.classList.add("hidden");
    dom.adminEntryBtn.classList.remove("hidden");

    unsubscribeVisitLogs();
    unsubscribeArLogsAll();
    isAdminUser = false;
    if (adminIdleTimer) {
        clearTimeout(adminIdleTimer);
        adminIdleTimer = null;
    }

    auth.signOut().catch((e) => logError("exitAdmin", e));

    switchTab("visit");
}

function resetAdminIdleTimeout() {}

function initializeAdminActivityWatchers() {
    adminActivityWatchersInitialized = true;
}

function restoreAdminSession(user) {
    if (!user || user.isAnonymous || String(user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        return false;
    }
    isAdminUser = true;
    subscribeVisitLogs();
    subscribeArLogsAll();
    enterAdminMode();
    return true;
}


function loadTvSettings() {
    db.ref("tvSettings").once("value").then((snapshot) => {
        const settings = snapshot.val() || {};
        const display = settings.display || {};
        document.querySelectorAll("#tv-display-options [data-tv-key]").forEach((input) => {
            input.checked = display[input.dataset.tvKey] !== false;
        });
        if (settings.slideInterval) document.getElementById("tv-slide-interval").value = String(settings.slideInterval);
    }).catch((error) => logError("loadTvSettings", error));
}

function saveTvSettings() {
    const display = {};
    document.querySelectorAll("#tv-display-options [data-tv-key]").forEach((input) => {
        display[input.dataset.tvKey] = input.checked;
    });
    const slideInterval = Number(document.getElementById("tv-slide-interval").value);
    db.ref("tvSettings").set({ display, slideInterval })
        .then(() => showMessage("TV 설정이 저장되었습니다.", "success"))
        .catch((error) => { logError("saveTvSettings", error); showMessage("TV 설정 저장 중 오류가 발생했습니다."); });
}

function openTvPreview() {
    window.open("./tv.html", "nchm-tv-preview", "noopener");
}
