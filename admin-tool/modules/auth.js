/**
 * ============================================================================
 * admin-tool / modules / auth.js
 * ============================================================================
 * 
 * Admin Authentication & Session Management Module.
 * Handles login success, mode switching, idle timeout.
 * ============================================================================
 */

window.AT_Auth = {

    isAdminUser: false,
    _idleTimer: null,
    _watchersInitialized: false,

    onLoginSuccess: function() {
        this.isAdminUser = true;

        // Subscribe to all data
        window.AT_Visit.subscribe();
        window.AT_AR.subscribeAll();

        // Initialize TV management (lazy-loaded, only for admin)
        if (window.AT_TV && typeof window.AT_TV.init === "function") {
            window.AT_TV.init();
        }

        // Start idle timer
        this._resetIdleTimeout();
        this._initActivityWatchers();

        // Enter admin mode after short delay
        var self = this;
        setTimeout(function() {
            self._enterAdminMode();
        }, 500);
    },

    _enterAdminMode: function() {
        var cfg = window.ADMIN_TOOL;
        var themeClass = cfg.theme.adminBodyClass || "at-theme-admin";
        var adminLayout = cfg.theme.adminLayoutClass || "at-max-w-6xl";
        var publicLayout = cfg.theme.publicLayoutClass || "at-max-w-xl";

        // Change body class
        document.body.className = "at-pb-10 " + themeClass;

        // Notify header to show admin mode
        if (window.AT_Header) {
            window.AT_Header.showAdminMode();
        }

        // Show admin tabs
        if (window.AT_Sidebar) {
            window.AT_Sidebar.show();
        }

        // Update dashboard
        if (window.AT_Dashboard) {
            window.AT_Dashboard.update();
        }
    },

    exit: function() {
        var cfg = window.ADMIN_TOOL;
        var adminLayout = cfg.theme.adminLayoutClass || "at-max-w-6xl";
        var publicLayout = cfg.theme.publicLayoutClass || "at-max-w-xl";

        // Hide admin UI
        if (window.AT_Sidebar) {
            window.AT_Sidebar.hide();
        }

        // Notify header to show public mode
        if (window.AT_Header) {
            window.AT_Header.showPublicMode();
        }

        // Unsubscribe
        window.AT_Visit.unsubscribe();
        window.AT_AR.unsubscribeAll();
        this.isAdminUser = false;

        if (this._idleTimer) {
            clearTimeout(this._idleTimer);
            this._idleTimer = null;
        }

        // Restore body class
        document.body.className = "";

        // Re-auth anonymous
        var auth = window.AT_auth;
        if (auth) {
            auth.signOut().then(function() {
                return auth.signInAnonymously();
            }).catch(function(e) {
                window.AT_Utils.logError("auth.exit", e);
            });
        }
    },

    _resetIdleTimeout: function() {
        var self = this;
        if (!this.isAdminUser) return;
        if (this._idleTimer) {
            clearTimeout(this._idleTimer);
        }
        this._idleTimer = setTimeout(function() {
            if (self.isAdminUser) {
                window.AT_Utils.showMessage("관리자 세션이 자동으로 종료되었습니다.", "info");
                self.exit();
            }
        }, window.ADMIN_TOOL.auth.idleTimeoutMs);
    },

    _initActivityWatchers: function() {
        var self = this;
        if (this._watchersInitialized) return;
        this._watchersInitialized = true;

        var handler = function() {
            if (self.isAdminUser) {
                self._resetIdleTimeout();
            }
        };

        document.addEventListener("click", handler);
        document.addEventListener("keydown", handler);
        document.addEventListener("mousemove", handler);
    }
};