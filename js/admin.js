window.NCHM = window.NCHM || {};

(function registerAdmin(namespace) {
    const { auth, refs, serverTimestamp } = namespace.firebase;
    const { state, config, utils } = namespace;

    function openPasswordModal() {
        document.getElementById("password-modal")?.classList.remove("hidden");
        const input = document.getElementById("admin-password-input");
        if (input) {
            input.value = "";
            input.focus();
        }
        updateAdminLoginButtonState();
    }

    function closePasswordModal() {
        document.getElementById("password-modal")?.classList.add("hidden");
    }

    function updateAdminLoginButtonState() {
        const button = document.getElementById("admin-verify-btn");
        if (!button) return;

        const remainingMs = state.adminLoginLockedUntil - Date.now();
        if (remainingMs > 0) {
            button.disabled = true;
            utils.showMessage(`로그인 시도가 너무 많습니다. ${Math.ceil(remainingMs / 1000)}초 후 다시 시도해 주세요.`);
        } else {
            button.disabled = false;
        }
    }

    function subscribeVisitLogs() {
        if (state.subscriptions.visitLogsBound) {
            refs.visitLogs.off("value", state.subscriptions.visitLogsBound);
        }

        const onValue = (snapshot) => {
            state.visitLogs = [];
            snapshot.forEach((child) => {
                state.visitLogs.push({ _key: child.key, ...child.val() });
            });
            namespace.statistics.updateAdminDashboard();
        };

        state.subscriptions.visitLogsBound = onValue;
        refs.visitLogs.on("value", onValue, (error) => utils.logError("subscribeVisitLogs", error));
    }

    async function ensureAnonymousSession() {
        if (auth.currentUser?.isAnonymous) return;
        await auth.signInAnonymously();
    }

    async function verifyAdminPassword() {
        if (Date.now() < state.adminLoginLockedUntil) {
            updateAdminLoginButtonState();
            return;
        }

        const password = document.getElementById("admin-password-input")?.value || "";
        if (!password) {
            utils.showMessage("비밀번호를 입력해 주세요.");
            return;
        }

        try {
            const credential = await auth.signInWithEmailAndPassword(config.adminEmail, password);
            const tokenResult = await credential.user.getIdTokenResult();

            if (!utils.isAdminEmail(tokenResult.claims.email || credential.user.email || "")) {
                await auth.signOut();
                await ensureAnonymousSession();
                utils.showMessage("관리자 권한이 없는 계정입니다.");
                return;
            }

            state.adminLoginFailCount = 0;
            state.adminLoginLockedUntil = 0;

            closePasswordModal();
            subscribeVisitLogs();
            namespace.reservation.subscribeArLogsAll();
            namespace.ui.enterAdminMode();
        } catch (error) {
            utils.logError("verifyAdminPassword", error);
            state.adminLoginFailCount += 1;

            if (state.adminLoginFailCount >= config.limits.adminLoginMaxAttempts) {
                state.adminLoginFailCount = 0;
                state.adminLoginLockedUntil = Date.now() + config.limits.adminLoginLockMs;
            }

            const input = document.getElementById("admin-password-input");
            if (input) {
                input.value = "";
                input.focus();
            }

            let errorMessage = "비밀번호가 틀렸습니다.";
            if (error.code === "auth/user-not-found") {
                errorMessage = "관리자 계정을 찾을 수 없습니다.";
            } else if (error.code === "auth/too-many-requests") {
                errorMessage = "로그인이 너무 많이 시도되었습니다. 잠시 후 다시 시도해 주세요.";
            }

            utils.showMessage(errorMessage);
            updateAdminLoginButtonState();
        }
    }

    async function exitAdmin() {
        if (state.subscriptions.visitLogsBound) {
            refs.visitLogs.off("value", state.subscriptions.visitLogsBound);
            state.subscriptions.visitLogsBound = null;
        }

        state.visitLogs = [];
        namespace.reservation.unsubscribeArLogsAll();

        try {
            await auth.signOut();
            await ensureAnonymousSession();
            namespace.reservation.subscribeArLogsToday();
        } catch (error) {
            utils.logError("exitAdmin", error);
        }

        namespace.ui.exitAdminMode();
    }

    async function deleteVisitLog(logKey) {
        const log = state.visitLogs.find((item) => item._key === logKey);
        if (!log) {
            utils.showMessage("이미 삭제된 방문 기록입니다.", "info");
            return;
        }

        const auditLogId = refs.auditLogs.push().key;
        const updates = {};

        updates[`${config.dbPaths.visitLogs}/${logKey}`] = null;
        updates[`${config.dbPaths.auditLogs}/${auditLogId}`] = {
            action: "DELETE_VISIT_LOG",
            actorEmail: utils.getCurrentUserEmail(),
            targetKey: logKey,
            snapshot: log,
            createdAt: serverTimestamp
        };

        try {
            // 방문 기록 삭제와 감사 로그를 같은 update에 넣어 관리 행위 추적을 남깁니다.
            await refs.root.update(updates);
            utils.showMessage("삭제되었습니다.", "info");
        } catch (error) {
            utils.logError("deleteVisitLog", error);
            utils.showMessage(config.messages.genericDeleteError);
        }
    }

    namespace.admin = {
        openPasswordModal,
        closePasswordModal,
        verifyAdminPassword,
        exitAdmin,
        deleteVisitLog,
        subscribeVisitLogs,
        ensureAnonymousSession
    };
})(window.NCHM);
