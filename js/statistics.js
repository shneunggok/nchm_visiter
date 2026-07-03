window.NCHM = window.NCHM || {};

(function registerStatistics(namespace) {
    const { state, config, utils } = namespace;

    function initFilterOptions() {
        const yearSelect = document.getElementById("filter-year-select");
        const monthSelect = document.getElementById("filter-month-select");
        if (!yearSelect || !monthSelect) return;

        const now = new Date();
        yearSelect.innerHTML = "";

        for (let year = now.getFullYear() - 1; year <= now.getFullYear() + 1; year += 1) {
            const option = document.createElement("option");
            option.value = String(year);
            option.innerText = `${year}년`;
            if (year === now.getFullYear()) {
                option.selected = true;
            }
            yearSelect.appendChild(option);
        }

        monthSelect.value = String(now.getMonth());
    }

    function setFilter(type) {
        state.currentFilter = type;

        document.querySelectorAll(".filter-chip").forEach((button) => {
            button.classList.remove("active");
        });

        if (type === "month") {
            document.getElementById("filter-month")?.classList.add("active");
        } else {
            document.getElementById(`filter-${type}`)?.classList.add("active");
        }

        const customDateInputs = document.getElementById("custom-date-inputs");
        if (customDateInputs) {
            customDateInputs.classList.toggle("hidden", type !== "custom");
        }

        if (type === "all") {
            updateAdminDashboard();
        }
    }

    function isDateInRange(dateString) {
        const targetDate = new Date(dateString);

        if (state.currentFilter === "all") return true;

        if (state.currentFilter === "month") {
            const selectedYear = parseInt(document.getElementById("filter-year-select")?.value || "0", 10);
            const selectedMonth = parseInt(document.getElementById("filter-month-select")?.value || "0", 10);
            return targetDate.getFullYear() === selectedYear && targetDate.getMonth() === selectedMonth;
        }

        if (state.currentFilter === "custom") {
            const startDateValue = document.getElementById("start-date")?.value;
            const endDateValue = document.getElementById("end-date")?.value;
            if (!startDateValue || !endDateValue) return true;

            const startDate = new Date(startDateValue);
            const endDate = new Date(endDateValue);
            endDate.setHours(23, 59, 59, 999);
            return targetDate >= startDate && targetDate <= endDate;
        }

        return true;
    }

    function buildBlankStats(categories) {
        const result = {};
        categories.forEach((category) => {
            result[category] = {};
            config.ageGroups.forEach((age) => {
                result[category][age] = { 남: 0, 여: 0 };
            });
        });
        return result;
    }

    function renderStatsTable(data, categories, targetBodyId, targetFooterId, themeClass) {
        const body = document.getElementById(targetBodyId);
        const footer = document.getElementById(targetFooterId);
        if (!body || !footer) return;

        body.innerHTML = "";
        let grandTotal = 0;
        const ageGenderTotals = {};

        config.ageGroups.forEach((age) => {
            ageGenderTotals[age] = { 남: 0, 여: 0 };
        });

        categories.forEach((category) => {
            let youthSum = 0;
            let youngSum = 0;
            let rowTotal = 0;
            const row = document.createElement("tr");
            row.innerHTML = `<td class="category-row">${utils.escapeHtml(category)}</td>`;

            config.ageGroups.forEach((age, index) => {
                const male = data[category][age]["남"];
                const female = data[category][age]["여"];
                const rowValue = male + female;

                row.innerHTML += `<td>${male || "-"}</td><td>${female || "-"}</td>`;
                rowTotal += rowValue;
                ageGenderTotals[age]["남"] += male;
                ageGenderTotals[age]["여"] += female;

                if (index < 3) youthSum += rowValue;
                if (index >= 3 && index <= 4) youngSum += rowValue;
            });

            row.innerHTML += `<td class="${themeClass}">${youthSum}</td><td class="${themeClass}">${youngSum}</td><td class="total-sum-col">${rowTotal}</td>`;
            body.appendChild(row);
            grandTotal += rowTotal;
        });

        footer.innerHTML = "<td>합계</td>";

        let footerYouth = 0;
        let footerYoung = 0;

        config.ageGroups.forEach((age, index) => {
            const male = ageGenderTotals[age]["남"];
            const female = ageGenderTotals[age]["여"];
            footer.innerHTML += `<td>${male}</td><td>${female}</td>`;

            const sum = male + female;
            if (index < 3) footerYouth += sum;
            if (index >= 3 && index <= 4) footerYoung += sum;
        });

        const finalClass = themeClass === "sum-col" ? "final-total-visit" : "final-total-ar";
        footer.innerHTML += `<td>${footerYouth}</td><td>${footerYoung}</td><td class="${finalClass}">${grandTotal}</td>`;
    }

    function updateAdminDashboard() {
        const visitBody = document.getElementById("visit-log-body");
        const arBody = document.getElementById("ar-log-body");
        if (!visitBody || !arBody) return;

        const filteredVisitLogs = state.visitLogs.filter((log) => isDateInRange(log.date));
        const filteredArLogs = state.arLogs.filter((log) => isDateInRange(log.date));

        const mainCategories = [...config.purposes, "AR실"];
        const visitStats = buildBlankStats(mainCategories);

        filteredVisitLogs.forEach((log) => {
            (log.purposes || []).forEach((purpose) => {
                if (visitStats[purpose]?.[log.age]?.[log.gender] !== undefined) {
                    visitStats[purpose][log.age][log.gender] += 1;
                }
            });
        });

        filteredArLogs.forEach((log) => {
            (log.users || []).forEach((user) => {
                if (visitStats["AR실"]?.[user.age]?.[user.gender] !== undefined) {
                    visitStats["AR실"][user.age][user.gender] += 1;
                }
            });
        });

        renderStatsTable(visitStats, mainCategories, "visit-stats-body", "visit-stats-footer", "sum-col");

        const studyStats = buildBlankStats(["스터디룸"]);
        filteredVisitLogs.forEach((log) => {
            if ((log.purposes || []).includes("스터디룸")) {
                studyStats["스터디룸"][log.age][log.gender] += 1;
            }
        });
        renderStatsTable(studyStats, ["스터디룸"], "study-stats-body", "study-stats-footer", "sum-col");

        const arStats = buildBlankStats(["AR 이용"]);
        filteredArLogs.forEach((log) => {
            (log.users || []).forEach((user) => {
                if (arStats["AR 이용"]?.[user.age]?.[user.gender] !== undefined) {
                    arStats["AR 이용"][user.age][user.gender] += 1;
                }
            });
        });
        renderStatsTable(arStats, ["AR 이용"], "ar-stats-body", "ar-stats-footer", "ar-sum-col");

        visitBody.innerHTML = "";
        filteredVisitLogs.slice().reverse().forEach((log) => {
            const row = document.createElement("tr");
            row.className = "border-b hover:bg-slate-50";
            const purposesHtml = (log.purposes || []).map((purpose) => `<span class="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px] font-bold">${utils.escapeHtml(purpose)}</span>`).join("");

            row.innerHTML = `
                <td class="py-3 text-slate-500 font-bold text-xs">${utils.escapeHtml(log.date)}</td>
                <td class="text-slate-400 font-medium">${utils.escapeHtml(log.time)}</td>
                <td class="font-bold">${utils.escapeHtml(log.name)}</td>
                <td>${utils.escapeHtml(log.gender)}</td>
                <td>${utils.escapeHtml((log.age || "").split("(")[0])}</td>
                <td><div class="flex gap-1 justify-center">${purposesHtml}</div></td>
                <td>
                    <button onclick="deleteVisitLog('${utils.escapeHtml(log._key)}')" class="bg-red-500 text-white px-2 py-1 rounded text-xs">삭제</button>
                </td>
            `;
            visitBody.appendChild(row);
        });
        document.getElementById("visit-count-badge").innerText = `${filteredVisitLogs.length}건`;

        arBody.innerHTML = "";
        filteredArLogs.slice().reverse().forEach((log) => {
            const row = document.createElement("tr");
            row.className = "border-b hover:bg-indigo-50/30";
            const detailsHtml = (log.users || []).map((user) => `
                <span class="inline-block bg-slate-100 rounded-lg px-2 py-1 mr-1 mb-1 text-slate-700 font-medium">
                    ${utils.escapeHtml(user.name)}
                    <span class="text-[10px] text-slate-400 ml-1">(${utils.escapeHtml(user.gender)}, ${utils.escapeHtml((user.age || "").split("(")[0])})</span>
                </span>
            `).join("");

            row.innerHTML = `
                <td class="py-3 text-slate-500 font-bold text-xs">${utils.escapeHtml(log.date)}</td>
                <td class="py-3 text-indigo-600 font-bold">${utils.escapeHtml(log.timeSlot)}</td>
                <td class="font-bold">${utils.escapeHtml(log.users?.[0]?.name || "")}</td>
                <td>${log.users?.length || 0}명</td>
                <td class="text-xs text-left px-4 py-2">${detailsHtml}</td>
                <td>
                    <button onclick="deleteArLog('${utils.escapeHtml(log._key)}')" class="bg-red-500 text-white px-2 py-1 rounded text-xs">삭제</button>
                </td>
            `;
            arBody.appendChild(row);
        });
        document.getElementById("ar-count-badge").innerText = `${filteredArLogs.length}건`;
    }

    namespace.statistics = {
        initFilterOptions,
        setFilter,
        isDateInRange,
        renderStatsTable,
        updateAdminDashboard
    };
})(window.NCHM);
