let arLogs = [];
let arLogsToday = [];
let arLogsTodayQuery = null;
let arAuthTransitionInProgress = false;
let arAnonymousAuthPromise = null;

function setArAuthTransitioning(isTransitioning) {
    arAuthTransitionInProgress = Boolean(isTransitioning);
}

function unsubscribeArLogsToday() {
    if (!arLogsTodayQuery) return;
    arLogsTodayQuery.off();
    arLogsTodayQuery = null;
}

function getArReservationReadErrorType(error) {
    const code = String(error?.code || error?.message || "").toLowerCase();
    if (code.includes("permission_denied")
        || code.includes("permission-denied")
        || code.includes("unauthenticated")) {
        return "auth";
    }
    if (["network", "disconnected", "unavailable", "timeout", "offline"]
        .some((value) => code.includes(value))) {
        return "network";
    }
    return "network";
}

function getArReservationSaveErrorType(error) {
    const code = String(error?.code || error?.message || "").toLowerCase();
    if (code.includes("slot_taken")) return "slot";
    if (code.includes("auth_required")
        || code.includes("unauthenticated")) {
        return "auth";
    }
    if (code.includes("permission_denied") || code.includes("permission-denied")) {
        return !auth.currentUser || !auth.currentUser.isAnonymous ? "auth" : "unexpected";
    }
    if (["network", "disconnected", "unavailable", "timeout", "offline"]
        .some((value) => code.includes(value))) {
        return "network";
    }
    return "unexpected";
}

function arReservationSaveErrorMessage(error) {
    const type = getArReservationSaveErrorType(error);
    if (type === "slot") {
        return "방금 다른 이용자가 같은 시간을 먼저 예약했습니다. 다른 시간을 선택해 주세요.";
    }
    if (type === "auth") {
        return "사용자 인증에 실패했습니다. 새로고침 후 다시 시도해 주세요.";
    }
    if (type === "network") {
        return "네트워크 연결을 확인한 후 다시 시도해 주세요.";
    }
    return "예약 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

function markArReservationError(error, stage) {
    if (error && typeof error === "object" && !error.arStage) {
        error.arStage = stage;
    }
    return error;
}

async function ensureAnonymousArAuth() {
    if (auth.currentUser?.isAnonymous) return auth.currentUser;

    if (auth.currentUser && !auth.currentUser.isAnonymous) {
        const error = new Error("AUTH_REQUIRED");
        error.code = "AUTH_REQUIRED";
        error.arStage = "auth";
        throw error;
    }

    if (!arAnonymousAuthPromise) {
        arAnonymousAuthPromise = auth.signInAnonymously()
            .then((credential) => {
                const user = credential?.user || auth.currentUser;
                if (!user || !user.isAnonymous) {
                    const error = new Error("AUTH_REQUIRED");
                    error.code = "AUTH_REQUIRED";
                    throw error;
                }
                return user;
            })
            .catch((error) => {
                throw markArReservationError(error, "auth");
            })
            .finally(() => {
                arAnonymousAuthPromise = null;
            });
    }
    return arAnonymousAuthPromise;
}

async function reserveSlotAndSaveArLog(dateStr, timeSlot, logData, preparedRequest) {
    const anonymousUser = await ensureAnonymousArAuth();
    const payload = { date: dateStr, timeSlot, logData };
    const request = preparedRequest || await preparePersistentRequest("ar", payload);
    let claim;
    try {
        claim = await claimIdempotentRequest(request);
    } catch (error) {
        throw markArReservationError(error, "requestClaims");
    }
    if (claim.status === "complete") return request;
    const ownerUid = anonymousUser.uid;
    const createdAt = Number(claim.createdAt) || request.createdAt;
    const slotKey = createSlotKey(dateStr, timeSlot);
    const lockRef = arSlotLocksRef.child(slotKey);
    const fullLogData = {
        ...logData,
        slotKey,
        requestId: request.requestId,
        payloadHash: request.payloadHash,
        ownerUid,
        createdAt
    };

    let lockResult;
    try {
        lockResult = await lockRef.transaction((current) => {
            if (current === null) {
                return request.requestId;
            }
            if (current === request.requestId) return current;
            return;
        }, undefined, false);
    } catch (error) {
        throw markArReservationError(error, "arSlotLocks");
    }

    if (!lockResult.committed) {
        const error = new Error("SLOT_TAKEN");
        error.code = "SLOT_TAKEN";
        throw error;
    }

    const updates = {
        [`arLogs/${request.requestId}`]: fullLogData,
        [`arSlotLocks/${slotKey}`]: request.requestId,
        [`requestClaims/${request.requestId}/status`]: "complete",
        [`requestClaims/${request.requestId}/completedAt`]: createdAt
    };

    try {
        await db.ref().update(updates);
    } catch (error) {
        markArReservationError(error, "atomicSave");
        if (await isRequestComplete(request)) return request;
        try {
            await lockRef.transaction((current) => current === request.requestId ? null : current);
        } catch (cleanupError) {
            logError("reserveSlotAndSaveArLog-cleanup", cleanupError);
        }
        throw error;
    }
    if (typeof invalidateAdminStatsCache === "function") {
        invalidateAdminStatsCache("ar");
    }
    return request;
}

function subscribeArLogsToday() {
    unsubscribeArLogsToday();
    if (!auth.currentUser || !auth.currentUser.isAnonymous) {
        logError("arLogsTodayQuery.auth", new Error("ANONYMOUS_AUTH_REQUIRED"));
        return false;
    }

    const todayStr = formatLocalDate(new Date());
    const query = arSlotLocksRef.orderByKey()
        .startAt(`${todayStr}_`)
        .endAt(`${todayStr}_\uf8ff`)
        .limitToLast(50);
    arLogsTodayQuery = query;

    query.on("value", (snapshot) => {
        if (arLogsTodayQuery !== query) return;
        arLogsToday = [];
        snapshot.forEach((child) => {
            const timeSlot = String(child.key || "").slice(todayStr.length + 1);
            if (/^([01][0-9]|2[0-3]):(00|30)$/.test(timeSlot)) {
                arLogsToday.push({ _key: child.key, date: todayStr, timeSlot });
            }
        });
        if (!dom.sectionAr.classList.contains("hidden")) {
            generateTimeSlots();
        }
    }, (error) => {
        logError("arLogsTodayQuery.on", error);
        if (arLogsTodayQuery !== query || arAuthTransitionInProgress) return;
        arLogsTodayQuery = null;
        if (getArReservationReadErrorType(error) === "auth") {
            showMessage("사용자 인증에 실패했습니다. 새로고침 후 다시 시도해 주세요.");
            return;
        }
        showMessage("예약 현황을 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.");
    });
    return true;
}

function subscribeArLogsAll() {
    unsubscribeArLogsToday();
    if (typeof subscribeAdminArTodaySchedule === "function") {
        subscribeAdminArTodaySchedule();
    }
    return loadAdminLogPage("ar", { reset: true });
}

function unsubscribeArLogsAll() {
    cancelAdminLogLoads("ar");
    if (typeof unsubscribeAdminArTodaySchedule === "function") {
        unsubscribeAdminArTodaySchedule();
    }
}
