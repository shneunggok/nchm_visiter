window.NCHM = window.NCHM || {};

(function registerUi(namespace) {
    const { refreshIcons } = namespace.utils;

    function selectSingleChoice(button, groupClassName) {
        if (button.classList.contains("disabled")) return;

        document.querySelectorAll(`.${groupClassName}`).forEach((item) => {
            item.classList.remove("active");
        });

        button.classList.add("active");
    }

    function toggleChoice(button) {
        button.classList.toggle("active");
    }

    function selectGender(button) {
        const parent = button.parentElement;
        parent.querySelectorAll("button").forEach((item) => {
            item.className = "flex-1 py-2.5 text-sm font-bold text-slate-400";
        });
        button.className = "flex-1 py-2.5 bg-white rounded-xl text-sm font-bold shadow-sm";
    }

    function switchTab(type) {
        document.getElementById("tab-visit").className = "tab-btn font-bold";
        document.getElementById("tab-ar").className = "tab-btn font-bold";
        document.getElementById("main-tabs").classList.remove("hidden");
        document.getElementById("section-visit").classList.add("hidden");
        document.getElementById("section-ar").classList.add("hidden");

        if (type === "visit") {
            document.body.className = "pb-10 theme-visit";
            document.getElementById("section-visit").classList.remove("hidden");
            document.getElementById("tab-visit").classList.add("active-visit");
            namespace.visit.focusFirstVisitInput();
        } else {
            document.body.className = "pb-10 theme-ar";
            document.getElementById("section-ar").classList.remove("hidden");
            document.getElementById("tab-ar").classList.add("active-ar");
            namespace.reservation.generateTimeSlots();
        }
    }

    function switchAdminSubTab(tab) {
        document.getElementById("admin-visit-logs").classList.add("hidden");
        document.getElementById("admin-ar-logs").classList.add("hidden");
        document.getElementById("subtab-visit-logs").classList.remove("active-visit");
        document.getElementById("subtab-ar-logs").classList.remove("active-ar");

        if (tab === "visit-logs") {
            document.getElementById("admin-visit-logs").classList.remove("hidden");
            document.getElementById("subtab-visit-logs").classList.add("active-visit");
        } else {
            document.getElementById("admin-ar-logs").classList.remove("hidden");
            document.getElementById("subtab-ar-logs").classList.add("active-ar");
        }
    }

    function setCurrentDateDisplay(now = new Date()) {
        const currentDate = document.getElementById("current-date");
        if (currentDate) {
            currentDate.innerText = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
        }
    }

    function enterAdminMode() {
        document.body.className = "pb-10 theme-admin";
        document.getElementById("main-tabs").classList.add("hidden");
        document.getElementById("section-visit").classList.add("hidden");
        document.getElementById("section-ar").classList.add("hidden");
        document.getElementById("admin-tabs").classList.remove("hidden");
        document.getElementById("section-admin").classList.remove("hidden");
        document.getElementById("admin-entry-btn").classList.add("hidden");
        document.getElementById("exit-admin-btn").classList.remove("hidden");
        document.getElementById("main-content-container").classList.replace("max-w-xl", "max-w-6xl");
        namespace.statistics.updateAdminDashboard();
        refreshIcons();
    }

    function exitAdminMode() {
        document.getElementById("main-content-container").classList.replace("max-w-6xl", "max-w-xl");
        document.getElementById("admin-tabs").classList.add("hidden");
        document.getElementById("section-admin").classList.add("hidden");
        document.getElementById("exit-admin-btn").classList.add("hidden");
        document.getElementById("admin-entry-btn").classList.remove("hidden");
        switchTab("visit");
    }

    namespace.ui = {
        selectSingleChoice,
        toggleChoice,
        selectGender,
        switchTab,
        switchAdminSubTab,
        setCurrentDateDisplay,
        enterAdminMode,
        exitAdminMode
    };
})(window.NCHM);
