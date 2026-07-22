/**
 * ============================================================================
 * admin-tool / modules / statistics.js
 * ============================================================================
 * 
 * Statistics Computation & Filter Engine.
 * Handles period filtering, age/gender aggregation.
 * ============================================================================
 */

window.AT_Stats = {

    currentFilter: "all",
    _filterCallbacks: [],

    setFilter: function(type) {
        this.currentFilter = type;

        document.querySelectorAll(".at-filter-chip").forEach(function(btn) {
            btn.classList.remove("at-filter-active");
        });

        var el = document.getElementById("at-filter-" + type);
        if (el) el.classList.add("at-filter-active");

        var customInputs = document.getElementById("at-custom-date-inputs");
        if (customInputs) {
            if (type === "custom") {
                customInputs.classList.remove("at-hidden");
            } else {
                customInputs.classList.add("at-hidden");
            }
        }

        if (type === "all" && window.AT_Dashboard) {
            window.AT_Dashboard.update();
        }

        // Notify callbacks
        for (var i = 0; i < this._filterCallbacks.length; i++) {
            this._filterCallbacks[i](type);
        }
    },

    isDateInRange: function(dateStr) {
        var targetDate = new Date(dateStr);
        if (this.currentFilter === "all") return true;

        if (this.currentFilter === "month") {
            var yearSelect = document.getElementById("at-filter-year-select");
            var monthSelect = document.getElementById("at-filter-month-select");
            if (!yearSelect || !monthSelect) return true;
            var selectedYear = parseInt(yearSelect.value, 10);
            var selectedMonth = parseInt(monthSelect.value, 10);
            return targetDate.getMonth() === selectedMonth && targetDate.getFullYear() === selectedYear;
        }

        if (this.currentFilter === "custom") {
            var startEl = document.getElementById("at-start-date");
            var endEl = document.getElementById("at-end-date");
            if (!startEl || !endEl) return true;
            var start = startEl.value;
            var end = endEl.value;
            if (!start || !end) return true;
            var startDate = new Date(start);
            var endDate = new Date(end);
            endDate.setHours(23, 59, 59);
            return targetDate >= startDate && targetDate <= endDate;
        }

        return true;
    },

    initFilterOptions: function() {
        var now = new Date();
        var yearSelect = document.getElementById("at-filter-year-select");
        if (!yearSelect) return;

        for (var y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
            var option = document.createElement("option");
            option.value = y;
            option.textContent = y + "년";
            if (y === now.getFullYear()) {
                option.selected = true;
            }
            yearSelect.appendChild(option);
        }

        var monthSelect = document.getElementById("at-filter-month-select");
        if (monthSelect) {
            monthSelect.value = now.getMonth();
        }
    },

    computeVisitStats: function(filteredLogs) {
        var mainCategories = (window.ADMIN_TOOL.visitPurposes || []).slice();
        var ageGroups = window.ADMIN_TOOL.ageGroups || [];
        var stats = {};

        mainCategories.forEach(function(category) {
            stats[category] = {};
            ageGroups.forEach(function(age) {
                stats[category][age] = { "\uB0A8": 0, "\uC5EC": 0 };
            });
        });

        filteredLogs.forEach(function(log) {
            (log.purposes || []).forEach(function(purpose) {
                var purposes = window.ADMIN_TOOL.visitPurposes || [];
                if (purposes.indexOf(purpose) >= 0 && stats[purpose] && stats[purpose][log.age]) {
                    stats[purpose][log.age][log.gender] += 1;
                }
            });
        });

        return stats;
    },

    computeStudyStats: function(filteredLogs) {
        var ageGroups = window.ADMIN_TOOL.ageGroups || [];
        var stats = { "\uC2A4\uD130\uB514\uB8F8": {} };
        ageGroups.forEach(function(age) {
            stats["\uC2A4\uD130\uB514\uB8F8"][age] = { "\uB0A8": 0, "\uC5EC": 0 };
        });

        filteredLogs.forEach(function(log) {
            if ((log.purposes || []).indexOf("\uC2A4\uD130\uB514\uB8F8") >= 0) {
                stats["\uC2A4\uD130\uB514\uB8F8"][log.age][log.gender] += 1;
            }
        });

        return stats;
    },

    computeArStats: function(filteredLogs) {
        var ageGroups = window.ADMIN_TOOL.ageGroups || [];
        var stats = { "AR \uC774\uC6A9": {} };
        ageGroups.forEach(function(age) {
            stats["AR \uC774\uC6A9"][age] = { "\uB0A8": 0, "\uC5EC": 0 };
        });

        filteredLogs.forEach(function(log) {
            (log.users || []).forEach(function(user) {
                if (stats["AR \uC774\uC6A9"][user.age]) {
                    stats["AR \uC774\uC6A9"][user.age][user.gender] += 1;
                }
            });
        });

        return stats;
    },

    onFilterChange: function(callback) {
        this._filterCallbacks.push(callback);
    }
};