/**
 * ============================================================================
 * admin-tool / components / sidebar.js
 * ============================================================================
 * 
 * Self-rendering admin sidebar / tab navigation.
 * Reads menu items from window.ADMIN_TOOL.menu configuration.
 * Preserves exact original tab structure and styling.
 * hello eveyone if you see this message pls say hello to me (maerong)
 * ============================================================================
 */

window.AT_Sidebar = {

    /**
     * Render the admin sub-tab navigation.
     * @param {HTMLElement} container - The element to render into.
     */
    renderTabs: function(container) {
        var cfg = window.ADMIN_TOOL;
        var menuItems = cfg.menu || [];
        var currentMenu = menuItems.length > 0 ? menuItems[0] : null;
        if (!currentMenu) return;

        var subTabs = cfg.subTabs && cfg.subTabs[currentMenu.id] || [];
        if (subTabs.length === 0) return;

        var html = '<div id="at-admin-tabs" class="at-admin-tabs at-hidden">';
        subTabs.forEach(function(tab) {
            var activeClass = tab === subTabs[0] ? ' at-' + tab.theme + '-active' : '';
            html += '<button data-at-tab="' + tab.id + '" class="at-tab-btn' + activeClass + '">' + tab.label + '</button>';
        });
        html += '</div>';

        container.innerHTML = html;

        // Wire tab switching
        var tabs = container.querySelectorAll("[data-at-tab]");
        var self = this;
        tabs.forEach(function(btn) {
            btn.addEventListener("click", function() {
                var tabId = this.getAttribute("data-at-tab");
                self.switchTab(tabId);
            });
        });
    },

    /**
     * Switch between admin sub-tabs.
     */
    switchTab: function(tabId) {
        var visitSection = document.getElementById("at-admin-visit-logs");
        var arSection = document.getElementById("at-admin-ar-logs");

        if (visitSection) visitSection.classList.add("at-hidden");
        if (arSection) arSection.classList.add("at-hidden");

        var allBtns = document.querySelectorAll("#at-admin-tabs .at-tab-btn");
        allBtns.forEach(function(btn) {
            btn.className = "at-tab-btn";
        });

        if (tabId === "visit-logs") {
            if (visitSection) visitSection.classList.remove("at-hidden");
            var activeBtn = document.querySelector('[data-at-tab="visit-logs"]');
            if (activeBtn) activeBtn.classList.add("at-visit-active");
        } else if (tabId === "ar-logs") {
            if (arSection) arSection.classList.remove("at-hidden");
            var activeBtn = document.querySelector('[data-at-tab="ar-logs"]');
            if (activeBtn) activeBtn.classList.add("at-ar-active");
        }
    },

    show: function() {
        var el = document.getElementById("at-admin-tabs");
        if (el) el.classList.remove("at-hidden");
    },

    hide: function() {
        var el = document.getElementById("at-admin-tabs");
        if (el) el.classList.add("at-hidden");
    }
};