let arLogs = [];
let arLogsToday = [];
let arLogsTodayQuery = null;

async function reserveSlotAndSaveArLog(dateStr, timeSlot, logData, preparedRequest) {
    const payload = { date: dateStr, timeSlot, logData };
    const request = preparedRequest || await preparePersistentRequest("ar", payload);
    const claim = await claimIdempotentRequest(request);
    if (claim.status === "complete") return request;
    const ownerUid = auth.currentUser.uid;
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

    const lockResult = await lockRef.transaction((current) => {
        if (current === null) {
            return request.requestId;
        }
        if (current === request.requestId) return current;
        return;
    }, undefined, false);

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
    if (arLogsTodayQuery) arLogsTodayQuery.off();

    const todayStr = formatLocalDate(new Date());
    arLogsTodayQuery = arSlotLocksRef.orderByKey()
        .startAt(`${todayStr}_`)
        .endAt(`${todayStr}_\uf8ff`)
        .limitToLast(50);

    arLogsTodayQuery.on("value", (snapshot) => {
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
        showMessage("예약 현황을 불러오지 못했습니다. 네트워크 연결 후 다시 시도해 주세요.");
    });
}

function subscribeArLogsAll() {
    if (arLogsTodayQuery) {
        arLogsTodayQuery.off();
        arLogsTodayQuery = null;
    }
    return loadAdminLogPage("ar", { reset: true });
}

function unsubscribeArLogsAll() {
    cancelAdminLogLoads("ar");
    subscribeArLogsToday();
}
