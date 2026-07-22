/**
 * ============================================================================
 * admin-tool / modules / tv.js
 * ============================================================================
 * 
 * TV Management Module for Admin Dashboard.
 * 
 * This module provides:
 * - TV display settings (enable/disable slides)
 * - TV preview link
 * - Broadcast update to Firebase
 * 
 * Loaded automatically when window.ADMIN_TOOL.features.tvDashboard is true.
 * ============================================================================
 */

window.AT_TV = {

    /**
     * Initialize TV management.
     * Called after the module loads.
     */
    init: function() {
        // Add TV management tab to sidebar
        this._addTVMenu();

        // Listen for tab switch events
        this._wireTabSwitch();
    },

    /**
     * Add TV management entry to the admin sidebar/menu.
     */
    _addTVMenu: function() {
        var cfg = window.ADMIN_TOOL;
        if (!cfg) return;

        // Add menu item
        if (cfg.menu) {
            cfg.menu.push({
                id: "tv-dashboard",
                label: "TV 관리",
                icon: "tv",
                defaultTab: "tv-settings"
            });
        }

        // Add sub-tabs for TV management
        if (cfg.subTabs) {
            cfg.subTabs["tv-dashboard"] = [
                { id: "tv-settings", label: "TV 설정", theme: "tv" }
            ];
        }
    },

    /**
     * Wire tab switching for TV management.
     */
    _wireTabSwitch: function() {
        var self = this;
        var checkInterval = setInterval(function() {
            var btn = document.querySelector('[data-at-tab="tv-settings"]');
            if (btn) {
                clearInterval(checkInterval);
                btn.addEventListener("click", function() {
                    self.renderTVSettings();
                });

                // Also listen to existing tab switching
                var allBtns = document.querySelectorAll("[data-at-tab]");
                allBtns.forEach(function(b) {
                    b.addEventListener("click", function() {
                        var tabId = this.getAttribute("data-at-tab");
                        if (tabId === "tv-settings") {
                            self.renderTVSettings();
                        }
                    });
                });
            }
        }, 500);

        // Timeout after 10 seconds
        setTimeout(function() {
            clearInterval(checkInterval);
        }, 10000);
    },

    /**
     * Render TV settings panel.
     */
    renderTVSettings: function() {
        var container = document.getElementById("at-dashboard-container");
        if (!container) {
            console.error("[admin-tool] #at-dashboard-container not found");
            return;
        }

        // Hide visit and AR sections
        var visitSection = document.getElementById("at-admin-visit-logs");
        var arSection = document.getElementById("at-admin-ar-logs");
        if (visitSection) visitSection.classList.add("at-hidden");
        if (arSection) arSection.classList.add("at-hidden");

        // Check if TV settings already rendered
        var existing = document.getElementById("at-tv-settings-panel");
        if (existing) {
            existing.classList.remove("at-hidden");
            this.loadSettings();
            return;
        }

        var html = this._buildTVSettingsHTML();
        container.insertAdjacentHTML("beforeend", html);

        // Wire save button
        var saveBtn = document.getElementById("at-tv-save-btn");
        if (saveBtn) {
            saveBtn.addEventListener("click", function() {
                window.AT_TV.saveSettings();
            });
        }

        // Wire preview button
        var previewBtn = document.getElementById("at-tv-preview-btn");
        if (previewBtn) {
            previewBtn.addEventListener("click", function() {
                window.AT_TV.openPreview();
            });
        }

        // Load current settings
        this.loadSettings();
    },

    /**
     * Build TV settings HTML.
     */
    _buildTVSettingsHTML: function() {
        var h = '';
        h += '<div id="at-tv-settings-panel" class="at-space-y-6 at-tv-settings">';

        // Header
        h += '<div class="at-section-header">';
        h += '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>';
        h += ' TV 디스플레이 설정';
        h += '</div>';

        // Description
        h += '<div class="at-tv-desc">';
        h += '<p>TV 화면에 표시할 항목을 선택하세요. 변경사항은 실시간으로 TV에 반영됩니다.</p>';
        h += '</div>';

        // Display settings card
        h += '<div class="at-tv-card">';
        h += '<h3 class="at-tv-card-title">표시 항목 설정</h3>';
        h += '<div class="at-tv-grid">';

        // Checkbox items
        var items = [
            { id: "visitors", label: "오늘의 방문자", icon: "users", defaultChecked: true },
            { id: "ranking", label: "출석왕", icon: "trophy", defaultChecked: true },
            { id: "ar", label: "AR 현황", icon: "glasses", defaultChecked: true },
            { id: "events", label: "이벤트", icon: "calendar", defaultChecked: true },
            { id: "photos", label: "사진", icon: "image", defaultChecked: true },
            { id: "notices", label: "공지사항", icon: "megaphone", defaultChecked: true }
        ];

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            h += '<label class="at-tv-toggle-item">';
            h += '  <input type="checkbox" id="at-tv-' + item.id + '" class="at-tv-checkbox" data-tv-key="' + item.id + '" ' + (item.defaultChecked ? 'checked' : '') + '>';
            h += '  <span class="at-tv-toggle-label">';
            h += '    <span class="at-tv-toggle-icon">';
            h += '      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
            h += '    </span>';
            h += '    <span class="at-tv-toggle-text">' + item.label + '</span>';
            h += '  </span>';
            h += '  <span class="at-tv-toggle-switch"></span>';
            h += '</label>';
        }

        h += '</div>'; // at-tv-grid
        h += '</div>'; // at-tv-card

        // Slide interval setting
        h += '<div class="at-tv-card">';
        h += '<h3 class="at-tv-card-title">슬라이드 전환 간격</h3>';
        h += '<div class="at-tv-interval-setting">';
        h += '<label for="at-tv-interval" class="at-tv-interval-label">전환 시간 (초):</label>';
        h += '<select id="at-tv-interval" class="at-admin-select at-tv-select">';
        h += '  <option value="5">5초</option>';
        h += '  <option value="8" selected>8초</option>';
        h += '  <option value="10">10초</option>';
        h += '  <option value="15">15초</option>';
        h += '  <option value="20">20초</option>';
        h += '</select>';
        h += '</div>';
        h += '</div>';

        // Actions
        h += '<div class="at-tv-actions">';
        h += '<button id="at-tv-preview-btn" class="at-tv-btn at-tv-btn-preview">';
        h += '  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
        h += '  TV 미리보기';
        h += '</button>';
        h += '<button id="at-tv-save-btn" class="at-tv-btn at-tv-btn-save">';
        h += '  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';
        h += '  설정 저장';
        h += '</button>';
        h += '</div>';

        // Status message area
        h += '<div id="at-tv-status-msg" class="at-hidden at-tv-status-msg"></div>';

        h += '</div>'; // at-tv-settings-panel

        return h;
    },

    /**
     * Load current TV settings from Firebase.
     */
    loadSettings: function() {
        var db = window.AT_db;
        if (!db) {
            this._showStatus("Firebase가 초기화되지 않았습니다.", "error");
            return;
        }

        var self = this;
        db.ref("tvSettings/display").once("value").then(function(snapshot) {
            var settings = snapshot.val();
            if (!settings) return;

            // Update checkboxes
            var keys = Object.keys(settings);
            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                var checkbox = document.getElementById("at-tv-" + key);
                if (checkbox) {
                    checkbox.checked = settings[key] === true;
                }
            }
        }).catch(function(error) {
            console.error("[admin-tv] loadSettings error:", error);
        });

        // Load slide interval
        db.ref("tvSettings/slideInterval").once("value").then(function(snapshot) {
            var interval = snapshot.val();
            var select = document.getElementById("at-tv-interval");
            if (select && interval) {
                select.value = String(interval / 1000);
            }
        }).catch(function(error) {
            console.error("[admin-tv] loadInterval error:", error);
        });
    },

    /**
     * Save TV settings to Firebase.
     */
    saveSettings: function() {
        var db = window.AT_db;
        if (!db) {
            this._showStatus("Firebase가 초기화되지 않았습니다.", "error");
            return;
        }

        // Collect display settings
        var display = {};
        var checkboxes = document.querySelectorAll(".at-tv-checkbox");
        checkboxes.forEach(function(cb) {
            var key = cb.getAttribute("data-tv-key");
            display[key] = cb.checked;
        });

        // Collect slide interval
        var intervalSelect = document.getElementById("at-tv-interval");
        var slideInterval = intervalSelect ? parseInt(intervalSelect.value, 10) * 1000 : 8000;

        var self = this;
        var updates = {};
        updates["tvSettings/display"] = display;
        updates["tvSettings/slideInterval"] = slideInterval;

        db.ref().update(updates).then(function() {
            self._showStatus("TV 설정이 저장되었습니다. TV 화면에 실시간 반영됩니다.", "success");
        }).catch(function(error) {
            console.error("[admin-tv] saveSettings error:", error);
            self._showStatus("저장 중 오류가 발생했습니다: " + error.message, "error");
        });
    },

    /**
     * Open TV preview in a new window.
     */
    openPreview: function() {
        // Open tv.html in a new window
        var tvUrl = window.location.origin + "/tv.html";
        window.open(tvUrl, "nchm-tv-preview", "width=1280,height=720,menubar=no,toolbar=no,location=no");
    },

    /**
     * Show status message.
     */
    _showStatus: function(message, type) {
        var msgEl = document.getElementById("at-tv-status-msg");
        if (!msgEl) return;

        msgEl.textContent = message;
        msgEl.className = "at-tv-status-msg";
        if (type === "success") {
            msgEl.classList.add("at-tv-status-success");
        } else {
            msgEl.classList.add("at-tv-status-error");
        }
        msgEl.classList.remove("at-hidden");

        // Auto-hide after 5 seconds
        clearTimeout(this._statusTimer);
        this._statusTimer = setTimeout(function() {
            msgEl.classList.add("at-hidden");
        }, 5000);
    }
};

// NOTE: This module does NOT auto-initialize.
// Initialization is triggered by AT_Auth.onLoginSuccess() to ensure
// admin-only code never runs on the public page.
