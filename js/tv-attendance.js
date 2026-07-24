/**
 * TV attendance-event boards.
 * Keeps event selection, aggregation, masking and rendering separate from the
 * general TV slideshow controller.
 */
var TV_ATTENDANCE_CONFIG = {
    limit: 10,
    defaultDuration: 15,
    visitSlideId: "attendanceVisit",
    arSlideId: "attendanceAr",
    brandLogoUrl: "https://i.ibb.co/Dg5H6WL3/3.png"
};

var tvAttendanceState = {
    events: null,
    visitLogs: null,
    arLogs: null,
    eventError: false,
    visitError: false,
    arError: false,
    preferences: { attendanceVisit: true, attendanceAr: true },
    listeners: [],
    statusDate: "",
    dateTimer: null,
    debugSignatures: {}
};

var TV_ATTENDANCE_SAMPLE_RANKINGS = [
    { name: "김원혁", count: 24 },
    { name: "이민수", count: 21 },
    { name: "박지우", count: 19 },
    { name: "최서준", count: 18 },
    { name: "정도윤", count: 16 },
    { name: "한지민", count: 14 },
    { name: "윤하준", count: 13 },
    { name: "오수빈", count: 11 },
    { name: "강민재", count: 9 },
    { name: "신예은", count: 8 }
];

function isAttendanceDemoMode() {
    return new URLSearchParams(location.search).get("attendanceDemo") === "1";
}

function isAttendanceDebugMode() {
    var params = new URLSearchParams(location.search);
    return params.get("attendanceDebug") === "1" || params.get("preview") === "1";
}

function reportAttendanceDiagnostics(type, event, diagnostics) {
    if (!isAttendanceDebugMode() || !diagnostics) return;
    var summary = {
        type: type,
        eventPeriod: [event.startDate || "", event.endDate || ""],
        rawRecords: diagnostics.rawRecords || 0,
        normalizedRecords: diagnostics.normalizedRecords || 0,
        invalidDate: diagnostics.invalidDate || 0,
        missingUser: diagnostics.missingUser || 0,
        invalidStatus: diagnostics.invalidStatus || 0,
        outOfPeriod: diagnostics.outOfPeriod || 0,
        dailyDuplicate: diagnostics.dailyDuplicate || 0,
        finalUsers: diagnostics.finalUsers || 0
    };
    var signature = JSON.stringify(summary);
    if (tvAttendanceState.debugSignatures[type] === signature) return;
    tvAttendanceState.debugSignatures[type] = signature;
    console.info("[tv-attendance:" + type + ":summary]", summary);
}

function maskAttendanceName(name) {
    var value = String(name || "").trim();
    if (!value) return "이용자";
    if (value.length === 1) return "*";
    if (value.length === 2) return value.charAt(0) + "*";
    return value.charAt(0) + "*" + value.charAt(value.length - 1);
}

function getAttendanceEventStatus(event, today) {
    var currentDate = today || formatLocalDate(new Date());
    if (!event || !event.startDate) return "upcoming";
    if (currentDate < event.startDate) return "upcoming";
    if (event.endDate && currentDate > event.endDate) return "ended";
    return "active";
}

function attendanceStatusLabel(status) {
    if (status === "active") return "진행 중";
    if (status === "ended") return "종료 · 최종 결과";
    return "진행 예정";
}

function formatAttendancePeriod(event) {
    if (!event) return "";
    return (event.startDate || "시작일 미정") + "  —  " + (event.endDate || "종료일 미정");
}

function formatAttendanceUpdated(timestamp) {
    if (!timestamp) return "기록 대기 중";
    return new Date(timestamp).toLocaleString("ko-KR", {
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function selectAttendanceEvent(events, type) {
    var today = formatLocalDate(new Date());
    if (isAttendanceDemoMode()) {
        var monthStart = today.slice(0, 8) + "01";
        var now = new Date();
        var monthEnd = formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
        return {
            type: type,
            title: type === "ar" ? "AR 탐험 출석 챌린지" : "우리 동네 방문 출석 챌린지",
            description: type === "ar" ? "AR 콘텐츠를 체험하고 디지털 출석 순위에 도전해 보세요." : "오늘도 반갑습니다. 방문할 때마다 쌓이는 발걸음을 확인해 보세요.",
            startDate: monthStart,
            endDate: monthEnd,
            criteriaCount: 10,
            enabled: true
        };
    }
    var list = Object.values(events || {}).filter(function(event) {
        return event && event.enabled !== false && event.type === type;
    });
    list.sort(function(a, b) {
        var statusOrder = { active: 0, upcoming: 1, ended: 2 };
        var aStatus = getAttendanceEventStatus(a, today);
        var bStatus = getAttendanceEventStatus(b, today);
        if (statusOrder[aStatus] !== statusOrder[bStatus]) return statusOrder[aStatus] - statusOrder[bStatus];
        if (aStatus === "ended") return String(b.endDate || "").localeCompare(String(a.endDate || ""));
        return String(a.startDate || "").localeCompare(String(b.startDate || ""));
    });
    return list[0] || null;
}

function attendanceSeoulDateFromTimestamp(value) {
    var timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
    var parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date(timestamp));
    var result = {};
    parts.forEach(function(part) { result[part.type] = part.value; });
    return result.year && result.month && result.day ? result.year + "-" + result.month + "-" + result.day : "";
}

function attendanceRecordDate(log) {
    if (!log) return "";
    var rawDate = log.date || log.visitDate || log.attendanceDate || "";
    if (typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDate.trim())) return rawDate.trim();
    if (rawDate) {
        var parsedDate = Date.parse(rawDate);
        if (Number.isFinite(parsedDate)) return attendanceSeoulDateFromTimestamp(parsedDate);
    }
    return attendanceSeoulDateFromTimestamp(log.createdAt || log.timestamp);
}

function attendanceLogTimestamp(log, dateKey) {
    if (Number(log && (log.createdAt || log.timestamp))) return Number(log.createdAt || log.timestamp);
    var time = String((log && (log.time || log.timeSlot)) || "00:00").match(/\d{1,2}:\d{2}/);
    var parsed = new Date((dateKey || "1970-01-01") + "T" + (time ? time[0] : "00:00") + ":00+09:00").getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

function isInvalidAttendanceLog(log) {
    if (!log || typeof log !== "object") return true;
    if (log.cancelled === true || log.canceled === true || log.deleted === true ||
        log.rejected === true || log.invalid === true || log.isTest === true ||
        log.testData === true) return true;
    var status = String(log.status || log.state || log.attendanceStatus || "").trim().toLowerCase();
    return [
        "cancelled", "canceled", "cancel", "deleted", "delete", "rejected",
        "reject", "invalid", "void", "test", "취소", "취소됨", "삭제",
        "삭제됨", "거절", "거부", "무효", "테스트"
    ].indexOf(status) !== -1;
}

function attendanceLogParticipants(log, type) {
    if (!log) return [];
    var source;
    if (type === "ar") {
        source = log.users;
    } else {
        source = log.visitors || log.participants || log.users;
    }
    var users = Array.isArray(source)
        ? source
        : source && typeof source === "object"
            ? Object.values(source)
            : [log];
    return users.map(function(user) {
        var record = user && typeof user === "object" ? user : {};
        return {
            name: String(record.name || record.userName || record.visitorName || record.leaderName || "").trim(),
            age: String(record.age || record.ageGroup || "").trim(),
            uid: String(record.uid || record.userUid || record.userId || record.memberId || record.visitorId || "").trim(),
            phone: String(record.phone || record.phoneNumber || record.mobile || "").replace(/\D/g, "")
        };
    });
}

function attendanceUserKey(participant) {
    if (participant.uid) return "id:" + participant.uid;
    if (participant.phone) return "phone:" + participant.phone;
    var normalizedName = participant.name.toLocaleLowerCase("ko").replace(/\s+/g, "");
    if (!normalizedName) return "";
    return "name:" + normalizedName + "\u0000age:" + participant.age;
}

function normalizeAttendanceRecords(type, logs) {
    var stats = {
        rawRecords: 0,
        normalizedRecords: 0,
        invalidDate: 0,
        missingUser: 0,
        invalidStatus: 0,
        outOfPeriod: 0,
        dailyDuplicate: 0,
        finalUsers: 0
    };
    var records = [];
    Object.values(logs || {}).forEach(function(log) {
        stats.rawRecords += 1;
        if (isInvalidAttendanceLog(log)) {
            stats.invalidStatus += 1;
            return;
        }
        var dateKey = attendanceRecordDate(log);
        if (!dateKey) {
            stats.invalidDate += 1;
            return;
        }
        var timestamp = attendanceLogTimestamp(log, dateKey);
        var participants = attendanceLogParticipants(log, type);
        if (!participants.length) {
            stats.missingUser += 1;
            return;
        }
        participants.forEach(function(participant) {
            var userKey = attendanceUserKey(participant);
            if (!userKey) {
                stats.missingUser += 1;
                return;
            }
            records.push({
                date: dateKey,
                timestamp: timestamp,
                userKey: userKey,
                name: participant.name || "이용자",
                age: participant.age
            });
            stats.normalizedRecords += 1;
        });
    });
    return { records: records, stats: stats };
}

function getAttendanceRankingData(event, logs) {
    if (!event) return { validRecords: [], ranking: [], displayedRanking: [], lastUpdated: 0, diagnostics: {} };
    var normalized = normalizeAttendanceRecords(event.type, logs);
    var stats = normalized.stats;
    var counts = {};
    var dailyParticipants = {};
    var validRecords = [];
    var lastUpdated = 0;
    normalized.records.forEach(function(record) {
        if (record.date < event.startDate || (event.endDate && record.date > event.endDate)) {
            stats.outOfPeriod += 1;
            return;
        }
        lastUpdated = Math.max(lastUpdated, record.timestamp);
        var dailyKey = record.date + "\u0000" + record.userKey;
        if (dailyParticipants[dailyKey]) {
            stats.dailyDuplicate += 1;
            return;
        }
        dailyParticipants[dailyKey] = true;
        validRecords.push(record);
        if (!counts[record.userKey]) {
            counts[record.userKey] = {
                userKey: record.userKey,
                name: record.name,
                age: record.age,
                count: 0,
                lastAt: 0
            };
        }
        counts[record.userKey].count += 1;
        counts[record.userKey].lastAt = Math.max(counts[record.userKey].lastAt, record.timestamp);
    });
    var ranking = Object.values(counts).sort(function(a, b) {
        return b.count - a.count || a.lastAt - b.lastAt ||
            a.userKey.localeCompare(b.userKey, "ko");
    });
    stats.finalUsers = ranking.length;
    return {
        validRecords: validRecords,
        ranking: ranking,
        displayedRanking: ranking.slice(0, TV_ATTENDANCE_CONFIG.limit),
        lastUpdated: lastUpdated,
        diagnostics: stats
    };
}

function sortAttendanceRanking(event, logs) {
    return getAttendanceRankingData(event, logs).displayedRanking;
}

function attendanceBoardHeader(event, status, type) {
    var isAr = type === "ar";
    var title = event.tvTitle || event.title || (isAr ? "AR 출석 이벤트" : "방문 출석 이벤트");
    var description = event.tvSubtitle || event.description || (isAr
        ? "AR 콘텐츠를 체험하고 디지털 출석 순위에 도전해 보세요."
        : "오늘도 반갑습니다. 방문할 때마다 쌓이는 발걸음을 확인해 보세요.");
    return '<header class="tv-attendance-header">' +
        '<div class="tv-attendance-kicker">' + (isAr ? "AR EXPERIENCE LEADERBOARD" : "WELCOME CHECK-IN BOARD") + '</div>' +
        '<div class="tv-attendance-heading-row"><div>' +
        '<h2>' + escapeHtml(title) + '</h2>' +
        '<p>' + escapeHtml(description) + '</p></div>' +
        '<div class="tv-attendance-meta"><span class="tv-attendance-status tv-attendance-status--' + status + '">' + attendanceStatusLabel(status) + '</span>' +
        '<strong>' + escapeHtml(formatAttendancePeriod(event)) + '</strong></div></div></header>';
}

function attendanceGoalBadge(item, criteriaCount) {
    var target = Number(criteriaCount);
    if (!Number.isFinite(target) || target < 1 || !item || item.count < target) return "";
    return '<span class="tv-attendance-goal-badge">🎉 조건 달성 · 사무실로 와주세요</span>';
}

function visitTopThree(ranking, criteriaCount) {
    var order = ranking.length >= 3 ? [1, 0, 2] : ranking.map(function(_, index) { return index; });
    return '<div class="tv-visit-podium tv-visit-podium--count-' + Math.min(ranking.length, 3) + '">' + order.map(function(sourceIndex) {
        var item = ranking[sourceIndex];
        if (!item) return "";
        var rank = sourceIndex + 1;
        return '<article class="tv-visit-podium-card tv-rank-position-' + rank + '">' +
            '<span class="tv-visit-medal">' + (rank === 1 ? "★" : rank) + '</span>' +
            '<div class="tv-visit-podium-main"><small>' + rank + '위</small>' +
            '<div class="tv-visit-podium-person"><strong>' + escapeHtml(maskAttendanceName(item.name)) + '</strong>' +
            '<b>' + item.count + '<em>회</em></b></div>' +
            attendanceGoalBadge(item, criteriaCount) + '</div></article>';
    }).join("") + '</div>';
}

function visitRankingList(ranking, criteriaCount) {
    return '<ol class="tv-visit-ranking-list">' + ranking.slice(3).map(function(item, index) {
        return '<li><span class="tv-attendance-rank-number">' + (index + 4) + '</span>' +
            '<div class="tv-attendance-name-cell"><strong>' + escapeHtml(maskAttendanceName(item.name)) + '</strong>' +
            attendanceGoalBadge(item, criteriaCount) + '</div>' +
            '<b>' + item.count + '<em>회</em></b></li>';
    }).join("") + '</ol>';
}

function arRankingLayout(ranking, criteriaCount) {
    var champion = ranking[0];
    var others = ranking.slice(1);
    return '<div class="tv-ar-ranking-layout">' +
        (champion ? '<article class="tv-ar-champion"><div class="tv-ar-orbit" aria-hidden="true"></div><span class="tv-ar-champion-label">TOP SIGNAL · 01</span>' +
            '<strong>' + escapeHtml(maskAttendanceName(champion.name)) + '</strong><b>' + champion.count + '<em>회 인증</em></b>' +
            attendanceGoalBadge(champion, criteriaCount) + '</article>' : "") +
        '<ol class="tv-ar-ranking-grid">' + others.map(function(item, index) {
            var rank = index + 2;
            return '<li class="' + (rank <= 3 ? "tv-ar-top-rank" : "") + '"><span>' + String(rank).padStart(2, "0") + '</span>' +
                '<div class="tv-attendance-name-cell"><strong>' + escapeHtml(maskAttendanceName(item.name)) + '</strong>' +
                attendanceGoalBadge(item, criteriaCount) + '</div>' +
                '<b>' + item.count + '<em>회</em></b></li>';
        }).join("") + '</ol></div>';
}

function getAttendanceTickerItems(currentType) {
    var types = currentType === "ar" ? ["ar", "visit"] : ["visit", "ar"];
    return types.map(function(type) {
        var event = selectAttendanceEvent(tvAttendanceState.events, type);
        var message = String(event && event.description || "").trim();
        if (!event || getAttendanceEventStatus(event) !== "active" || !message) return null;
        return {
            type: type,
            label: type === "ar" ? "🎮 AR" : "방문",
            message: message
        };
    }).filter(Boolean);
}

function attendanceTickerMarkup(items) {
    if (!items.length) return "";
    var sequence = items.map(function(item, index) {
        var separator = index ? '<span class="tv-attendance-ticker-separator" aria-hidden="true">•</span>' : "";
        return separator + '<span class="tv-attendance-ticker-item">' +
            '<b class="tv-attendance-ticker-badge tv-attendance-ticker-badge--' + item.type + '">' + escapeHtml(item.label) + '</b>' +
            '<span>' + escapeHtml(item.message) + '</span></span>';
    }).join("");
    var repeatedSequence = sequence + '<span class="tv-attendance-ticker-separator tv-attendance-ticker-separator--loop" aria-hidden="true">•</span>' + sequence;
    var messageLength = items.reduce(function(total, item) { return total + item.message.length; }, 0);
    var duration = Math.max(22, Math.min(48, messageLength * 0.42));
    return '<aside class="tv-attendance-ticker" aria-label="진행 중인 출석 이벤트 안내">' +
        '<div class="tv-attendance-ticker-track" style="--tv-attendance-ticker-duration:' + duration + 's">' +
        '<div class="tv-attendance-ticker-group">' + repeatedSequence + '</div>' +
        '<div class="tv-attendance-ticker-group" aria-hidden="true">' + repeatedSequence + '</div>' +
        '</div></aside>';
}

function attendanceEmptyState(type, kind, customMessage) {
    var isAr = type === "ar";
    var title = kind === "error" ? "순위 정보를 불러오지 못했습니다"
        : kind === "upcoming" ? "이벤트 시작을 기다리고 있습니다"
        : kind === "participants" ? "아직 출석 기록이 없습니다"
        : "현재 등록된 출석 이벤트가 없습니다";
    var text = kind === "error" ? "연결이 복구되면 화면이 자동으로 다시 갱신됩니다."
        : kind === "upcoming" ? "이벤트가 시작되면 참여 순위가 이곳에 표시됩니다."
        : kind === "participants" ? (customMessage || "첫 번째 참여자가 되어 순위표를 시작해 주세요.")
        : "새로운 이벤트가 시작되면 이 화면에 안내됩니다.";
    return '<div class="tv-attendance-empty"><span aria-hidden="true">' + (isAr ? "⌁" : "✓") + '</span><h2>' + title + '</h2><p>' + text + '</p></div>';
}

function renderAttendanceBoard(type) {
    var isAr = type === "ar";
    var root = isAr ? TV_DOM.attendanceArBoard : TV_DOM.attendanceVisitBoard;
    if (!root) return;
    var demoMode = isAttendanceDemoMode();
    var hasError = isAr ? tvAttendanceState.arError : tvAttendanceState.visitError;
    if (!demoMode && (tvAttendanceState.eventError || hasError)) {
        var errorSignature = type + ":error";
        if (root.dataset.renderSignature !== errorSignature) {
            root.dataset.renderSignature = errorSignature;
            root.innerHTML = attendanceEmptyState(type, "error");
        }
        return;
    }

    var event = selectAttendanceEvent(tvAttendanceState.events, type);
    if (!event) {
        var emptySignature = type + ":no-event";
        if (root.dataset.renderSignature !== emptySignature) {
            root.dataset.renderSignature = emptySignature;
            root.innerHTML = attendanceEmptyState(type, "event");
        }
        return;
    }

    var logs = isAr ? tvAttendanceState.arLogs : tvAttendanceState.visitLogs;
    var rankingData = demoMode
        ? {
            validRecords: [],
            ranking: TV_ATTENDANCE_SAMPLE_RANKINGS,
            displayedRanking: TV_ATTENDANCE_SAMPLE_RANKINGS,
            lastUpdated: 0
        }
        : getAttendanceRankingData(event, logs);
    var ranking = rankingData.displayedRanking;
    reportAttendanceDiagnostics(type, event, rankingData.diagnostics);
    var tickerItems = getAttendanceTickerItems(type);
    var status = getAttendanceEventStatus(event);
    var signature = JSON.stringify({
        type: type,
        event: [event.title, event.description, event.tvTitle, event.tvSubtitle, event.tvEmptyMessage, event.startDate, event.endDate, event.criteriaCount, status],
        ranking: ranking.map(function(item) { return [item.name, item.age, item.count, item.lastAt]; }),
        ticker: tickerItems.map(function(item) { return [item.type, item.message]; })
    });
    if (root.dataset.renderSignature === signature) return;
    root.dataset.renderSignature = signature;

    var newestLog = rankingData.lastUpdated;
    var rankingContent = status === "upcoming"
        ? attendanceEmptyState(type, "upcoming")
        : ranking.length
        ? (isAr ? arRankingLayout(ranking, event.criteriaCount) : visitTopThree(ranking, event.criteriaCount) + visitRankingList(ranking, event.criteriaCount))
        : attendanceEmptyState(type, "participants", event.tvEmptyMessage);
    root.innerHTML = attendanceBoardHeader(event, status, type) +
        '<main class="tv-attendance-ranking">' + rankingContent + '</main>' +
        '<footer class="tv-attendance-footer">' +
        '<img class="tv-attendance-brand-logo" src="' + TV_ATTENDANCE_CONFIG.brandLogoUrl + '" alt="시흥시능곡청소년문화의집">' +
        '<span>개인정보 보호를 위해 이름 일부를 가려 표시합니다.</span>' +
        '<strong>' + (demoMode ? "예시 데이터" : "마지막 갱신 " + escapeHtml(formatAttendanceUpdated(newestLog))) + '</strong></footer>' +
        attendanceTickerMarkup(tickerItems);
}

function setAttendanceSlidePreferences(settings) {
    var slides = settings && Array.isArray(settings.slides) ? settings.slides : [];
    [TV_ATTENDANCE_CONFIG.visitSlideId, TV_ATTENDANCE_CONFIG.arSlideId].forEach(function(id) {
        var configured = slides.find(function(slide) { return slide && String(slide.id).split("-")[0] === id; });
        tvAttendanceState.preferences[id] = configured ? configured.enabled !== false : true;
    });
    syncAttendanceSlideAvailability();
}

function ensureAttendanceSlidesInPlaylist() {
    var anchor = TV_CONFIG.slideOrder.findIndex(function(id) { return String(id).split("-")[0] === "visitors"; });
    [TV_ATTENDANCE_CONFIG.visitSlideId, TV_ATTENDANCE_CONFIG.arSlideId].forEach(function(id, offset) {
        if (!TV_CONFIG.slideOrder.some(function(slideId) { return String(slideId).split("-")[0] === id; })) {
            TV_CONFIG.slideOrder.splice(Math.max(0, anchor + 1 + offset), 0, id);
        }
    });
}

function syncAttendanceSlideAvailability() {
    if (typeof TV_CONFIG === "undefined") return;
    ensureAttendanceSlidesInPlaylist();
    var visitEvent = selectAttendanceEvent(tvAttendanceState.events, "visit");
    var arEvent = selectAttendanceEvent(tvAttendanceState.events, "ar");
    var showCommonEmpty = tvAttendanceState.eventError || (tvAttendanceState.events !== null && !visitEvent && !arEvent);
    var nextVisit = Boolean((visitEvent || showCommonEmpty) && tvAttendanceState.preferences.attendanceVisit);
    var nextAr = Boolean(arEvent && tvAttendanceState.preferences.attendanceAr);
    var changed = TV_CONFIG.enabledSlides.attendanceVisit !== nextVisit || TV_CONFIG.enabledSlides.attendanceAr !== nextAr;
    TV_CONFIG.enabledSlides.attendanceVisit = nextVisit;
    TV_CONFIG.enabledSlides.attendanceAr = nextAr;
    document.querySelectorAll(".tv-dot").forEach(function(dot) {
        var slideId = dot.getAttribute("data-slide");
        if (slideId === "attendanceVisit") dot.hidden = !nextVisit;
        if (slideId === "attendanceAr") dot.hidden = !nextAr;
    });
    if (changed && typeof tvInitialized !== "undefined" && tvInitialized) startSlideshow();
}

function attendanceSnapshotValue(snapshot) {
    var result = {};
    snapshot.forEach(function(child) { result[child.key] = child.val(); });
    return result;
}

function refreshAttendanceDateState() {
    var today = formatLocalDate(new Date());
    if (tvAttendanceState.statusDate === today) return;
    tvAttendanceState.statusDate = today;
    renderAttendanceBoard("visit");
    renderAttendanceBoard("ar");
    syncAttendanceSlideAvailability();
}

function startAttendanceDateTimer() {
    if (tvAttendanceState.dateTimer) return;
    tvAttendanceState.statusDate = formatLocalDate(new Date());
    tvAttendanceState.dateTimer = window.setInterval(refreshAttendanceDateState, 60000);
}

function subscribeAttendanceBoards() {
    startAttendanceDateTimer();
    if (tvAttendanceState.listeners.length) return;
    if (isAttendanceDemoMode()) {
        tvAttendanceState.events = {};
        tvAttendanceState.visitLogs = {};
        tvAttendanceState.arLogs = {};
        renderAttendanceBoard("visit");
        renderAttendanceBoard("ar");
        syncAttendanceSlideAvailability();
        return;
    }
    var sources = [
        { ref: db.ref("tvContent/attendanceEvents"), state: "events", error: "eventError", label: "attendanceEvents" },
        { ref: visitLogsRef, state: "visitLogs", error: "visitError", label: "visitLogs" },
        { ref: arLogsRef, state: "arLogs", error: "arError", label: "arLogs" }
    ];
    sources.forEach(function(source) {
        var success = function(snapshot) {
            tvAttendanceState[source.state] = attendanceSnapshotValue(snapshot);
            tvAttendanceState[source.error] = false;
            renderAttendanceBoard("visit");
            renderAttendanceBoard("ar");
            syncAttendanceSlideAvailability();
        };
        var failure = function(error) {
            console.error("[tv-attendance:" + source.label + "] Firebase subscription error:", error && (error.code || error.message));
            tvAttendanceState[source.error] = true;
            renderAttendanceBoard("visit");
            renderAttendanceBoard("ar");
        };
        source.ref.on("value", success, failure);
        tvAttendanceState.listeners.push({ ref: source.ref, success: success });
    });
}

function unsubscribeAttendanceBoards() {
    tvAttendanceState.listeners.forEach(function(listener) {
        listener.ref.off("value", listener.success);
    });
    tvAttendanceState.listeners = [];
    if (tvAttendanceState.dateTimer) {
        window.clearInterval(tvAttendanceState.dateTimer);
        tvAttendanceState.dateTimer = null;
    }
    tvAttendanceState.statusDate = "";
    tvAttendanceState.debugSignatures = {};
}
