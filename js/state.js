window.NCHM = window.NCHM || {};

window.NCHM.state = {
    visitLogs: [],
    arLogs: [],
    arLogsToday: [],
    currentFilter: "all",
    isSubmittingVisit: false,
    isSubmittingAr: false,
    visitCount: 1,
    adminLoginFailCount: 0,
    adminLoginLockedUntil: 0,
    subscriptions: {
        visitLogsBound: null,
        arLogsAllBound: null,
        arLogsTodayQuery: null
    }
};
