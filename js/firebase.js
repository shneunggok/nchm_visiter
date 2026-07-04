firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.database();
const visitLogsRef = db.ref("visitLogs");
const arLogsRef = db.ref("arLogs");
const arSlotLocksRef = db.ref("arSlotLocks");
