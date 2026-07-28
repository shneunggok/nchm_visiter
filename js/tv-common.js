/* Shared, side-effect-free rules used by the TV runtime and TV administrator. */
(function (root) {
    "use strict";

    var FIXED_SLIDE_IDS = [
        "welcome",
        "visitors",
        "attendanceVisit",
        "attendanceAr",
        "ar",
        "events",
        "notices"
    ];
    var THEME_PRESETS = {
        dark: { name: "Midnight Mint", background: "#0B1220", accent: "#2DD4BF", secondary: "#38BDF8" },
        blue: { name: "Graphite Blue", background: "#111827", accent: "#38BDF8", secondary: "#2DD4BF" },
        light: { name: "Warm Ivory", background: "#F7F3EA", accent: "#C2410C", secondary: "#1E3A8A" }
    };
    var BACKGROUND_PRESETS = [
        {
            id: "midnight-mint",
            name: "미드나잇 민트",
            description: "가장 편안한 기본 추천",
            theme: "dark",
            background: "#0B1220",
            accent: "#2DD4BF",
            secondary: "#38BDF8",
            preview: "radial-gradient(circle at 18% 12%, #164E63 0, transparent 38%), linear-gradient(145deg, #0B1220, #111827)"
        },
        {
            id: "museum-navy",
            name: "뮤지엄 네이비",
            description: "차분하고 전문적인 전시관",
            theme: "dark",
            background: "#0A1630",
            accent: "#5EEAD4",
            secondary: "#60A5FA",
            preview: "radial-gradient(circle at 82% 18%, #1E3A8A 0, transparent 38%), linear-gradient(145deg, #0A1630, #111827)"
        },
        {
            id: "deep-ocean",
            name: "딥 오션",
            description: "청록이 은은한 깊은 바다",
            theme: "dark",
            background: "#071A24",
            accent: "#2DD4BF",
            secondary: "#22D3EE",
            preview: "radial-gradient(circle at 25% 20%, #115E59 0, transparent 36%), linear-gradient(145deg, #071A24, #0F2633)"
        },
        {
            id: "forest-night",
            name: "포레스트 나이트",
            description: "눈이 편안한 짙은 녹색",
            theme: "dark",
            background: "#0B1F1A",
            accent: "#34D399",
            secondary: "#67E8F9",
            preview: "radial-gradient(circle at 78% 18%, #14532D 0, transparent 38%), linear-gradient(145deg, #0B1F1A, #10251F)"
        },
        {
            id: "graphite-sky",
            name: "그래파이트 스카이",
            description: "차콜과 선명한 하늘색",
            theme: "blue",
            background: "#111827",
            accent: "#38BDF8",
            secondary: "#2DD4BF",
            preview: "radial-gradient(circle at 20% 15%, #0C4A6E 0, transparent 36%), linear-gradient(145deg, #111827, #1E293B)"
        },
        {
            id: "indigo-glow",
            name: "인디고 글로우",
            description: "행사 화면에 어울리는 남보라",
            theme: "blue",
            background: "#15152B",
            accent: "#67E8F9",
            secondary: "#A78BFA",
            preview: "radial-gradient(circle at 82% 20%, #4C1D95 0, transparent 38%), linear-gradient(145deg, #15152B, #1E1B4B)"
        },
        {
            id: "soft-slate",
            name: "소프트 슬레이트",
            description: "대비가 부드러운 청회색",
            theme: "blue",
            background: "#172033",
            accent: "#7DD3FC",
            secondary: "#5EEAD4",
            preview: "radial-gradient(circle at 25% 20%, #334155 0, transparent 40%), linear-gradient(145deg, #172033, #263449)"
        },
        {
            id: "warm-ivory",
            name: "웜 아이보리",
            description: "밝고 따뜻한 행사 안내",
            theme: "light",
            background: "#F7F3EA",
            accent: "#C2410C",
            secondary: "#1E3A8A",
            preview: "radial-gradient(circle at 80% 18%, #FED7AA 0, transparent 38%), linear-gradient(145deg, #F7F3EA, #FFF7ED)"
        }
    ];

    function sourceId(slide) {
        return String(slide && slide.id || "").split("-")[0];
    }

    function dateStatus(item, dateKey) {
        var start = String(item && item.startDate || "");
        var end = String(item && item.endDate || "");
        if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) return "invalid";
        if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) return "invalid";
        if (start && dateKey < start) return "upcoming";
        if (end && dateKey > end) return "ended";
        return "active";
    }

    function normalizeFixedSlides(slides, defaults) {
        var firstBySource = Object.create(null);
        (Array.isArray(slides) ? slides : []).forEach(function (slide) {
            var id = sourceId(slide);
            if (FIXED_SLIDE_IDS.indexOf(id) >= 0 && !firstBySource[id]) {
                firstBySource[id] = Object.assign({}, slide, { id: id });
            }
        });
        var defaultById = Object.create(null);
        (Array.isArray(defaults) ? defaults : []).forEach(function (slide) {
            defaultById[sourceId(slide)] = slide;
        });
        var rows = FIXED_SLIDE_IDS.map(function (id) {
            return Object.assign(
                { id: id, enabled: true, duration: id.indexOf("attendance") === 0 ? 15 : 8 },
                defaultById[id] || {},
                firstBySource[id] || {},
                { id: id }
            );
        });
        rows.sort(function (a, b) {
            var ai = (Array.isArray(slides) ? slides : []).findIndex(function (slide) { return sourceId(slide) === a.id; });
            var bi = (Array.isArray(slides) ? slides : []).findIndex(function (slide) { return sourceId(slide) === b.id; });
            ai = ai < 0 ? FIXED_SLIDE_IDS.indexOf(a.id) + 10000 : ai;
            bi = bi < 0 ? FIXED_SLIDE_IDS.indexOf(b.id) + 10000 : bi;
            return ai - bi;
        });
        if (!rows.some(function (slide) { return slide.enabled; })) {
            rows.find(function (slide) { return slide.id === "welcome"; }).enabled = true;
        }
        return rows;
    }

    function createdAt(item) {
        var value = item && item.createdAt;
        if (typeof value === "number") return value;
        var parsed = Date.parse(value || "");
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function sortNotices(entries) {
        return entries.slice().sort(function (a, b) {
            var av = a[1] || {};
            var bv = b[1] || {};
            var emergency = Number(Boolean(bv.emergency)) - Number(Boolean(av.emergency));
            if (emergency) return emergency;
            var priority = Number(bv.priority || 0) - Number(av.priority || 0);
            return priority || createdAt(bv) - createdAt(av);
        });
    }

    function sortEvents(entries) {
        return entries.slice().sort(function (a, b) {
            var priority = Number(b[1] && b[1].priority || 0) - Number(a[1] && a[1].priority || 0);
            return priority || createdAt(b[1]) - createdAt(a[1]);
        });
    }

    function cloudFileFingerprint(file) {
        return [file && file.name || "", Number(file && file.size || 0), Number(file && file.lastModified || 0)].join(":");
    }

    root.TVCommon = {
        FIXED_SLIDE_IDS: FIXED_SLIDE_IDS.slice(),
        sourceId: sourceId,
        dateStatus: dateStatus,
        isActive: function (item, dateKey) { return dateStatus(item, dateKey) === "active"; },
        normalizeFixedSlides: normalizeFixedSlides,
        sortNotices: sortNotices,
        sortEvents: sortEvents,
        shouldWriteStatus: function (previewMode) { return !previewMode; },
        canAutoSaveRevision: function (revision, attemptedRevision) { return revision > attemptedRevision; },
        shouldAutoLoadAttendance: function (item, dateKey) { return dateStatus(item, dateKey) === "active"; },
        cloudFileFingerprint: cloudFileFingerprint,
        themePreset: function (theme) {
            return Object.assign({}, THEME_PRESETS[theme] || THEME_PRESETS.dark);
        },
        backgroundPresets: function () {
            return BACKGROUND_PRESETS.map(function (preset) { return Object.assign({}, preset); });
        },
        backgroundPreset: function (id) {
            var preset = BACKGROUND_PRESETS.find(function (item) { return item.id === id; });
            return preset ? Object.assign({}, preset) : null;
        }
    };
})(typeof window !== "undefined" ? window : globalThis);
