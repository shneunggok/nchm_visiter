/**
 * ============================================================================
 * admin-tool / config / collections.js
 * ============================================================================
 * 
 * Firebase database reference initializer.
 * Creates refs based on window.ADMIN_TOOL.collections.
 * ============================================================================
 */

(function() {
    var db = window.AT_db;
    if (!db) {
        console.error("[admin-tool] AT_db not initialized. Ensure firebase.js loads before collections.js");
        return;
    }

    var paths = window.ADMIN_TOOL.collections || {};
    window.AT_visitLogsRef = db.ref(paths.visitLogs || "visitLogs");
    window.AT_arLogsRef = db.ref(paths.arLogs || "arLogs");
    window.AT_arSlotLocksRef = db.ref(paths.arSlotLocks || "arSlotLocks");
})();