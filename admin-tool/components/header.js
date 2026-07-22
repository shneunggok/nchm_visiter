/**
 * ============================================================================
 * admin-tool / components / header.js
 * ============================================================================
 * 
 * Self-rendering admin header component.
 * Renders: logo, current date, admin entry button, exit button.
 * ============================================================================
 */

window.AT_Header = {

    render: function(container) {
        var cfg = window.ADMIN_TOOL;
        var branding = cfg.branding;
        var logoUrl = branding.logoUrl || "";
        var logoAlt = branding.logoAlt || "";

        var html = '<nav class="at-navbar" id="at-navbar">';
        html += '<a href="#" class="at-logo-link">';
        html += '<img src="' + logoUrl + '" alt="' + logoAlt + '" class="at-logo-img">';
        html += '</a>';
        html += '<div class="at-flex at-items-center at-space-x-3">';
        html += '<span class="at-date-badge" id="at-current-date"></span>';
        html += '<button id="at-admin-entry-btn" class="at-entry-btn">';
        html += '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
        html += '</button>';
        html += '<button id="at-exit-admin-btn" class="at-exit-btn at-hidden">';
        html += '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';
        html += '</button>';
        html += '</div>';
        html += '</nav>';

        container.innerHTML = html;

        var now = new Date();
        var dateEl = document.getElementById("at-current-date");
        if (dateEl) {
            dateEl.textContent = now.getFullYear() + "." + (now.getMonth() + 1) + "." + now.getDate();
        }

        var entryBtn = document.getElementById("at-admin-entry-btn");
        if (entryBtn) {
            entryBtn.addEventListener("click", function() {
                if (window.AT_Modal) {
                    window.AT_Modal.open();
                }
            });
        }

        var exitBtn = document.getElementById("at-exit-admin-btn");
        if (exitBtn) {
            exitBtn.addEventListener("click", function() {
                if (window.AT_Auth) {
                    window.AT_Auth.exit();
                }
            });
        }
    },

    showAdminMode: function() {
        var entryBtn = document.getElementById("at-admin-entry-btn");
        var exitBtn = document.getElementById("at-exit-admin-btn");
        if (entryBtn) entryBtn.classList.add("at-hidden");
        if (exitBtn) exitBtn.classList.remove("at-hidden");
    },

    showPublicMode: function() {
        var entryBtn = document.getElementById("at-admin-entry-btn");
        var exitBtn = document.getElementById("at-exit-admin-btn");
        if (exitBtn) exitBtn.classList.add("at-hidden");
        if (entryBtn) entryBtn.classList.remove("at-hidden");
    }
};