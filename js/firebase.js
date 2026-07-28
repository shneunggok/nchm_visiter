firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.database();
const useLocalFirebaseEmulator = ["localhost", "127.0.0.1"].includes(location.hostname)
    && new URLSearchParams(location.search).get("firebaseEmulator") === "1";
if (useLocalFirebaseEmulator) {
    auth.useEmulator("http://127.0.0.1:9099", { disableWarnings: true });
    db.useEmulator("127.0.0.1", 9000);
}
const visitLogsRef = db.ref("visitLogs");
const arLogsRef = db.ref("arLogs");
const arSlotLocksRef = db.ref("arSlotLocks");
