window.NCHM = window.NCHM || {};

(function registerUtils(namespace) {
    const { limits, adminEmail } = namespace.config;
    let toastTimer = null;

    function escapeHtml(value) {
        const div = document.createElement("div");
        div.textContent = value === null || value === undefined ? "" : String(value);
        return div.innerHTML;
    }

    function logError(context, error) {
        const code = error && error.code ? error.code : "unknown_error";
        console.error(`[nchm:${context}]`, code, error);
    }

    function sanitizeCsvField(value) {
        const str = value === null || value === undefined ? "" : String(value);
        return /^[=+\-@]/.test(str) ? `'${str}` : str;
    }

    function formatLocalDate(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function formatLocalTime(date = new Date()) {
        return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
    }

    function showMessage(message, type = "error") {
        const box = document.getElementById("custom-alert");
        if (!box) return;

        if (toastTimer) {
            clearTimeout(toastTimer);
        }

        box.innerText = message;
        box.className = "";

        if (type === "success") box.classList.add("success");
        if (type === "info") box.classList.add("info");

        box.style.display = "block";

        const duration = Math.min(limits.toastMaxMs, Math.max(limits.toastMinMs, message.length * 60));
        toastTimer = setTimeout(() => {
            box.style.display = "none";
            box.className = "";
            toastTimer = null;
        }, duration);
    }

    function refreshIcons() {
        if (window.lucide) {
            lucide.createIcons();
        }
    }

    function generateClientRequestId() {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            return window.crypto.randomUUID();
        }

        return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function withRetry(task, options = {}) {
        const attempts = options.attempts || limits.retryAttempts;
        const baseDelayMs = options.baseDelayMs || limits.retryDelayMs;
        let lastError = null;

        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            try {
                return await task(attempt);
            } catch (error) {
                lastError = error;
                if (attempt === attempts || options.shouldRetry === false || (typeof options.shouldRetry === "function" && !options.shouldRetry(error))) {
                    throw error;
                }

                await sleep(baseDelayMs * attempt);
            }
        }

        throw lastError;
    }

    function makeSlotId(date, timeSlot) {
        return `${date}_${timeSlot}`.replace(/[.#$\[\]/]/g, "-");
    }

    function getLockExpiresAt(now = Date.now()) {
        return now + limits.lockTtlMs;
    }

    function isExpiredLock(lockData, now = Date.now()) {
        return !!(lockData && typeof lockData.expiresAt === "number" && lockData.expiresAt <= now);
    }

    function isAdminEmail(email) {
        return email === adminEmail;
    }

    function getCurrentUserEmail() {
        return namespace.firebase.auth.currentUser?.email || "";
    }

    namespace.utils = {
        escapeHtml,
        logError,
        sanitizeCsvField,
        formatLocalDate,
        formatLocalTime,
        showMessage,
        refreshIcons,
        generateClientRequestId,
        withRetry,
        makeSlotId,
        getLockExpiresAt,
        isExpiredLock,
        isAdminEmail,
        getCurrentUserEmail
    };
})(window.NCHM);
