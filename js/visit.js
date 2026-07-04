let visitLogs = [];
let visitLogsQuery = null;

function saveVisitLog(logData) {
    return visitLogsRef.push({
        ...logData,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    });
}

function subscribeVisitLogs() {
    if (visitLogsQuery) {
        visitLogsQuery.off();
    }

    visitLogsQuery = visitLogsRef.orderByChild("date");
    visitLogsQuery.on("value", (snapshot) => {
        visitLogs = [];
        snapshot.forEach((child) => {
            visitLogs.push({ _key: child.key, ...child.val() });
        });
        updateAdminDashboard();
    }, (error) => {
        logError("visitLogsQuery.on", error);
    });
}

function unsubscribeVisitLogs() {
    if (visitLogsQuery) {
        visitLogsQuery.off();
        visitLogsQuery = null;
    }
    visitLogs = [];
}
