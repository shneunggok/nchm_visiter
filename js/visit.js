let visitLogs = [];

async function saveVisitLogs(logDataList, preparedRequest) {
    const payload = {
        date: logDataList[0] && logDataList[0].date,
        logs: logDataList
    };
    const request = preparedRequest || await preparePersistentRequest("visit", payload);
    const claim = await claimIdempotentRequest(request);
    if (claim.status === "complete") return request;
    const ownerUid = auth.currentUser.uid;
    const createdAt = Number(claim.createdAt) || request.createdAt;
    const updates = {};
    logDataList.forEach((logData, index) => {
        updates[`visitLogs/${request.requestId}-${index}`] = {
            ...logData,
            requestId: request.requestId,
            payloadHash: request.payloadHash,
            ownerUid,
            createdAt
        };
    });
    updates[`requestClaims/${request.requestId}/status`] = "complete";
    updates[`requestClaims/${request.requestId}/completedAt`] = createdAt;
    try {
        await db.ref().update(updates);
    } catch (error) {
        if (await isRequestComplete(request)) return request;
        throw error;
    }
    if (typeof invalidateAdminStatsCache === "function") {
        invalidateAdminStatsCache("visit");
    }
    return request;
}

function subscribeVisitLogs() {
    return loadAdminLogPage("visit", { reset: true });
}

function unsubscribeVisitLogs() {
    cancelAdminLogLoads("visit");
}
