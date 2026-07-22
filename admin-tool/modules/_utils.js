/**
 * ============================================================================
 * admin-tool / modules / _utils.js
 * ============================================================================
 * 
 * Shared utility functions used across all admin-tool modules.
 * Self-contained - does NOT depend on any host project code.
 * ============================================================================
 */

window.AT_Utils = {

    _toastTimer: null,

    escapeHtml: function(value) {
        var div = document.createElement("div");
        div.textContent = value === null || value === undefined ? "" : String(value);
        return div.innerHTML;
    },

    logError: function(context, error) {
        var code = error && error.code ? error.code : "unknown_error";
        console.error("[admin-tool:" + context + "] " + code);
    },

    sanitizeCsvField: function(value) {
        var str = value === null || value === undefined ? "" : String(value);
        if (/^[=+\-@]/.test(str)) {
            return "'" + str;
        }
        return str;
    },

    formatLocalDate: function(date) {
        if (!date) date = new Date();
        var year = date.getFullYear();
        var month = String(date.getMonth() + 1).padStart(2, "0");
        var day = String(date.getDate()).padStart(2, "0");
        return year + "-" + month + "-" + day;
    },

    createSlotKey: function(dateStr, timeSlot) {
        return (dateStr + "_" + timeSlot).replace(/[.#$\[\]\/]/g, "-");
    },

    showMessage: function(msg, type) {
        type = type || "error";
        var box = document.getElementById("at-custom-alert");
        if (!box) {
            box = document.createElement("div");
            box.id = "at-custom-alert";
            box.className = "at-alert-box";
            document.body.appendChild(box);
        }

        if (this._toastTimer) {
            clearTimeout(this._toastTimer);
            this._toastTimer = null;
        }

        box.textContent = msg;
        box.className = "at-alert-box";
        if (type === "success") box.classList.add("at-alert-success");
        if (type === "info") box.classList.add("at-alert-info");
        box.style.display = "block";

        var duration = Math.min(4000, Math.max(2500, msg.length * 60));
        var self = this;
        this._toastTimer = setTimeout(function() {
            box.style.display = "none";
            box.className = "at-alert-box";
            self._toastTimer = null;
        }, duration);
    }
};