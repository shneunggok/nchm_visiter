window.NCHM = window.NCHM || {};

window.NCHM.config = {
    firebaseConfig: {
        apiKey: "AIzaSyDm2x9BtBynGBJYZ56eNjoAMH3fxIGdyyw",
        authDomain: "nchm-131bb.firebaseapp.com",
        databaseURL: "https://nchm-131bb-default-rtdb.firebaseio.com",
        projectId: "nchm-131bb",
        storageBucket: "nchm-131bb.firebasestorage.app",
        messagingSenderId: "592225829882",
        appId: "1:592225829882:web:92942c947bbc498926da43",
        measurementId: "G-W0YLVVCQ9R"
    },
    adminEmail: "shneunggok@gmail.com",
    ageGroups: [
        "초등(9~13세)",
        "중등(14~16세)",
        "고등(17~19세)",
        "청년(20~24세)",
        "청년(25~39세)",
        "유아(8세 미만)",
        "성인(40세 이상)"
    ],
    purposes: ["휴식", "독서", "보드게임", "탁구", "스터디룸"],
    genders: ["남", "여"],
    dbPaths: {
        visitLogs: "visitLogs",
        arLogs: "arLogs",
        arSlotLocks: "arSlotLocks",
        arRequestLedger: "arRequestLedger",
        auditLogs: "auditLogs"
    },
    limits: {
        minUsersPerSubmission: 1,
        maxUsersPerSubmission: 20,
        maxNameLength: 10,
        adminLoginMaxAttempts: 5,
        adminLoginLockMs: 60 * 1000,
        toastMinMs: 2500,
        toastMaxMs: 4000,
        lockTtlMs: 5 * 60 * 1000,
        retryAttempts: 3,
        retryDelayMs: 400
    },
    messages: {
        genericSaveError: "저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        genericDeleteError: "삭제 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
    },
    schedule: {
        weekday: { startHour: 10, endHour: 19, excludeHours: [12], excludeSlots: [] },
        weekend: { startHour: 10, endHour: 17, excludeHours: [12], excludeSlots: ["17:30"] }
    }
};
