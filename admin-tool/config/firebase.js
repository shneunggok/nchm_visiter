/**
 * ============================================================================
 * admin-tool / config / firebase.js
 * ============================================================================
 * 
 * Self-contained Firebase initialization.
 * Reads configuration from window.ADMIN_TOOL.firebase.
 * Does NOT depend on the host project's Firebase setup.
 * ============================================================================
 */

(function() {
    const cfg = window.ADMIN_TOOL && window.ADMIN_TOOL.firebase;
    if (!cfg) {
        console.error("[admin-tool] Firebase config not found in window.ADMIN_TOOL.firebase");
        return;
    }

    // Only initialize if not already initialized
    if (!firebase.apps.length) {
        firebase.initializeApp(cfg);
    }

    window.AT_auth = firebase.auth();
    window.AT_db = firebase.database();
})();