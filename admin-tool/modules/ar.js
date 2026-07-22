/**
 * ============================================================================
 * admin-tool / modules / ar.js
 * ============================================================================
 * 
 * AR Reservation Log Management Module.
 * Self-contained Firebase subscription, CRUD with slot-lock transactions.
 * ============================================================================
 */

window.AT_AR = {

    logs: [],
    todayLogs: [],
    _todayQuery: null,
    _allQuery: null,

    save: function(logData) {
        return window.AT_arLogsRef.push({
            date: logData.date,
            timeSlot: logData.timeSlot,
            users: logData.users,
            slotKey: logData.slotKey,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });
    },

    reserveAndSave: function(dateStr, timeSlot, logData) {
        var slotKey = window.AT_Utils.createSlotKey(dateStr, timeSlot);
        var lockRef = window.AT_arSlotLocksRef.child(slotKey);
        var logRef = window.AT_arLogsRef.push();
        var fullData = {
            date: logData.date,
            timeSlot: logData.timeSlot,
            users: logData.users,
            slotKey: slotKey,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };

        return lockRef.transaction(function(current) {
            if (current === null) return true;
            return;
        }).then(function(result) {
            if (!result.committed) {
                var err = new Error("SLOT_TAKEN");
                err.code = "SLOT_TAKEN";
                throw err;
            }
            return logRef.set(fullData).catch(function(err) {
                lockRef.remove().catch(function(cleanupError) {
                    window.AT_Utils.logError("ar.reserve-cleanup", cleanupError);
                });
                throw err;
            });
        });
    },

    subscribeToday: function() {
        var self = this;
        if (this._todayQuery) this._todayQuery.off();

        var todayStr = window.AT_Utils.formatLocalDate(new Date());
        this._todayQuery = window.AT_arLogsRef.orderByChild("date").equalTo(todayStr);

        this._todayQuery.on("value", function(snapshot) {
            self.todayLogs = [];
            snapshot.forEach(function(child) {
                var val = child.val();
                val._key = child.key;
                self.todayLogs.push(val);
            });
        }, function(error) {
            window.AT_Utils.logError("ar.subscribeToday", error);
        });
    },

    subscribeAll: function() {
        var self = this;
        if (this._todayQuery) {
            this._todayQuery.off();
            this._todayQuery = null;
        }
        if (this._allQuery) {
            this._allQuery.off();
        }

        this._allQuery = window.AT_arLogsRef.orderByChild("date");
        this._allQuery.on("value", function(snapshot) {
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
            window.AT_Utils.logError("ar.subscribeAll", error);
        });
    },

    unsubscribeAll: function() {
        if (this._allQuery) {
            this._allQuery.off();
            this._allQuery = null;
        }
        this.logs = [];
        this.subscribeToday();
    },

    delete: function(key) {
        var log = null;
        for (var i = 0; i < this.logs.length; i++) {
            if (this.logs[i]._key === key) {
                log = this.logs[i];
                break;
            }
        }
        var slotKey = log ? window.AT_Utils.createSlotKey(log.date, log.timeSlot) : null;

        var removeLog = window.AT_arLogsRef.child(key).remove();
        var removeLock = slotKey ? window.AT_arSlotLocksRef.child(slotKey).remove() : Promise.resolve();

        Promise.all([removeLog, removeLock])
            .then(function() {
                window.AT_Utils.showMessage("삭제되었습니다.", "info");
            })
            .catch(function(err) {
                window.AT_Utils.logError("ar.delete", err);
                window.AT_Utils.showMessage("삭제 중 오류가 발생했습니다.");
            });
    }
};