window.NCHM = window.NCHM || {};

(function bootstrapFirebase(namespace) {
    const config = namespace.config;

    if (!window.firebase) {
        throw new Error("Firebase SDK is not loaded.");
    }

    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(config.firebaseConfig);
    const auth = firebase.auth();
    const database = firebase.database();
    const refs = {
        root: database.ref(),
        visitLogs: database.ref(config.dbPaths.visitLogs),
        arLogs: database.ref(config.dbPaths.arLogs),
        arSlotLocks: database.ref(config.dbPaths.arSlotLocks),
        arRequestLedger: database.ref(config.dbPaths.arRequestLedger),
        auditLogs: database.ref(config.dbPaths.auditLogs)
    };

    namespace.firebase = {
        app,
        auth,
        database,
        refs,
        serverTimestamp: firebase.database.ServerValue.TIMESTAMP
    };
})(window.NCHM);
