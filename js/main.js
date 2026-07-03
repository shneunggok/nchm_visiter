window.NCHM = window.NCHM || {};

(function bootstrapMain(namespace) {
    const { utils } = namespace;

    function submitForm(type) {
        if (type === "visit") {
            return namespace.visit.submitVisitRegistration();
        }

        return namespace.reservation.submitReservation();
    }

    function initializePage() {
        const now = new Date();
        namespace.ui.setCurrentDateDisplay(now);

        const startDate = document.getElementById("start-date");
        const endDate = document.getElementById("end-date");
        if (startDate) startDate.value = utils.formatLocalDate(now);
        if (endDate) endDate.value = utils.formatLocalDate(now);

        namespace.statistics.initFilterOptions();
        namespace.visit.renderVisitUserForms();
        namespace.reservation.addUserForm();
        utils.refreshIcons();
        namespace.visit.focusFirstVisitInput();

        namespace.admin.ensureAnonymousSession()
            .catch((error) => utils.logError("ensureAnonymousSession", error))
            .finally(() => {
                namespace.reservation.subscribeArLogsToday();
                namespace.reservation.cleanupExpiredSlotLocks();
            });
    }

    // 기존 inline onclick HTML을 유지하기 위해 전역 브리지를 제공합니다.
    window.openPasswordModal = namespace.admin.openPasswordModal;
    window.closePasswordModal = namespace.admin.closePasswordModal;
    window.verifyAdminPassword = namespace.admin.verifyAdminPassword;
    window.exitAdmin = namespace.admin.exitAdmin;
    window.switchTab = namespace.ui.switchTab;
    window.switchAdminSubTab = namespace.ui.switchAdminSubTab;
    window.selectBtn = namespace.ui.selectSingleChoice;
    window.togglePurpose = namespace.ui.toggleChoice;
    window.selectGender = namespace.ui.selectGender;
    window.changeVisitCount = namespace.visit.changeVisitCount;
    window.addUserForm = namespace.reservation.addUserForm;
    window.submitForm = submitForm;
    window.exportToExcel = namespace.excel.exportToExcel;
    window.setFilter = namespace.statistics.setFilter;
    window.updateAdminDashboard = namespace.statistics.updateAdminDashboard;
    window.deleteVisitLog = namespace.admin.deleteVisitLog;
    window.deleteArLog = namespace.reservation.deleteReservation;

    document.addEventListener("DOMContentLoaded", initializePage);
})(window.NCHM);
