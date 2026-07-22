/* ============================================================================
 * admin-tool / admin.js
 * 
 * █████╗ ██████╗ ███╗   ███╗██╗███╗   ██╗
 * ██╔══██╗██╔══██╗████╗ ████║██║████╗  ██║
 * ███████║██║  ██║██╔████╔██║██║██╔██╗ ██║
 * ██╔══██║██║  ██║██║╚██╔╝██║██║██║╚██╗██║
 * ██║  ██║██████╔╝██║ ╚═╝ ██║██║██║ ╚████║
 * ╚═╝  ╚═╝╚═════╝ ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝
 * 
 * Self-Contained Administrator Framework
 * ============================================================================
 * 
 * HOW TO INSTALL IN ANY PROJECT:
 * 
 * 1. Copy the entire admin-tool/ folder into your project.
 * 
 * 2. Add these lines to your HTML (AFTER Firebase SDK):
 * 
 *    <link rel="stylesheet" href="./admin-tool/admin.css">
 *    <div id="admin-root"></div>
 *    <script src="./admin-tool/admin.js"></script>
 *    <script>
 *      AdminTool.init({
 *        firebase: { ... your Firebase config ... },
 *        auth: { adminEmail: "admin@example.com" },
 *        branding: { logoUrl: "path/to/logo.png" },
 *        ageGroups: [ ... ],
 *        visitPurposes: [ ... ]
 *      });
 *    </script>
 * 
 * 3. That's it. The admin tool self-renders into #admin-root.
 * 
 * ============================================================================
 * LOAD ORDER (automatic):
 *   1. config/settings.js      (window.ADMIN_TOOL_DEFAULTS)
 *   2. modules/_utils.js       (window.AT_Utils)
 *   3. config/firebase.js      (window.AT_auth, AT_db)
 *   4. config/collections.js   (window.AT_visitLogsRef, etc.)
 *   5. components/header.js    (window.AT_Header)
 *   6. components/modal.js     (window.AT_Modal)
 *   7. components/sidebar.js   (window.AT_Sidebar)
 *   8. components/table.js     (window.AT_Table)
 *   9. components/cards.js     (window.AT_Cards)
 *  10. modules/visit.js        (window.AT_Visit)
 *  11. modules/ar.js           (window.AT_AR)
 *  12. modules/statistics.js   (window.AT_Stats)
 *  13. modules/dashboard.js    (window.AT_Dashboard)
 *  14. modules/auth.js         (window.AT_Auth)
 *  15. admin.js                (THIS FILE - Bootstrapper)
 * ============================================================================
 */

(function() {

    var SRC = "admin-tool/";
    var _initialized = false;
    var _pendingConfig = null;

    // ==================== Script Load Queue ====================
    var scripts = [
        SRC + "config/settings.js",
        SRC + "modules/_utils.js",
        SRC + "config/firebase.js",
        SRC + "config/collections.js",
        SRC + "components/header.js",
        SRC + "components/modal.js",
        SRC + "components/sidebar.js",
        SRC + "components/table.js",
        SRC + "components/cards.js",
        SRC + "modules/visit.js",
        SRC + "modules/ar.js",
        SRC + "modules/statistics.js",
        SRC + "modules/dashboard.js",
        SRC + "modules/auth.js"
    ];

    // Future expansion modules (load only if feature flag is on)
    var futureModules = {
        "events":     { flag: "eventManagement",     path: "modules/events.js" },
        "notices":    { flag: "noticeManagement",     path: "modules/notices.js" },
        "popup":      { flag: "popupManagement",     path: "modules/popup.js" },
        "tv":         { flag: "tvDashboard",         path: "modules/tv.js" }
    };

    function loadScripts(index, callback) {
        if (index >= scripts.length) {
            loadFutureModules(callback);
            return;
        }

        var script = document.createElement("script");
        script.src = scripts[index];
        script.onload = function() {
            loadScripts(index + 1, callback);
        };
        script.onerror = function() {
            console.error("[admin-tool] Failed to load: " + scripts[index]);
            loadScripts(index + 1, callback);
        };
        document.body.appendChild(script);
    }

    function loadFutureModules(callback) {
        var cfg = window.ADMIN_TOOL;
        if (!cfg || !cfg.features) {
            if (callback) callback();
            return;
        }

        var keys = Object.keys(futureModules);
        var loaded = 0;

        function loadNext() {
            if (loaded >= keys.length) {
                if (callback) callback();
                return;
            }
            var key = keys[loaded];
            var mod = futureModules[key];
            if (cfg.features[mod.flag]) {
                var script = document.createElement("script");
                script.src = SRC + mod.path;
                script.onload = function() {
                    loaded++;
                    loadNext();
                };
                script.onerror = function() {
                    console.error("[admin-tool] Failed to load: " + mod.path);
                    loaded++;
                    loadNext();
                };
                document.body.appendChild(script);
            } else {
                loaded++;
                loadNext();
            }
        }

        loadNext();
    }

    // ==================== Bootstrap ====================
    function bootstrap() {
        var root = document.getElementById("admin-root");
        if (!root) {
            console.error("[admin-tool] #admin-root not found. Add <div id='admin-root'></div> to your HTML.");
            return;
        }

        // Render header into admin-root
        window.AT_Header.render(root);

        // Create a container for the rest of the admin UI
        var headerEl = root.querySelector(".at-navbar");
        var restContainer = document.createElement("div");
        restContainer.id = "at-rest-container";
        if (headerEl && headerEl.parentNode) {
            headerEl.parentNode.insertBefore(restContainer, headerEl.nextSibling);
        } else {
            root.appendChild(restContainer);
        }

        // Render sidebar tabs into rest-container
        window.AT_Sidebar.renderTabs(restContainer);

        // Create a container for the dashboard
        var dashboardContainer = document.createElement("div");
        dashboardContainer.id = "at-dashboard-container";
        restContainer.appendChild(dashboardContainer);

        // Render modal into body
        var modalContainer = document.createElement("div");
        modalContainer.id = "at-modal-container";
        document.body.appendChild(modalContainer);
        window.AT_Modal.render(modalContainer);

        // Render dashboard into dashboard container
        window.AT_Dashboard.render(dashboardContainer);

        // Start anonymous auth
        window.AT_auth.signInAnonymously().catch(function(e) {
            window.AT_Utils.logError("bootstrap", e);
        });

        _initialized = true;
        console.log("[admin-tool] Bootstrapped successfully");
    }

    // ==================== Public API ====================

    window.AdminTool = {

        /**
         * Initialize the admin tool with project-specific configuration.
         * 
         * This is the ONLY function you need to call.
         * Call it AFTER loading admin.js.
         * 
         * @param {Object} config - Project configuration
         * @param {Object} config.firebase - Firebase configuration (REQUIRED)
         * @param {string} config.auth.adminEmail - Admin email (REQUIRED)
         * @param {Object} [config.branding] - Branding options
         * @param {Array} [config.ageGroups] - Age group labels
         * @param {Array} [config.visitPurposes] - Visit purpose labels
         * @param {Object} [config.collections] - Firebase collection paths
         * @param {Object} [config.menu] - Navigation menu items
         * @param {Object} [config.subTabs] - Sub-tab definitions
         * @param {Object} [config.stats] - Statistics labels
         * @param {Object} [config.features] - Feature flags
         * @param {Object} [config.excel] - Excel export settings
         */
        init: function(config) {
            if (_initialized) {
                console.warn("[admin-tool] Already initialized. Call AdminTool.init() only once.");
                return;
            }

            if (!config) {
                console.error("[admin-tool] AdminTool.init() requires a configuration object.");
                return;
            }

            if (!config.firebase) {
                console.error("[admin-tool] AdminTool.init() requires config.firebase (Firebase configuration).");
                return;
            }

            if (!config.auth || !config.auth.adminEmail) {
                console.error("[admin-tool] AdminTool.init() requires config.auth.adminEmail.");
                return;
            }

            // Merge defaults with user config
            var defaults = window.ADMIN_TOOL_DEFAULTS || {};
            var merged = deepMerge(defaults, config);

            // Store merged config globally
            window.ADMIN_TOOL = merged;

            // Start loading modules
            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", function() {
                    loadScripts(0, bootstrap);
                });
            } else {
                loadScripts(0, bootstrap);
            }
        }
    };

    // ==================== Utility: Deep Merge ====================

    function deepMerge(target, source) {
        var result = {};
        
        // Copy target properties
        for (var key in target) {
            if (target.hasOwnProperty(key)) {
                result[key] = target[key];
            }
        }

        // Merge source properties
        for (var key in source) {
            if (source.hasOwnProperty(key)) {
                if (typeof source[key] === "object" && source[key] !== null && !Array.isArray(source[key]) && typeof result[key] === "object" && result[key] !== null && !Array.isArray(result[key])) {
                    result[key] = deepMerge(result[key], source[key]);
                } else {
                    result[key] = source[key];
                }
            }
        }

        return result;
    }

})();