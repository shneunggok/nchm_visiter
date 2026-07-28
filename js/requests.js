const REQUEST_STORAGE_KEY = "nchm.pendingRequests.v1";
const REQUEST_MAX_AGE_MS = 15 * 60 * 1000;
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{20,80}$/;

function stableRequestJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableRequestJson).join(",")}]`;
    }
    if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map((key) =>
            `${JSON.stringify(key)}:${stableRequestJson(value[key])}`
        ).join(",")}}`;
    }
    return JSON.stringify(value);
}

async function hashRequestPayload(payload) {
    const serialized = stableRequestJson(payload);
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
        const bytes = new TextEncoder().encode(serialized);
        const digest = await window.crypto.subtle.digest("SHA-256", bytes);
        return Array.from(new Uint8Array(digest))
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
    }

    // Older kiosk browsers still receive a deterministic fingerprint. The
    // random request ID remains the security boundary; this is only a
    // compatibility fallback for matching a locally pending request.
    let hash = 2166136261;
    for (let index = 0; index < serialized.length; index += 1) {
        hash ^= serialized.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `fallback-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function generateRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID().replace(/-/g, "");
    }
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
        const bytes = new Uint8Array(24);
        window.crypto.getRandomValues(bytes);
        return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    throw new Error("SECURE_REQUEST_ID_UNAVAILABLE");
}

function readPendingRequests() {
    try {
        const value = JSON.parse(window.localStorage.getItem(REQUEST_STORAGE_KEY) || "[]");
        if (!Array.isArray(value)) return [];
        const cutoff = Date.now() - REQUEST_MAX_AGE_MS;
        return value.filter((item) => item && item.createdAt >= cutoff
            && REQUEST_ID_PATTERN.test(item.requestId || ""));
    } catch (error) {
        logError("pending-requests-read", error);
        return [];
    }
}

function writePendingRequests(requests) {
    try {
        window.localStorage.setItem(REQUEST_STORAGE_KEY, JSON.stringify(requests.slice(-10)));
    } catch (error) {
        logError("pending-requests-write", error);
    }
}

async function preparePersistentRequest(type, payload) {
    const payloadHash = await hashRequestPayload(payload);
    const createOrReuse = () => {
        const requests = readPendingRequests();
        const existing = requests.find((item) => item.type === type && item.payloadHash === payloadHash);
        if (existing) return existing;

        const request = {
            requestId: generateRequestId(),
            payloadHash,
            type,
            payload,
            createdAt: Date.now()
        };
        requests.push(request);
        writePendingRequests(requests);
        return request;
    };

    if (window.navigator && window.navigator.locks) {
        return window.navigator.locks.request("nchm-pending-request", createOrReuse);
    }
    return createOrReuse();
}

function completePersistentRequest(requestId) {
    writePendingRequests(readPendingRequests().filter((item) => item.requestId !== requestId));
}

async function claimIdempotentRequest(request) {
    const user = auth.currentUser;
    if (!user || !request || !REQUEST_ID_PATTERN.test(request.requestId)
        || typeof request.payloadHash !== "string") {
        const error = new Error("INVALID_REQUEST");
        error.code = "INVALID_REQUEST";
        throw error;
    }

    const claimRef = db.ref(`requestClaims/${request.requestId}`);
    let result;
    try {
        result = await claimRef.transaction((current) => {
            if (current === null) {
                return {
                    ownerUid: user.uid,
                    type: request.type,
                    payloadHash: request.payloadHash,
                    date: request.payload.date,
                    status: "pending",
                    createdAt: firebase.database.ServerValue.TIMESTAMP
                };
            }
            if (current.ownerUid === user.uid
                && current.type === request.type
                && current.payloadHash === request.payloadHash) {
                return current;
            }
            return;
        }, undefined, false);
    } catch (error) {
        if (String(error?.code || error?.message || "").toLowerCase().includes("permission_denied")) {
            const conflict = new Error("REQUEST_ID_CONFLICT");
            conflict.code = "REQUEST_ID_CONFLICT";
            conflict.cause = error;
            throw conflict;
        }
        throw error;
    }

    if (!result.committed) {
        const error = new Error("REQUEST_ID_CONFLICT");
        error.code = "REQUEST_ID_CONFLICT";
        throw error;
    }
    // A transaction snapshot can contain the client's estimated resolution of
    // ServerValue.TIMESTAMP. Read the committed claim once so later Rules can
    // compare the log timestamp with the authoritative server value exactly.
    const committedSnapshot = await claimRef.once("value");
    const committedClaim = committedSnapshot.val();
    if (!committedClaim
        || committedClaim.ownerUid !== user.uid
        || committedClaim.type !== request.type
        || committedClaim.payloadHash !== request.payloadHash) {
        const error = new Error("REQUEST_ID_CONFLICT");
        error.code = "REQUEST_ID_CONFLICT";
        throw error;
    }
    return committedClaim;
}

function requestSaveErrorMessage(error) {
    const code = String(error?.code || error?.message || "").toLowerCase();
    if (code.includes("request_id_conflict")) {
        return "이미 처리된 요청입니다. 새로고침 후 다시 시도해 주세요.";
    }
    if (["network", "disconnected", "unavailable", "timeout"].some((value) => code.includes(value))) {
        return "네트워크 연결이 불안정합니다. 연결을 확인한 후 다시 시도해 주세요.";
    }
    return "저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

async function isRequestComplete(request) {
    try {
        const snapshot = await db.ref(`requestClaims/${request.requestId}`).once("value");
        const claim = snapshot.val();
        return Boolean(claim
            && claim.status === "complete"
            && claim.ownerUid === auth.currentUser?.uid
            && claim.type === request.type
            && claim.payloadHash === request.payloadHash);
    } catch (error) {
        logError("request-claim-check", error);
        return false;
    }
}

async function resumePendingRequests() {
    const requests = readPendingRequests();
    for (const request of requests) {
        try {
            if (request.type === "visit" && request.payload && Array.isArray(request.payload.logs)) {
                await saveVisitLogs(request.payload.logs, request);
            } else if (request.type === "ar" && request.payload && request.payload.logData) {
                await reserveSlotAndSaveArLog(
                    request.payload.date,
                    request.payload.timeSlot,
                    request.payload.logData,
                    request
                );
            } else {
                completePersistentRequest(request.requestId);
                continue;
            }
            completePersistentRequest(request.requestId);
            showMessage("중단되었던 저장 요청을 안전하게 완료했습니다.", "success");
        } catch (error) {
            logError(`resume-${request.type}`, error);
        }
    }
}
