let isAdminUser = false;
let adminLoginFailCount = 0;
let adminLoginLockedUntil = 0;
let adminIdleTimer = null;
let adminActivityWatchersInitialized = false;
let adminLoginUnlockTimer = null;
let isAdminLoginPending = false;
let adminExitPromise = null;
let adminAuthTransitionInProgress = false;

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
        window.clearTimeout(adminLoginUnlockTimer);
        adminLoginUnlockTimer = window.setTimeout(updateAdminLoginButtonState, remainingMs + 50);
    } else {
        btn.disabled = false;
        window.clearTimeout(adminLoginUnlockTimer);
        adminLoginUnlockTimer = null;
    }
}

async function verifyAdminPassword() {
    if (isAdminLoginPending) return;
    if (Date.now() < adminLoginLockedUntil) {
        updateAdminLoginButtonState();
        return;
    }

    const password = dom.adminPasswordInput.value;
    if (!password) {
        showMessage("비밀번호를 입력해 주세요.");
        return;
    }

    isAdminLoginPending = true;
    dom.adminVerifyBtn.disabled = true;
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
        initializeAdminActivityWatchers();
        resetAdminIdleTimeout();
    } catch (e) {
        logError("verifyAdminPassword", e);
        const failedCredentialCodes = [
            "auth/invalid-credential",
            "auth/invalid-login-credentials",
            "auth/wrong-password",
            "auth/user-not-found"
        ];
        if (failedCredentialCodes.includes(e && e.code)) {
            adminLoginFailCount += 1;
            if (adminLoginFailCount >= ADMIN_LOGIN_MAX_ATTEMPTS) {
                adminLoginLockedUntil = Date.now() + ADMIN_LOGIN_LOCK_MS;
                adminLoginFailCount = 0;
            }
            showMessage("비밀번호가 틀렸습니다.");
            dom.adminPasswordInput.value = "";
            dom.adminPasswordInput.focus();
        } else {
            showMessage("로그인 요청을 처리하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
        }
    } finally {
        isAdminLoginPending = false;
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

function isAdminAuthTransitioning() {
    return adminAuthTransitionInProgress;
}

function finishAdminExitUi() {
    dom.mainContentContainer.classList.replace("max-w-6xl", "max-w-xl");
    dom.adminTabs.classList.add("hidden");
    dom.sectionAdmin.classList.add("hidden");
    dom.exitAdminBtn.classList.add("hidden");
    dom.adminEntryBtn.classList.remove("hidden");
    switchTab("visit");
}

async function runAdminExit() {
    adminAuthTransitionInProgress = true;
    setArAuthTransitioning(true);

    unsubscribeVisitLogs();
    unsubscribeArLogsToday();
    unsubscribeArLogsAll();
    if (typeof cancelAdminStatisticsLoads === "function") {
        cancelAdminStatisticsLoads();
    }
    if (typeof cancelAdminExportLoads === "function") {
        cancelAdminExportLoads();
    }
    isAdminUser = false;
    if (adminIdleTimer) {
        clearTimeout(adminIdleTimer);
        adminIdleTimer = null;
    }
    if (typeof unloadTvManagement === "function") {
        unloadTvManagement();
    }

    try {
        await auth.signOut();
        const credential = await auth.signInAnonymously();
        const anonymousUser = credential?.user || auth.currentUser;
        if (!anonymousUser || !anonymousUser.isAnonymous) {
            throw new Error("ANONYMOUS_AUTH_RECOVERY_FAILED");
        }

        setArAuthTransitioning(false);
        subscribeArLogsToday();
        finishAdminExitUi();
        return true;
    } catch (error) {
        logError("exitAdmin-auth-recovery", error);
        showMessage("사용자 인증에 실패했습니다. 새로고침 후 다시 시도해 주세요.");
        finishAdminExitUi();
        return false;
    } finally {
        setArAuthTransitioning(false);
        adminAuthTransitionInProgress = false;
    }
}

async function exitAdmin() {
    if (adminExitPromise) return adminExitPromise;
    adminExitPromise = runAdminExit();
    try {
        return await adminExitPromise;
    } finally {
        adminExitPromise = null;
    }
}

function resetAdminIdleTimeout() {
    if (!isAdminUser) return;
    window.clearTimeout(adminIdleTimer);
    adminIdleTimer = window.setTimeout(async () => {
        if (!isAdminUser) return;
        showMessage("관리자 세션이 자동으로 종료되었습니다.", "info");
        await exitAdmin();
    }, ADMIN_IDLE_LOGOUT_MS);
}

function initializeAdminActivityWatchers() {
    if (adminActivityWatchersInitialized) return;
    adminActivityWatchersInitialized = true;
    const handler = () => resetAdminIdleTimeout();
    ["pointerdown", "keydown"].forEach((eventName) => {
        document.addEventListener(eventName, handler, { passive: true });
    });
}

function restoreAdminSession(user) {
    if (!user || user.isAnonymous || String(user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        return false;
    }
    isAdminUser = true;
    subscribeVisitLogs();
    subscribeArLogsAll();
    enterAdminMode();
    initializeAdminActivityWatchers();
    resetAdminIdleTimeout();
    return true;
}
