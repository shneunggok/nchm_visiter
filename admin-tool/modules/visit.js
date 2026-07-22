/**
 * ============================================================================
 * admin-tool / modules / visit.js
 * ============================================================================
 * 
 * Visit Log Management Module.
 * Self-contained Firebase subscription, CRUD for visit logs.
 * Data stored on window.AT_visitLogs for cross-module access.
 * ============================================================================
 */

window.AT_Visit = {

    logs: [],

    _query: null,

    save: function(logData) {
        return window.AT_visitLogsRef.push({
            date: logData.date,
            time: logData.time,
            name: logData.name,
            gender: logData.gender,
            age: logData.age,
            purposes: logData.purposes,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });
    },

    subscribe: function() {
        var self = this;
        if (this._query) {
            this._query.off();
        }

        this._query = window.AT_visitLogsRef.orderByChild("date");
        this._query.on("value", function(snapshot) {
            self.logs = [];
            snapshot.forEach(function(child) {
                var val = child.val();
                val._key = child.key;
                self.logs.push(val);
            });
            if (window.AT_Dashboard) {
                window.AT_Dashboard.update();
            }
        }, function(error) {
            window.AT_Utils.logError("visit.subscribe", error);
        });
    },

    unsubscribe: function() {
        if (this._query) {
            this._query.off();
            this._query = null;
        }
        this.logs = [];
    },

    delete: function(key) {
        var self = this;
        window.AT_visitLogsRef.child(key).remove()
            .then(function() {
                window.AT_Utils.showMessage("삭제되었습니다.", "info");
            })
            .catch(function(err) {
                window.AT_Utils.logError("visit.delete", err);
                window.AT_Utils.showMessage("삭제 중 오류가 발생했습니다.");
            });
    }
};