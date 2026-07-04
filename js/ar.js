let arLogs = [];
let arLogsToday = [];
let arLogsTodayQuery = null;
let arLogsAllQuery = null;

function saveArLog(logData) {
    return arLogsRef.push({
        ...logData,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    });
}

function reserveSlotAndSaveArLog(dateStr, timeSlot, logData) {
    const slotKey = createSlotKey(dateStr, timeSlot);
    const lockRef = arSlotLocksRef.child(slotKey);
    const logRef = arLogsRef.push();
    const fullLogData = {
        ...logData,
        slotKey,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    return lockRef.transaction((current) => {
        if (current === null) {
            return true;
        }
        return;
    }).then((result) => {
        if (!result.committed) {
            const err = new Error("SLOT_TAKEN");
            err.code = "SLOT_TAKEN";
            throw err;
        }
        return logRef.set(fullLogData).catch((err) => {
            lockRef.remove().catch((cleanupError) => {
                logError("reserveSlotAndSaveArLog-cleanup", cleanupError);
            });
            throw err;
        });
    });
}

function subscribeArLogsToday() {
    if (arLogsTodayQuery) arLogsTodayQuery.off();

    const todayStr = formatLocalDate(new Date());
    arLogsTodayQuery = arLogsRef.orderByChild("date").equalTo(todayStr);

    arLogsTodayQuery.on("value", (snapshot) => {
        arLogsToday = [];
        snapshot.forEach((child) => {
            arLogsToday.push({ _key: child.key, ...child.val() });
        });
        if (!dom.sectionAr.classList.contains("hidden")) {
            generateTimeSlots();
        }
    }, (error) => {
        logError("arLogsTodayQuery.on", error);
    });
}

function subscribeArLogsAll() {
    if (arLogsTodayQuery) {
        arLogsTodayQuery.off();
        arLogsTodayQuery = null;
    }
    if (arLogsAllQuery) {
        arLogsAllQuery.off();
    }

    arLogsAllQuery = arLogsRef.orderByChild("date");
    arLogsAllQuery.on("value", (snapshot) => {
        arLogs = [];
        snapshot.forEach((child) => {
            arLogs.push({ _key: child.key, ...child.val() });
        });
        updateAdminDashboard();
    }, (error) => {
        logError("arLogsAllQuery.on", error);
    });
}

function unsubscribeArLogsAll() {
    if (arLogsAllQuery) {
        arLogsAllQuery.off();
        arLogsAllQuery = null;
    }
    arLogs = [];
    subscribeArLogsToday();
}
