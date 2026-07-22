/**
 * ============================================================================
 * admin-tool / modules / dashboard.js
 * ============================================================================
 * 
 * Dashboard Rendering Module.
 * Self-renders ALL admin dashboard UI into #admin-root.
 * Contains: filter panel, stats tables, visit log table, AR log table, export.
 * Preserves EXACT original layout, styling, and behavior.
 * ============================================================================
 */

window.AT_Dashboard = {

    /**
     * Render the entire admin dashboard HTML into #admin-root.
     */
    render: function() {
        var root = document.getElementById("admin-root");
        if (!root) {
            console.error("[admin-tool] #admin-root not found in DOM");
            return;
        }

        var html = this._buildFilterPanel();
        html += this._buildVisitSection();
        html += this._buildArSection();

        root.innerHTML = html;

        // Initialize filter options
        window.AT_Stats.initFilterOptions();

        // Set default dates
        var now = new Date();
        var startDate = document.getElementById("at-start-date");
        var endDate = document.getElementById("at-end-date");
        if (startDate) startDate.value = window.AT_Utils.formatLocalDate(now);
        if (endDate) endDate.value = window.AT_Utils.formatLocalDate(now);

        // Wire filter buttons
        this._wireFilters();
    },

    _buildFilterPanel: function() {
        var h = '';
        h += '<div id="at-section-admin" class="at-space-y-10">';

        // Filter panel
        h += '<div class="at-filter-panel">';
        h += '<div class="at-filter-header">';
        h += '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>';
        h += ' 통계 기간 필터';
        h += '</div>';
        h += '<div class="at-filter-controls">';
        h += '<button class="at-filter-chip at-filter-active" id="at-filter-all">전체</button>';
        h += '<div class="at-month-filter-group">';
        h += '<button class="at-filter-chip at-filter-inline" id="at-filter-month">월별</button>';
        h += '<select id="at-filter-year-select" class="at-admin-select"></select>';
        h += '<select id="at-filter-month-select" class="at-admin-select">';
        h += '<option value="0">1월</option><option value="1">2월</option><option value="2">3월</option><option value="3">4월</option>';
        h += '<option value="4">5월</option><option value="5">6월</option><option value="6">7월</option><option value="7">8월</option>';
        h += '<option value="8">9월</option><option value="9">10월</option><option value="10">11월</option><option value="11">12월</option>';
        h += '</select>';
        h += '</div>';
        h += '<button class="at-filter-chip" id="at-filter-custom">지정 기간</button>';
        h += '<div id="at-custom-date-inputs" class="at-hidden at-custom-dates">';
        h += '<input type="date" id="at-start-date" class="at-date-input">';
        h += '<span class="at-date-sep">~</span>';
        h += '<input type="date" id="at-end-date" class="at-date-input">';
        h += '</div>';
        h += '<button id="at-search-btn" class="at-search-confirm-btn">';
        h += '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
        h += ' 조회';
        h += '</button>';
        h += '</div>';
        h += '</div>';

        return h;
    },

    _buildVisitSection: function() {
        var h = '';
        h += '<div id="at-admin-visit-logs" class="at-space-y-6">';

        // Visit stats header
        h += '<div class="at-section-header"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg> 이용 목적 및 연령별 통계</div>';

        // Stats table 1
        h += '<div class="at-stats-container"><div class="at-stats-wrapper"><table class="at-stats-table"><thead><tr><th rowspan="2" class="at-w-32">이용 목적</th><th colspan="2">초등(9~13)</th><th colspan="2">중등(14~16)</th><th colspan="2">고등(17~19)</th><th colspan="2">청년(20~24)</th><th colspan="2">청년(25~39)</th><th colspan="2">유아(~8)</th><th colspan="2">성인(40~)</th><th rowspan="2" class="at-sum-col">청소년 합계</th><th rowspan="2" class="at-sum-col">청년 합계</th><th rowspan="2" class="at-total-sum-col">전체 합계</th></tr><tr class="at-gender-header"><th class="at-male">남</th><th class="at-female">여</th><th class="at-male">남</th><th class="at-female">여</th><th class="at-male">남</th><th class="at-female">여</th><th class="at-male">남</th><th class="at-female">여</th><th class="at-male">남</th><th class="at-female">여</th><th class="at-male">남</th><th class="at-female">여</th><th class="at-male">남</th><th class="at-female">여</th></tr></thead><tbody id="at-visit-stats-body"></tbody><tfoot><tr class="at-footer-row" id="at-visit-stats-footer"></tr></tfoot></table></div></div>';

        // Study room stats
        h += '<div class="at-section-header at-indigo"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> 스터디룸 이용 통계</div>';
        h += '<div class="at-stats-container"><div class="at-stats-wrapper"><table class="at-stats-table"><thead><tr><th rowspan="2" class="at-w-32">공간 명칭</th><th colspan="2">초등(9~13)</th><th colspan="2">중등(14~16)</th><th colspan="2">고등(17~19)</th><th colspan="2">청년(20~24)</th><th colspan="2">청년(25~39)</th><th colspan="2">유아(~8)</th><th colspan="2">성인(40~)</th><th rowspan="2" class="at-sum-col">청소년 합계</th><th rowspan="2" class="at-sum-col">청년 합계</th><th rowspan="2" class="at-total-sum-col">전체 합계</th></tr><tr class="at-gender-header"><th class="at-male">남</th><th class="at-female">여</th><th class="at-male">남</th><th class="at-female">여</th><th class="at-male">남</th><th class="at-female">여</th><th class="at-male">남</th><th class="at-female">여</th><th class="at-male">남</th><th class="at-female">여</th><th class="at-male">남</th><th class="at-female">여</th><th class="at-male">남</th><th class="at-female">여</th></tr></thead><tbody id="at-study-stats-body"></tbody><tfoot><tr class="at-footer-row" id="at-study-stats-footer"></tr></tfoot></table></div></div>';

        // Visit log table header
        h += '<div class="at-log-header">';
        h += '<h2 class="at-log-title">상세 방문 내역</h2>';
        h += '<div class="at-log-actions">';
        h += '<button id="at-visit-excel-btn" class="at-excel-btn"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> 엑셀 다운로드</button>';
        h += '<span id="at-visit-count-badge" class="at-count-badge at-blue-badge">0건</span>';
        h += '</div>';
        h += '</div>';

        // Visit log table
        h += '<div class="at-log-table-wrap"><table class="at-log-table"><thead class="at-log-thead"><tr><th>날짜</th><th>시간</th><th>이름</th><th>성별</th><th>나이</th><th>목적</th><th>관리</th></tr></thead><tbody id="at-visit-log-body"></tbody></table></div>';

        h += '</div>'; // at-admin-visit-logs

        return h;
    },

    _buildArSection: function() {
        var h = '';
        h += '<div id="at-admin-ar-logs" class="at-hidden at-space-y-6">';

        // AR stats header
        h += '<div class="at-section-header at-indigo-800"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12L9 19L22 5"/></svg> AR 이용 통계 (예약 기반)</div>';
        h += '<div class="at-stats-container at-ar-border"><div class="at-stats-wrapper"><table class="at-stats-table"><thead><tr><th rowspan="2" class="at-w-32">이용 목적</th><th colspan="2">초등(9~13)</th><th colspan="2">중등(14~16)</th><th colspan="2">고등(17~19)</th><th colspan="2">청년(20~24)</th><th colspan="2">청년(25~39)</th><th colspan="2">유아(~8)</th><th colspan="2">성인(40~)</th><th rowspan="2" class="at-ar-sum-col">청소년 합계</th><th rowspan="2" class="at-ar-sum-col">청년 합계</th><th rowspan="2" class="at-total-sum-col">전체 합계</th></tr><tr class="at-gender-header"><th class="at-male">남</th><th class="at-female">여</th><th class="at-male">남</th><th class="at-female">여</th><th class="at-male">남</th><th class="at-female">여</th><th class="at-male">남</th><th class="at-female">여</th><th class="at-male">남</th><th class="at-female">여</th><th class="at-male">남</th><th class="at-female">여</th><th class="at-male">남</th><th class="at-female">여</th></tr></thead><tbody id="at-ar-stats-body"></tbody><tfoot><tr class="at-footer-row" id="at-ar-stats-footer"></tr></tfoot></table></div></div>';

        // AR log table header
        h += '<div class="at-log-header">';
        h += '<h2 class="at-log-title at-indigo-800">상세 AR 예약 현황</h2>';
        h += '<div class="at-log-actions">';
        h += '<button id="at-ar-excel-btn" class="at-excel-btn at-indigo-btn"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> 엑셀 다운로드</button>';
        h += '<span id="at-ar-count-badge" class="at-count-badge at-indigo-badge">0건</span>';
        h += '</div>';
        h += '</div>';

        // AR log table
        h += '<div class="at-log-table-wrap"><table class="at-log-table"><thead class="at-log-thead"><tr><th>예약날짜</th><th>예약시간</th><th>대표자</th><th>총 인원</th><th>이용자 명단 (성별, 나이)</th><th>관리</th></tr></thead><tbody id="at-ar-log-body"></tbody></table></div>';

        h += '</div>'; // at-admin-ar-logs
        h += '</div>'; // at-section-admin

        return h;
    },

    _wireFilters: function() {
        var self = this;

        // All filter
        var allBtn = document.getElementById("at-filter-all");
        if (allBtn) {
            allBtn.addEventListener("click", function() {
                window.AT_Stats.setFilter("all");
            });
        }

        // Month filter
        var monthBtn = document.getElementById("at-filter-month");
        if (monthBtn) {
            monthBtn.addEventListener("click", function() {
                window.AT_Stats.setFilter("month");
            });
        }

        // Custom filter
        var customBtn = document.getElementById("at-filter-custom");
        if (customBtn) {
            customBtn.addEventListener("click", function() {
                window.AT_Stats.setFilter("custom");
            });
        }

        // Search button
        var searchBtn = document.getElementById("at-search-btn");
        if (searchBtn) {
            searchBtn.addEventListener("click", function() {
                self.update();
            });
        }

        // Excel download buttons
        var visitExcelBtn = document.getElementById("at-visit-excel-btn");
        if (visitExcelBtn) {
            visitExcelBtn.addEventListener("click", function() {
                self.exportToExcel("visit");
            });
        }

        var arExcelBtn = document.getElementById("at-ar-excel-btn");
        if (arExcelBtn) {
            arExcelBtn.addEventListener("click", function() {
                self.exportToExcel("ar");
            });
        }
    },

    /**
     * Update all dashboard tables with current data.
     */
    update: function() {
        var visitLogBody = document.getElementById("at-visit-log-body");
        var arLogBody = document.getElementById("at-ar-log-body");
        if (!visitLogBody || !arLogBody) return;

        var visitLogs = window.AT_Visit.logs || [];
        var arLogs = window.AT_AR.logs || [];

        var filteredVisits = visitLogs.filter(function(log) {
            return window.AT_Stats.isDateInRange(log.date);
        });
        var filteredArs = arLogs.filter(function(log) {
            return window.AT_Stats.isDateInRange(log.date);
        });

        // Render stats tables
        var vStats = window.AT_Stats.computeVisitStats(filteredVisits);
        var purposes = window.ADMIN_TOOL.visitPurposes || [];
        window.AT_Table.renderStatsTable(vStats, purposes, "at-visit-stats-body", "at-visit-stats-footer", "at-sum-col");

        var studyStats = window.AT_Stats.computeStudyStats(filteredVisits);
        window.AT_Table.renderStatsTable(studyStats, ["\uC2A4\uD130\uB514\uB8F8"], "at-study-stats-body", "at-study-stats-footer", "at-sum-col");

        var arStats = window.AT_Stats.computeArStats(filteredArs);
        window.AT_Table.renderStatsTable(arStats, ["AR \uC774\uC6A9"], "at-ar-stats-body", "at-ar-stats-footer", "at-ar-sum-col");

        // Render visit log rows
        visitLogBody.innerHTML = "";
        var visitUtils = window.AT_Utils;
        filteredVisits.slice().reverse().forEach(function(log) {
            var tr = document.createElement("tr");
            tr.className = "at-log-row";

            var purposesHtml = (log.purposes || []).map(function(p) {
                return '<span class="at-purpose-badge">' + visitUtils.escapeHtml(p) + '</span>';
            }).join("");

            var safeKey = visitUtils.escapeHtml(log._key || "");
            tr.innerHTML = '<td class="at-date-cell">' + visitUtils.escapeHtml(log.date) + '</td>' +
                '<td class="at-time-cell">' + visitUtils.escapeHtml(log.time) + '</td>' +
                '<td class="at-name-cell">' + visitUtils.escapeHtml(log.name) + '</td>' +
                '<td>' + visitUtils.escapeHtml(log.gender) + '</td>' +
                '<td>' + visitUtils.escapeHtml((log.age || "").split("(")[0]) + '</td>' +
                '<td><div class="at-purpose-wrap">' + purposesHtml + '</div></td>' +
                '<td><button class="at-delete-btn" data-at-visit-key="' + safeKey + '">삭제</button></td>';

            // Wire delete
            tr.querySelector("[data-at-visit-key]").addEventListener("click", function() {
                window.AT_Visit.delete(this.getAttribute("data-at-visit-key"));
            });

            visitLogBody.appendChild(tr);
        });

        var visitBadge = document.getElementById("at-visit-count-badge");
        if (visitBadge) visitBadge.textContent = filteredVisits.length + "건";

        // Render AR log rows
        arLogBody.innerHTML = "";
        filteredArs.slice().reverse().forEach(function(log) {
            var tr = document.createElement("tr");
            tr.className = "at-log-row at-ar-row";

            var details = (log.users || []).map(function(user) {
                return '<span class="at-user-chip">' +
                    visitUtils.escapeHtml(user.name) +
                    ' <span class="at-user-meta">(' + visitUtils.escapeHtml(user.gender) + ', ' +
                    visitUtils.escapeHtml((user.age || "").split("(")[0]) + ')</span></span>';
            }).join("");

            var safeKey = visitUtils.escapeHtml(log._key || "");
            tr.innerHTML = '<td class="at-date-cell">' + visitUtils.escapeHtml(log.date) + '</td>' +
                '<td class="at-time-cell at-indigo-text">' + visitUtils.escapeHtml(log.timeSlot) + '</td>' +
                '<td class="at-name-cell">' + visitUtils.escapeHtml(log.users && log.users[0] ? log.users[0].name : "") + '</td>' +
                '<td>' + (log.users ? log.users.length : 0) + '명</td>' +
                '<td class="at-detail-cell">' + details + '</td>' +
                '<td><button class="at-delete-btn" data-at-ar-key="' + safeKey + '">삭제</button></td>';

            tr.querySelector("[data-at-ar-key]").addEventListener("click", function() {
                window.AT_AR.delete(this.getAttribute("data-at-ar-key"));
            });

            arLogBody.appendChild(tr);
        });

        var arBadge = document.getElementById("at-ar-count-badge");
        if (arBadge) arBadge.textContent = filteredArs.length + "건";
    },

    /**
     * Export filtered data to CSV.
     */
    exportToExcel: function(type) {
        var csvContent = "\uFEFF";
        var fileName = "";
        var utils = window.AT_Utils;

        if (type === "visit") {
            var visits = (window.AT_Visit.logs || []).filter(function(log) {
                return window.AT_Stats.isDateInRange(log.date);
            });
            if (visits.length === 0) {
                utils.showMessage("다운로드할 데이터가 없습니다.", "info");
                return;
            }
            csvContent += "날짜,시간,이름,성별,나이,이용목적\n";
            visits.forEach(function(log) {
                csvContent += utils.sanitizeCsvField(log.date) + "," +
                    utils.sanitizeCsvField(log.time) + "," +
                    utils.sanitizeCsvField(log.name) + "," +
                    utils.sanitizeCsvField(log.gender) + "," +
                    utils.sanitizeCsvField((log.age || "").split("(")[0]) + ',"' +
                    utils.sanitizeCsvField((log.purposes || []).join(", ")) + '"\n';
            });
            fileName = "\uBC29\uBB38\uB4F1\uB85D_" + utils.formatLocalDate(new Date()) + ".csv";
        } else {
            var ars = (window.AT_AR.logs || []).filter(function(log) {
                return window.AT_Stats.isDateInRange(log.date);
            });
            if (ars.length === 0) {
                utils.showMessage("다운로드할 데이터가 없습니다.", "info");
                return;
            }
            csvContent += "\uC608\uC57D\uB0A0\uC9DC,\uC608\uC57D\uC2DC\uAC04,\uB300\uD45C\uC790,\uCD1D\uC778\uC6D0,\uC774\uC6A9\uC790\uC0C1\uC138\n";
            ars.forEach(function(log) {
                var details = (log.users || []).map(function(u) {
                    return u.name + "(" + u.gender + "/" + (u.age || "").split("(")[0] + ")";
                }).join(" | ");
                csvContent += utils.sanitizeCsvField(log.date) + "," +
                    utils.sanitizeCsvField(log.timeSlot) + "," +
                    utils.sanitizeCsvField(log.users && log.users[0] ? log.users[0].name : "") + "," +
                    (log.users ? log.users.length : 0) + ',"' +
                    utils.sanitizeCsvField(details) + '"\n';
            });
            fileName = "AR\uC608\uC57D_" + utils.formatLocalDate(new Date()) + ".csv";
        }

        var blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        var link = document.createElement("a");
        var url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        link.click();
    }
};