const firebaseConfig = {
    apiKey: "AIzaSyDm2x9BtBynGBJYZ56eNjoAMH3fxIGdyyw",
    authDomain: "nchm-131bb.firebaseapp.com",
    databaseURL: "https://nchm-131bb-default-rtdb.firebaseio.com",
    projectId: "nchm-131bb",
    storageBucket: "nchm-131bb.firebasestorage.app",
    messagingSenderId: "592225829882",
    appId: "1:592225829882:web:92942c947bbc498926da43",
    measurementId: "G-W0YLVVCQ9R"
};

const ADMIN_EMAIL = "shneunggok@gmail.com";

const AGE_GROUPS = [
    "초등(9~13세)",
    "중등(14~16세)",
    "고등(17~19세)",
    "청년(20~24세)",
    "청년(25~39세)",
    "유아(8세 미만)",
    "성인(40세 이상)"
];

const DEFAULT_PURPOSE_ITEMS = [
    { icon: "☕", name: "휴식" },
    { icon: "📖", name: "독서" },
    { icon: "🎲", name: "보드게임" },
    { icon: "🏓", name: "탁구" },
    { icon: "💻", name: "스터디룸" }
];

const PURPOSES = DEFAULT_PURPOSE_ITEMS.map((item) => item.name);
