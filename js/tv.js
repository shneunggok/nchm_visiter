/**
 * tv.js
 * TV Display System for NCHM Youth Center
 * 
 * - Real-time slideshow with auto-rotation
 * - Firebase Realtime Database subscriptions
 * - Live clock display
 * - Connection status monitoring
 * 
 * Dependencies:
 *   - js/config.js  (firebaseConfig, constants)
 *   - js/firebase.js (db, auth, refs)
 *   - js/utils.js   (formatLocalDate, escapeHtml, etc.)
 */

// ==================== TV Configuration ====================
const TV_CONFIG = {
    slideInterval: 8000,        // 8 seconds per slide
    transitionDuration: 800,    // CSS transition duration (ms)
    slideOrder: [
        "welcome",
        "visitors",
        "attendanceVisit",
        "attendanceAr",
        "ar",
        "events",
        "notices"
    ],
    enabledSlides: {
        welcome: true,   // Welcome is always shown
        visitors: true,
        attendanceVisit: true,
        attendanceAr: true,
        ar: true,
        events: true,
        notices: true
    }
};

// ==================== State ====================
let currentSlideIndex = 0;
let slideTimer = null;
let isTransitioning = false;
let tvInitialized = false;
let tvSettingsListener = null;
let visitorListener = null;
let arListener = null;
let eventsListener = null;
let noticesListener = null;
let eventImageTimer = null;
let eventImageIndex = 0;
let tvLastSettings = {};
let clockTimer = null;
let resumeTimer = null;
let statusTimer = null;
let lastStatusWriteAt = 0;
let pendingStatusSlideId = "";
const TV_STATUS_HEARTBEAT_MS = 5 * 60 * 1000;
const TV_PREVIEW_MODE = new URLSearchParams(location.search).get("preview") === "1";
const TV_PREVIEW_STORAGE_KEY = "nchm.tv.preview.v1";
let navigationBound = false;
let tvDestroyed = false;
let tvRealtimeSubscribed = false;
let tvRealtimeAuthUid = "";
let tvSubscriptionGeneration = 0;
let tvAuthStateUnsubscribe = null;
let tvAuthRecoveryPromise = null;
let tvAuthRecoveryTimer = null;
let tvReconnectTimer = null;
let tvSubscriptionHealthTimer = null;
let tvRetrySignature = "";
let tvRetryAttemptsBySignature = Object.create(null);
let tvRetryTotalAttempts = 0;
let tvRetryBlocked = false;
let tvObservedAuthUid = "";
let tvRequiredSubscriptionSources = new Set();
let tvHealthySubscriptionSources = new Set();
let tvRuntimeMetrics = {
    subscriptionSets: 0,
    authAttempts: 0,
    retrySchedules: 0
};
let tvSubscribedDate = "";
let tvEventsCache = null;
let tvNoticesCache = null;
let tvPreviewDraft = null;
let tvHadActiveEvents = false;
let tvHadActiveNotices = false;
let tvConfiguredSlideEnabled = Object.assign({}, TV_CONFIG.enabledSlides);
let tvContentAvailability = { events: null, notices: null };
const TV_RETRY_DELAYS_MS = [
    500,
    2000,
    5000,
    15000,
    30000,
    60000,
    120000,
    180000,
    300000,
    300000
];
const TV_RETRY_JITTER_RATIO = 0.2;
const TV_MAX_RETRY_ATTEMPTS = TV_RETRY_DELAYS_MS.length;
const TV_SUBSCRIPTION_READY_TIMEOUT_MS = 60000;
const TV_CORE_SUBSCRIPTION_SOURCES = [
    "tvSettings",
    "visitLogs",
    "arSlotLocks",
    "attendanceEvents",
    "events",
    "notices"
];

if (TV_PREVIEW_MODE) {
    try {
        tvPreviewDraft = JSON.parse(sessionStorage.getItem(TV_PREVIEW_STORAGE_KEY) || "null");
    } catch (error) {
        console.warn("[tv] invalid preview draft ignored");
    }
}

// ==================== Firebase Refs ====================
const tvSettingsRef = db.ref("tvSettings");
const tvContentRef = db.ref("tvContent");

// ==================== DOM Caching ====================
const TV_DOM = {};

function cacheTVDOM() {
    TV_DOM.container = document.getElementById("tv-container");
    TV_DOM.clock = document.getElementById("tv-clock");
    TV_DOM.dateDisplay = document.getElementById("tv-date-display");
    TV_DOM.connectionStatus = document.getElementById("tv-connection-status");
    TV_DOM.statusText = document.getElementById("tv-status-text");
    TV_DOM.todayCount = document.getElementById("tv-today-count");
    TV_DOM.attendanceVisitBoard = document.getElementById("tv-attendance-visit-board");
    TV_DOM.attendanceArBoard = document.getElementById("tv-attendance-ar-board");
    TV_DOM.arCount = document.getElementById("tv-ar-count");
    TV_DOM.eventsContainer = document.getElementById("tv-events-container");
    TV_DOM.noticesContainer = document.getElementById("tv-notices-container");
    TV_DOM.indicator = document.getElementById("tv-indicator");
    TV_DOM.dots = document.querySelectorAll(".tv-dot");

    // Slides
    TV_DOM.slides = document.querySelectorAll(".tv-slide");
    TV_DOM.slideMap = {};
    TV_DOM.slides.forEach(function(slide) {
        TV_DOM.slideMap[slide.id.replace("slide-", "")] = slide;
    });
}

// ==================== Clock & Date ====================

function updateClock() {
    if (!TV_DOM.clock || !TV_DOM.dateDisplay) return;
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    TV_DOM.clock.textContent = hours + ":" + minutes + ":" + seconds;

    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const dayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
    const dayName = dayNames[now.getDay()];
    TV_DOM.dateDisplay.textContent = year + "년 " + month + "월 " + day + "일 " + dayName;

    const today = formatLocalDate(now);
    if (tvRealtimeSubscribed && tvSubscribedDate !== today) {
        tvSubscribedDate = today;
        subscribeTodayVisitors();
        subscribeARStatus();
        if (typeof refreshAttendanceDateState === "function") refreshAttendanceDateState();
        renderEvents(tvEventsCache);
        renderNotices(tvNoticesCache);
    }
}

// ==================== Connection Status ====================

function setConnectionStatus(status, text) {
    const dot = TV_DOM.connectionStatus;
    const txt = TV_DOM.statusText;

    if (!dot || !txt) return;

    // Remove all status classes
    dot.className = "tv-status-dot";
    
    if (status === "connected") {
        dot.classList.add("status-connected");
        txt.textContent = text || "Firebase 연결됨";
    } else if (status === "connecting") {
        dot.classList.add("status-connecting");
        txt.textContent = text || "연결 중...";
    } else {
        dot.classList.add("status-error");
        txt.textContent = text || "연결 오류";
    }
}

// ==================== Slideshow Control ====================

function getPlayableSlideIndexes() {
    return TV_CONFIG.slideOrder.reduce(function(indexes, slideId, index) {
        var sourceId = String(slideId || "").split("-")[0];
        if (TV_CONFIG.enabledSlides[slideId] && TV_DOM.slideMap[sourceId]) indexes.push(index);
        return indexes;
    }, []);
}

function getSlideDuration(index) {
    var slides = tvLastSettings.slides;
    var slideId = TV_CONFIG.slideOrder[index];
    var slide = Array.isArray(slides) ? slides.find(function(item) { return item && item.id === slideId; }) : null;
    var seconds = Number(slide && slide.duration);
    return Math.max(3000, (Number.isFinite(seconds) ? seconds * 1000 : TV_CONFIG.slideInterval));
}

function showSlide(index) {
    if (isTransitioning) return;
    if (index < 0 || index >= TV_CONFIG.slideOrder.length) return;

    isTransitioning = true;
    currentSlideIndex = index;

    const slideId = TV_CONFIG.slideOrder[index];
    const sourceId = slideId.split("-")[0];

    // Skip slide if it's disabled in settings
    if (!TV_CONFIG.enabledSlides[slideId] || !TV_DOM.slideMap[sourceId]) {
        isTransitioning = false;
        // Find next enabled slide
        advanceSlide();
        return;
    }

    // Update slides
    TV_DOM.slides.forEach(function(slide) {
        slide.classList.remove("active-slide");
    });

    const targetSlide = TV_DOM.slideMap[sourceId];
    if (targetSlide) {
        targetSlide.classList.add("active-slide");
    }

    // Update indicator dots
    TV_DOM.dots.forEach(function(dot) {
        dot.classList.remove("active-dot");
        if (dot.getAttribute("data-slide") === sourceId) {
            dot.classList.add("active-dot");
        }
    });

    // Trigger slide-specific refresh
    refreshSlideContent(sourceId);
    updateTVStatus(sourceId);

    setTimeout(function() {
        isTransitioning = false;
    }, TV_CONFIG.transitionDuration);
}

function advanceSlide() {
    var playable = getPlayableSlideIndexes();
    if (!playable.length) return;
    var currentPosition = playable.indexOf(currentSlideIndex);
    var nextPosition = currentPosition < 0 ? 0 : (currentPosition + 1) % playable.length;
    showSlide(playable[nextPosition]);
}

function startSlideshow() {
    stopSlideshow();
    var playable = getPlayableSlideIndexes();
    if (!playable.length) {
        setConnectionStatus("error", "표시할 화면 설정이 없습니다");
        return;
    }
    if (playable.indexOf(currentSlideIndex) < 0) currentSlideIndex = playable[0];
    showSlide(currentSlideIndex);
    scheduleNextSlide();
}

function scheduleNextSlide() {
    if (!getPlayableSlideIndexes().length || tvDestroyed) return;
    slideTimer = window.setTimeout(function() {
        advanceSlide();
        scheduleNextSlide();
    }, getSlideDuration(currentSlideIndex));
}

function stopSlideshow() {
    if (slideTimer) {
        clearTimeout(slideTimer);
        slideTimer = null;
    }
}

function restartSlideshowAfterManualNavigation() {
    window.clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(startSlideshow, getSlideDuration(currentSlideIndex) * 2);
}

function updateTVStatus(slideId) {
    if (!TVCommon.shouldWriteStatus(TV_PREVIEW_MODE)) return;
    pendingStatusSlideId = slideId;
    window.clearTimeout(statusTimer);
    var remaining = Math.max(0, TV_STATUS_HEARTBEAT_MS - (Date.now() - lastStatusWriteAt));
    statusTimer = window.setTimeout(function() {
        lastStatusWriteAt = Date.now();
        db.ref("tvStatus").set({ online: true, lastSync: firebase.database.ServerValue.TIMESTAMP, currentSlide: pendingStatusSlideId }).catch(function(error) {
            console.warn("[tv] status update skipped:", error.code || error.message);
        });
    }, remaining);
}

// ==================== Slide Content Refresh ====================

function refreshSlideContent(slideId) {
    switch (slideId) {
        default:
            break;
    }
}

function renderContentError(container, message) {
    if (!container) return;
    container.innerHTML = "<div class='tv-content-error' role='status'>" + escapeHtml(message) + "</div>";
}

function resetTvRealtimeSubscriptions() {
    tvSubscriptionGeneration += 1;
    window.clearTimeout(tvSubscriptionHealthTimer);
    tvSubscriptionHealthTimer = null;
    if (tvSettingsListener) tvSettingsListener.off();
    if (visitorListener) visitorListener.off();
    if (arListener) arListener.off();
    if (typeof unsubscribeAttendanceBoards === "function") unsubscribeAttendanceBoards();
    if (eventsListener) eventsListener.off();
    if (noticesListener) noticesListener.off();

    tvSettingsListener = null;
    visitorListener = null;
    arListener = null;
    eventsListener = null;
    noticesListener = null;
    tvRealtimeSubscribed = false;
    tvRealtimeAuthUid = "";
    tvRequiredSubscriptionSources = new Set();
    tvHealthySubscriptionSources = new Set();
}

function isTvSubscriptionGenerationCurrent(generation) {
    return generation === tvSubscriptionGeneration && tvRealtimeSubscribed && !tvDestroyed;
}

function getTvRuntimeDiagnostics() {
    var attendanceSubscriptions = typeof getTvAttendanceSubscriptionCount === "function"
        ? getTvAttendanceSubscriptionCount()
        : (typeof tvAttendanceState !== "undefined" && Array.isArray(tvAttendanceState.listeners)
            ? tvAttendanceState.listeners.length
            : 0);
    var baseSubscriptions = [
        tvSettingsListener,
        visitorListener,
        arListener,
        eventsListener,
        noticesListener
    ].filter(Boolean).length;
    return {
        authUid: tvRealtimeAuthUid,
        realtimeSubscribed: tvRealtimeSubscribed,
        subscriptionGeneration: tvSubscriptionGeneration,
        activeDatabaseSubscriptions: baseSubscriptions + attendanceSubscriptions,
        requiredSources: tvRequiredSubscriptionSources.size,
        healthySources: tvHealthySubscriptionSources.size,
        activeTimers: [
            slideTimer,
            resumeTimer,
            statusTimer,
            eventImageTimer,
            clockTimer,
            tvAuthRecoveryTimer,
            tvReconnectTimer,
            tvSubscriptionHealthTimer
        ].filter(Boolean).length,
        retrySignature: tvRetrySignature,
        retryAttempts: tvRetryTotalAttempts,
        retryBlocked: tvRetryBlocked,
        metrics: Object.assign({}, tvRuntimeMetrics)
    };
}

function expectTvRealtimeSource(source, generation) {
    if (!isTvSubscriptionGenerationCurrent(generation)) return;
    tvRequiredSubscriptionSources.add(source);
    tvHealthySubscriptionSources.delete(source);
}

function unexpectTvRealtimeSource(source, generation) {
    if (!isTvSubscriptionGenerationCurrent(generation)) return;
    tvRequiredSubscriptionSources.delete(source);
    tvHealthySubscriptionSources.delete(source);
}

function resetTvRetryState() {
    tvRetrySignature = "";
    tvRetryAttemptsBySignature = Object.create(null);
    tvRetryTotalAttempts = 0;
    tvRetryBlocked = false;
}

function markTvRealtimeHealthy(source, generation) {
    generation = generation === undefined ? tvSubscriptionGeneration : generation;
    if (!isTvSubscriptionGenerationCurrent(generation)) return;
    if (source) tvHealthySubscriptionSources.add(source);
    var allReady = Array.from(tvRequiredSubscriptionSources).every(function(requiredSource) {
        return tvHealthySubscriptionSources.has(requiredSource);
    });
    if (!allReady) return;
    window.clearTimeout(tvSubscriptionHealthTimer);
    tvSubscriptionHealthTimer = null;
    resetTvRetryState();
    setConnectionStatus("connected", "Firebase 연결됨");
}

function classifyTvFailure(error, fallbackCategory) {
    var code = String(error && (error.code || error.message) || "").toLowerCase();
    if (code.includes("permission_denied") || code.includes("permission-denied")) return "permission";
    if (code.includes("network") || code.includes("disconnected") || code.includes("unavailable") ||
        code.includes("timeout") || code.includes("offline") || code.includes("fetch")) return "network";
    if (code.includes("auth/") || code.includes("token") || code.includes("credential") ||
        code.includes("user-disabled") || code.includes("operation-not-allowed")) return "auth";
    return fallbackCategory || "unknown";
}

function tvRetryDelayForAttempt(attempt, randomValue) {
    var baseDelay = TV_RETRY_DELAYS_MS[Math.min(attempt, TV_RETRY_DELAYS_MS.length - 1)];
    var random = Number.isFinite(randomValue) ? randomValue : Math.random();
    // One-sided jitter keeps the documented five-minute ceiling while
    // spreading multiple TV clients across the preceding minute.
    var jitterMultiplier = 1 - TV_RETRY_JITTER_RATIO + (TV_RETRY_JITTER_RATIO * random);
    return Math.max(100, Math.round(baseDelay * jitterMultiplier));
}

function tvRetryStatusText(category, blocked, delay) {
    if (blocked) {
        if (category === "permission") return "Firebase 권한 오류 · 인증 변경 대기 중";
        if (category === "auth") return "Firebase 인증 복구 중단 · 네트워크 복구 대기 중";
        return "Firebase 연결 복구 대기 중";
    }
    var seconds = Math.max(1, Math.ceil(delay / 1000));
    if (category === "permission") return "Firebase 권한 재확인 중 · " + seconds + "초 후 재시도";
    if (category === "auth") return "Firebase 인증 복구 중 · " + seconds + "초 후 재시도";
    return "Firebase 네트워크 재연결 중 · " + seconds + "초 후 재시도";
}

function prepareTvRetry(category) {
    var uid = auth.currentUser && auth.currentUser.uid || "signed-out";
    var signature = category + "|" + uid;
    tvRetrySignature = signature;
    var attempt = Number(tvRetryAttemptsBySignature[signature] || 0);
    if (tvRetryTotalAttempts >= TV_MAX_RETRY_ATTEMPTS) {
        tvRetryBlocked = true;
        setConnectionStatus("error", tvRetryStatusText(category, true, 0));
        return null;
    }
    var delay = tvRetryDelayForAttempt(tvRetryTotalAttempts);
    tvRetryAttemptsBySignature[signature] = attempt + 1;
    tvRetryTotalAttempts += 1;
    tvRuntimeMetrics.retrySchedules += 1;
    setConnectionStatus("connecting", tvRetryStatusText(category, false, delay));
    return delay;
}

function scheduleTvRealtimeReconnect(category) {
    if (tvDestroyed || tvReconnectTimer) return false;
    var failureCategory = category || "network";
    var delay = prepareTvRetry(failureCategory);
    if (delay === null) return false;
    tvReconnectTimer = window.setTimeout(function() {
        tvReconnectTimer = null;
        var user = auth.currentUser;
        if (user) {
            if (failureCategory === "auth" && typeof user.getIdToken === "function") {
                user.getIdToken(true)
                    .then(function() {
                        if (auth.currentUser && auth.currentUser.uid === user.uid) {
                            subscribeTvRealtimeData(user, true);
                        }
                    })
                    .catch(function(error) {
                        console.error("[tv] auth token refresh error:", error && (error.code || error.message));
                        scheduleTvRealtimeReconnect(classifyTvFailure(error, "auth"));
                    });
                return;
            }
            subscribeTvRealtimeData(user, true);
            return;
        }
        scheduleTvAnonymousAuthRecovery(failureCategory);
    }, delay);
    return true;
}

function handleTvRealtimeSubscriptionError(source, error, generation) {
    if (tvDestroyed || (generation !== undefined && !isTvSubscriptionGenerationCurrent(generation))) return;
    console.error("[tv] " + source + " subscription error:", error && (error.code || error.message));

    // A Realtime Database listener is permanently cancelled when it loses
    // read permission. Detach the remaining listeners as one group so the
    // next authenticated state can restore exactly one copy of each.
    var category = classifyTvFailure(error, "network");
    resetTvRealtimeSubscriptions();

    if (!auth.currentUser) {
        scheduleTvAnonymousAuthRecovery("auth");
        return;
    }
    scheduleTvRealtimeReconnect(category);
}

function scheduleTvAnonymousAuthRecovery(category) {
    if (tvDestroyed || auth.currentUser || tvAuthRecoveryPromise || tvAuthRecoveryTimer) return false;
    var failureCategory = category || "auth";
    var delay = prepareTvRetry(failureCategory);
    if (delay === null) return false;
    tvAuthRecoveryTimer = window.setTimeout(function() {
        tvAuthRecoveryTimer = null;
        if (tvDestroyed || auth.currentUser || tvAuthRecoveryPromise) return;
        tvRuntimeMetrics.authAttempts += 1;
        var retryCategory = "";
        tvAuthRecoveryPromise = auth.signInAnonymously()
            .catch(function(error) {
                console.error("[tv] anonymous auth recovery error:", error && (error.code || error.message));
                retryCategory = classifyTvFailure(error, "auth");
            })
            .finally(function() {
                tvAuthRecoveryPromise = null;
                if (retryCategory) scheduleTvAnonymousAuthRecovery(retryCategory);
            });
    }, delay);
    return true;
}

// ==================== Firebase: TV Settings Subscription ====================

function subscribeTVSettings(generation) {
    if (tvSettingsListener) tvSettingsListener.off();
    tvSettingsListener = tvSettingsRef;
    tvSettingsListener.on("value", function(snapshot) {
        if (!isTvSubscriptionGenerationCurrent(generation)) return;
        var settings = TV_PREVIEW_MODE && tvPreviewDraft && tvPreviewDraft.settings
            ? tvPreviewDraft.settings
            : snapshot.val();
        if (!settings) {
            markTvRealtimeHealthy("tvSettings", generation);
            return;
        }

        tvLastSettings = settings;
        TV_CONFIG.enabledSlides = Object.assign({}, tvConfiguredSlideEnabled);
        // Update enabled slides and playlist from settings
        if (Array.isArray(settings.slides) && settings.slides.length) {
            var validSlides = TVCommon.normalizeFixedSlides(settings.slides).filter(function(slide) {
                return TV_DOM.slideMap[slide.id];
            });
            if (validSlides.length) {
                tvLastSettings = Object.assign({}, settings, { slides: validSlides });
                TV_CONFIG.slideOrder = validSlides.map(function(slide) { return slide.id; });
                TV_CONFIG.enabledSlides = {};
                validSlides.forEach(function(slide) { TV_CONFIG.enabledSlides[slide.id] = slide.enabled !== false; });
            }
        }
        if (settings.display) {
            var keys = Object.keys(TV_CONFIG.enabledSlides);
            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                if (settings.display[key] !== undefined) {
                    TV_CONFIG.enabledSlides[key] = settings.display[key];
                }
            }
        }
        tvConfiguredSlideEnabled = Object.assign({}, TV_CONFIG.enabledSlides);
        applyTvContentAvailability("events");
        applyTvContentAvailability("notices");

        // Update slide interval if configured
        if (Number(settings.slideInterval) >= 3000) TV_CONFIG.slideInterval = Number(settings.slideInterval);
        applyTVAppearance(settings);
        if (typeof setAttendanceSlidePreferences === "function") setAttendanceSlidePreferences(settings);

        markTvRealtimeHealthy("tvSettings", generation);
        if (tvInitialized) startSlideshow();
    }, function(error) {
        handleTvRealtimeSubscriptionError("tvSettings", error, generation);
    });
}

function tvParseBackgroundColor(color) {
    var value = String(color || "").trim();
    var hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
        var raw = hex[1];
        if (raw.length === 3) raw = raw.split("").map(function(char) { return char + char; }).join("");
        return { r: parseInt(raw.slice(0, 2), 16), g: parseInt(raw.slice(2, 4), 16), b: parseInt(raw.slice(4, 6), 16) };
    }
    var rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+\s*([\d.]+)[,\s]+\s*([\d.]+)/i);
    if (rgb) return { r: Math.min(255, Number(rgb[1])), g: Math.min(255, Number(rgb[2])), b: Math.min(255, Number(rgb[3])) };
    return null;
}

function tvRelativeLuminance(color) {
    var rgb = tvParseBackgroundColor(color);
    if (!rgb) return 0;
    return [rgb.r, rgb.g, rgb.b].map(function(channel) {
        channel /= 255;
        return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    }).reduce(function(total, channel, index) {
        return total + channel * [0.2126, 0.7152, 0.0722][index];
    }, 0);
}

function getContrastTextColor(backgroundColor) {
    return tvRelativeLuminance(backgroundColor) > 0.42 ? "#111111" : "#ffffff";
}

function applyTVAppearance(settings) {
    var root = document.documentElement;
    var bg = settings.background || {};
    var backgroundPreset = TVCommon.backgroundPreset(bg.preset);
    var theme = backgroundPreset ? backgroundPreset.theme : settings.theme || "dark";
    var preset = backgroundPreset || TVCommon.themePreset(theme);
    document.body.dataset.tvTheme = theme;
    var fallbackColor = preset.background;
    // 이전 데이터에는 테마가 light여도 기본 다크 색상(#0f172a)이 함께
    // 저장되어 있을 수 있다. 이 경우 기존 라이트 테마의 의도를 보존한다.
    var savedColor = String(bg.color || "").toLowerCase();
    var backgroundColor = (!savedColor || savedColor === "#0f172a") ? fallbackColor : bg.color;
    var hasImageBackground = Boolean(bg.image);
    var textColor = hasImageBackground ? "#ffffff" : getContrastTextColor(backgroundColor);
    var isLightBackground = textColor === "#111111";
    root.style.setProperty("--tv-background", backgroundColor);
    var accent = preset.accent;
    root.style.setProperty("--tv-text-primary", textColor);
    root.style.setProperty("--tv-text-secondary", isLightBackground ? "#334155" : "#cbd5e1");
    root.style.setProperty("--tv-text-muted", isLightBackground ? "#64748b" : "#94a3b8");
    root.style.setProperty("--tv-card-background", isLightBackground ? "rgba(255,255,255,.84)" : "rgba(30,41,59,.76)");
    root.style.setProperty("--tv-card-border", isLightBackground ? "rgba(15,23,42,.15)" : "rgba(148,163,184,.22)");
    root.style.setProperty("--tv-accent", accent);
    root.style.setProperty("--tv-accent-secondary", preset.secondary);
    root.style.setProperty("--tv-rank-secondary", isLightBackground ? "#334155" : "#cbd5e1");
    root.style.setProperty("--tv-rank-other", isLightBackground ? "#475569" : "#94a3b8");
    root.style.setProperty("--tv-logo-filter", isLightBackground ? "none" : "brightness(0) invert(1)");
    document.body.dataset.tvImageBackground = hasImageBackground ? "true" : "false";
    var overlay = document.querySelector(".tv-bg-overlay");
    if (overlay) {
        var nextBackgroundImage = bg.image
            ? "linear-gradient(rgba(2,6,23,.64),rgba(2,6,23,.64)),url('" + String(bg.image).replace(/'/g, "%27") + "')"
            : backgroundPreset ? backgroundPreset.preview : "";
        if (overlay.style.backgroundImage !== nextBackgroundImage) overlay.style.backgroundImage = nextBackgroundImage;
    }
    var welcome = settings.welcome || {};
    var title = document.querySelector(".tv-title");
    var subtitle = document.querySelector(".tv-subtitle");
    var logo = document.querySelector(".tv-logo");
    if (title && welcome.title) title.textContent = welcome.title;
    if (subtitle && welcome.subtitle) subtitle.textContent = welcome.subtitle;
    if (logo && welcome.logo && logo.getAttribute("src") !== welcome.logo) logo.src = welcome.logo;
}

// ==================== Firebase: Today's Visitors ====================
function subscribeTodayVisitors(generation) {
    generation = generation === undefined ? tvSubscriptionGeneration : generation;
    var todayStr = formatLocalDate(new Date());
    tvSubscribedDate = todayStr;
    var query = visitLogsRef.orderByChild("date").equalTo(todayStr).limitToLast(5000);

    if (visitorListener) visitorListener.off();
    visitorListener = query;
    visitorListener.on("value", function(snapshot) {
        if (!isTvSubscriptionGenerationCurrent(generation)) return;
        var count = snapshot.numChildren();
        if (TV_DOM.todayCount) {
            TV_DOM.todayCount.textContent = count;
        }
        var message = document.getElementById("tv-visitor-message");
        if (message) message.textContent = count ? "오늘 문화의집을 함께한 방문자입니다" : "오늘 첫 방문을 기다리고 있습니다";
        markTvRealtimeHealthy("visitLogs", generation);
    }, function(error) {
        handleTvRealtimeSubscriptionError("visitLogs", error, generation);
    });
}

// ==================== Firebase: AR Status ====================

function subscribeARStatus(generation) {
    generation = generation === undefined ? tvSubscriptionGeneration : generation;
    var todayStr = formatLocalDate(new Date());
    tvSubscribedDate = todayStr;
    var query = arSlotLocksRef.orderByKey()
        .startAt(todayStr + "_")
        .endAt(todayStr + "_\uf8ff")
        .limitToLast(50);

    if (arListener) arListener.off();
    arListener = query;
    arListener.on("value", function(snapshot) {
        if (!isTvSubscriptionGenerationCurrent(generation)) return;
        var count = snapshot.numChildren();
        if (TV_DOM.arCount) {
            TV_DOM.arCount.textContent = count;
        }
        var message = document.getElementById("tv-ar-message");
        if (message) message.textContent = count ? "현재 예약된 AR 체험 팀입니다" : "현재 예약된 AR 체험 팀이 없습니다";
        markTvRealtimeHealthy("arSlotLocks", generation);
    }, function(error) {
        handleTvRealtimeSubscriptionError("arSlotLocks", error, generation);
    });
}

// ==================== Firebase: Events ====================

function stopEventImageRotation() {
    if (eventImageTimer) {
        window.clearInterval(eventImageTimer);
        eventImageTimer = null;
    }
}

function showEventFullscreenImage(container, index) {
    var frames = container.querySelectorAll(".tv-event-fullscreen-frame");
    if (!frames.length) return;
    eventImageIndex = ((index % frames.length) + frames.length) % frames.length;
    frames.forEach(function(frame, frameIndex) {
        frame.classList.toggle("is-active", frameIndex === eventImageIndex);
    });
}

function startEventImageRotation(container) {
    stopEventImageRotation();
    var frames = container.querySelectorAll(".tv-event-fullscreen-frame");
    eventImageIndex = 0;
    showEventFullscreenImage(container, eventImageIndex);
    if (frames.length < 2) return;
    eventImageTimer = window.setInterval(function() {
        showEventFullscreenImage(container, eventImageIndex + 1);
    }, 6000);
}

function leaveEventFullscreenMode(container, slideContent) {
    stopEventImageRotation();
    container.classList.remove("tv-events-container--fullscreen");
    if (slideContent) slideContent.classList.remove("tv-slide-content--fullscreen-event");
}

function applyTvContentAvailability(slideId, hasContent) {
    if (hasContent !== undefined) tvContentAvailability[slideId] = Boolean(hasContent);
    var availability = tvContentAvailability[slideId];
    if (availability === null) return;
    var nextEnabled = tvConfiguredSlideEnabled[slideId] !== false && availability;
    var changed = TV_CONFIG.enabledSlides[slideId] !== nextEnabled;
    TV_CONFIG.enabledSlides[slideId] = nextEnabled;
    if (changed && tvInitialized) startSlideshow();
}

function renderEvents(events) {
    var container = TV_DOM.eventsContainer;
    if (!container) return;
    var slideContent = container.closest(".tv-slide-content");
    if (!events || typeof events !== "object") {
        applyTvContentAvailability("events", false);
        if (container.dataset.renderSignature === "empty") return;
        container.dataset.renderSignature = "empty";
        leaveEventFullscreenMode(container, slideContent);
        container.innerHTML = "<div class='tv-events-empty'>진행 중인 이벤트가 없습니다</div>";
        if (tvHadActiveEvents && TV_CONFIG.slideOrder[currentSlideIndex] === "events") advanceSlide();
        tvHadActiveEvents = false;
        return;
    }
        var activeEvents = [];
        var keys = Object.keys(events);
        var today = tvSubscribedDate || formatLocalDate(new Date());

        for (var i = 0; i < keys.length; i++) {
            var event = events[keys[i]];
            if (event && event.enabled !== false) {
                if (TVCommon.isActive(event, today)) {
                    activeEvents.push(event);
                }
            }
        }

        if (activeEvents.length === 0) {
            applyTvContentAvailability("events", false);
            if (container.dataset.renderSignature === "empty") return;
            container.dataset.renderSignature = "empty";
            leaveEventFullscreenMode(container, slideContent);
            container.innerHTML = "<div class='tv-events-empty'>진행 중인 이벤트가 없습니다</div>";
            if (tvHadActiveEvents && TV_CONFIG.slideOrder[currentSlideIndex] === "events") advanceSlide();
            tvHadActiveEvents = false;
            return;
        }
        applyTvContentAvailability("events", true);
        tvHadActiveEvents = true;

        activeEvents = TVCommon.sortEvents(activeEvents.map(function(event, index) {
            return [String(index), event];
        })).map(function(entry) { return entry[1]; });
        var fullscreenImages = [];
        activeEvents.forEach(function(event) {
            var images = Array.isArray(event.images) ? event.images : (event.images && typeof event.images === "object" ? Object.values(event.images) : []);
            if (!images.length && event.image) images = [{ secure_url: event.image }];
            images.forEach(function(image) {
                var url = typeof image === "string" ? image : image && image.secure_url;
                if (url) fullscreenImages.push({ url: url, title: event.title || "이벤트 이미지" });
            });
        });

        if (fullscreenImages.length) {
            var imageSignature = "images:" + JSON.stringify(fullscreenImages.map(function(image) { return image.url; }));
            if (container.dataset.renderSignature === imageSignature) return;
            container.dataset.renderSignature = imageSignature;
            container.classList.add("tv-events-container--fullscreen");
            if (slideContent) slideContent.classList.add("tv-slide-content--fullscreen-event");
            container.innerHTML = '<div class="tv-event-fullscreen">' + fullscreenImages.map(function(image, index) {
                return '<figure class="tv-event-fullscreen-frame' + (index === 0 ? " is-active" : "") + '">' +
                    '<img src="' + escapeHtml(image.url) + '" alt="' + escapeHtml(image.title) + '"></figure>';
            }).join("") + '</div>';
            container.querySelectorAll(".tv-event-fullscreen-frame img").forEach(function(image) {
                image.addEventListener("error", function() {
                    var frame = image.closest(".tv-event-fullscreen-frame");
                    if (frame) frame.remove();
                    var remaining = container.querySelectorAll(".tv-event-fullscreen-frame");
                    if (!remaining.length) {
                        leaveEventFullscreenMode(container, slideContent);
                        container.innerHTML = "<div class='tv-events-empty'>이벤트 이미지를 불러오지 못했습니다</div>";
                        return;
                    }
                    startEventImageRotation(container);
                }, { once: true });
            });
            startEventImageRotation(container);
            return;
        }

        var textSignature = "text:" + JSON.stringify(activeEvents.map(function(event) {
            return { title: event.title || "", description: event.description || "", startDate: event.startDate || "", endDate: event.endDate || "" };
        }));
        if (container.dataset.renderSignature === textSignature) return;
        container.dataset.renderSignature = textSignature;
        leaveEventFullscreenMode(container, slideContent);
        var html = "";
        for (var j = 0; j < activeEvents.length; j++) {
            var evt = activeEvents[j];
            html += "<div class='tv-event-card'>";
            html += "  <div class='tv-event-title'>" + escapeHtml(evt.title || "이벤트") + "</div>";
            if (evt.startDate || evt.endDate) {
                html += "  <div class='tv-event-period'>" + escapeHtml(evt.startDate || "") + (evt.endDate ? " — " + escapeHtml(evt.endDate) : "부터") + "</div>";
            }
            if (evt.description) {
                html += "  <div class='tv-event-desc'>" + escapeHtml(evt.description) + "</div>";
            }
            html += "</div>";
        }
        container.innerHTML = html;
}

function subscribeEvents(generation) {
    var eventsRef = db.ref("tvContent/events");
    if (eventsListener) eventsListener.off();
    eventsListener = eventsRef;
    eventsRef.on("value", function(snapshot) {
        if (!isTvSubscriptionGenerationCurrent(generation)) return;
        tvEventsCache = snapshot.val();
        renderEvents(tvEventsCache);
        markTvRealtimeHealthy("events", generation);
    }, function(error) {
        if (!isTvSubscriptionGenerationCurrent(generation)) return;
        if (tvEventsCache === null) renderContentError(TV_DOM.eventsContainer, "이벤트 연결 오류");
        handleTvRealtimeSubscriptionError("events", error, generation);
    });
}

// ==================== Firebase: Notices ====================

    function renderNotices(notices) {
        var container = TV_DOM.noticesContainer;
        if (!container) return;
        var slideContent = container.closest(".tv-slide-content");
        if (!notices || typeof notices !== "object") {
            applyTvContentAvailability("notices", false);
            if (container.dataset.renderSignature === "empty") return;
            container.dataset.renderSignature = "empty";
            container.classList.remove("tv-notices-container--fullscreen");
            if (slideContent) slideContent.classList.remove("tv-slide-content--fullscreen-notice");
            container.innerHTML = "<div class='tv-notices-empty'>공지사항이 없습니다</div>";
            if (tvHadActiveNotices && TV_CONFIG.slideOrder[currentSlideIndex] === "notices") advanceSlide();
            tvHadActiveNotices = false;
            return;
        }
        var noticeList = [];
        var keys = Object.keys(notices);
        var today = tvSubscribedDate || formatLocalDate(new Date());
        for (var i = 0; i < keys.length; i++) {
            var notice = notices[keys[i]];
            if (notice && notice.enabled !== false && (notice.title || notice.secure_url || notice.image || notice.imageUrl || notice.url) && TVCommon.isActive(notice, today)) {
                noticeList.push([keys[i], notice]);
            }
        }

        if (noticeList.length === 0) {
            applyTvContentAvailability("notices", false);
            if (container.dataset.renderSignature === "empty") return;
            container.dataset.renderSignature = "empty";
            container.classList.remove("tv-notices-container--fullscreen");
            if (slideContent) slideContent.classList.remove("tv-slide-content--fullscreen-notice");
            container.innerHTML = "<div class='tv-notices-empty'>공지사항이 없습니다</div>";
            if (tvHadActiveNotices && TV_CONFIG.slideOrder[currentSlideIndex] === "notices") advanceSlide();
            tvHadActiveNotices = false;
            return;
        }
        applyTvContentAvailability("notices", true);
        tvHadActiveNotices = true;

        // Sort by creation date (newest first)
        noticeList = TVCommon.sortNotices(noticeList).map(function(entry) { return entry[1]; });

        var imageNotice = noticeList.find(function(notice) {
            return notice && (notice.type === "image" || notice.secure_url || notice.image || notice.imageUrl || notice.url);
        });
        if (imageNotice) {
            var noticeImage = imageNotice.secure_url || imageNotice.image || imageNotice.imageUrl || imageNotice.url;
            var imageNoticeSignature = "image:" + noticeImage;
            if (container.dataset.renderSignature === imageNoticeSignature) return;
            container.dataset.renderSignature = imageNoticeSignature;
            container.classList.add("tv-notices-container--fullscreen");
            if (slideContent) slideContent.classList.add("tv-slide-content--fullscreen-notice");
            container.innerHTML = "<figure class='tv-notice-fullscreen'><img src='" + escapeHtml(noticeImage) + "' alt='" + escapeHtml(imageNotice.title || "공지 이미지") + "'></figure>";
            var image = container.querySelector(".tv-notice-fullscreen img");
            if (image) {
                image.addEventListener("error", function() {
                    image.remove();
                    container.innerHTML = "<div class='tv-notices-empty'>공지 이미지를 불러오지 못했습니다</div>";
                }, { once: true });
            }
            return;
        }

        var textNoticeSignature = "text:" + JSON.stringify(noticeList.slice(0, 5).map(function(notice) {
            return { title: notice.title || "", description: notice.description || "", date: notice.date || "" };
        }));
        if (container.dataset.renderSignature === textNoticeSignature) return;
        container.dataset.renderSignature = textNoticeSignature;
        container.classList.remove("tv-notices-container--fullscreen");
        if (slideContent) slideContent.classList.remove("tv-slide-content--fullscreen-notice");

        var html = "";
        var maxNotices = Math.min(noticeList.length, 5); // Show max 5 notices
        for (var j = 0; j < maxNotices; j++) {
            var notice = noticeList[j];
            html += "<div class='tv-notice-item" + (notice.emergency ? " tv-notice-item--emergency" : "") + "'>";
            html += "  <div class='tv-notice-title'>" + escapeHtml(notice.title) + "</div>";
            if (notice.description) {
                html += "  <div class='tv-notice-description'>" + escapeHtml(notice.description) + "</div>";
            }
            if (notice.date) {
                html += "  <div class='tv-notice-date'>" + escapeHtml(notice.date) + "</div>";
            } else if (notice.startDate || notice.endDate) {
                html += "  <div class='tv-notice-date'>" + escapeHtml(notice.startDate || "") + (notice.endDate ? " — " + escapeHtml(notice.endDate) : "부터") + "</div>";
            }
            html += "</div>";
        }

        container.innerHTML = html;
}

function subscribeNotices(generation) {
    var noticesRef = db.ref("tvContent/notices");
    if (noticesListener) noticesListener.off();
    noticesListener = noticesRef;
    noticesRef.on("value", function(snapshot) {
        if (!isTvSubscriptionGenerationCurrent(generation)) return;
        tvNoticesCache = snapshot.val();
        if (TV_PREVIEW_MODE && tvPreviewDraft && tvPreviewDraft.notice) {
            tvNoticesCache = Object.assign({}, tvNoticesCache || {}, { __previewDraft: tvPreviewDraft.notice });
        }
        renderNotices(tvNoticesCache);
        markTvRealtimeHealthy("notices", generation);
    }, function(error) {
        if (!isTvSubscriptionGenerationCurrent(generation)) return;
        if (tvNoticesCache === null) renderContentError(TV_DOM.noticesContainer, "공지사항 연결 오류");
        handleTvRealtimeSubscriptionError("notices", error, generation);
    });
}

// ==================== Manual Dot Click Navigation ====================

function setupDotNavigation() {
    if (navigationBound) return;
    TV_DOM.dots.forEach(function(dot) {
        dot.addEventListener("click", function() {
            var slideId = this.getAttribute("data-slide");
            var index = TV_CONFIG.slideOrder.indexOf(slideId);
            if (index >= 0) {
                stopSlideshow();
                showSlide(index);
                restartSlideshowAfterManualNavigation();
            }
        });
    });
}

// ==================== Keyboard Shortcuts ====================

function setupKeyboardShortcuts() {
    if (navigationBound) return;
    navigationBound = true;
    document.addEventListener("keydown", function(e) {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            stopSlideshow();
            advanceSlide();
            restartSlideshowAfterManualNavigation();
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            stopSlideshow();
            var prevIndex = currentSlideIndex - 1;
            if (prevIndex < 0) prevIndex = TV_CONFIG.slideOrder.length - 1;
            showSlide(prevIndex);
            restartSlideshowAfterManualNavigation();
        } else if (e.key === " ") {
            e.preventDefault();
            if (slideTimer) {
                stopSlideshow();
            } else {
                startSlideshow();
            }
        }
    });
}

// ==================== Initialize TV ====================

function subscribeTvRealtimeData(user, force) {
    var authenticatedUser = user || auth.currentUser;
    if (!authenticatedUser || tvDestroyed) return;
    if (!force && tvRealtimeSubscribed && tvRealtimeAuthUid === authenticatedUser.uid) return;

    resetTvRealtimeSubscriptions();
    tvRealtimeSubscribed = true;
    tvRealtimeAuthUid = authenticatedUser.uid;
    var generation = tvSubscriptionGeneration;
    tvRequiredSubscriptionSources = new Set(TV_CORE_SUBSCRIPTION_SOURCES);
    if (typeof subscribeAttendanceBoards !== "function") {
        tvRequiredSubscriptionSources.delete("attendanceEvents");
    }
    tvHealthySubscriptionSources = new Set();
    tvRuntimeMetrics.subscriptionSets += 1;
    tvSubscribedDate = formatLocalDate(new Date());
    setConnectionStatus("connecting", "Firebase 데이터 연결 중...");
    tvSubscriptionHealthTimer = window.setTimeout(function() {
        tvSubscriptionHealthTimer = null;
        if (!isTvSubscriptionGenerationCurrent(generation)) return;
        handleTvRealtimeSubscriptionError(
            "subscription-ready-timeout",
            { code: "network-timeout" },
            generation
        );
    }, TV_SUBSCRIPTION_READY_TIMEOUT_MS);
    subscribeTVSettings(generation);
    subscribeTodayVisitors(generation);
    subscribeARStatus(generation);
    if (typeof subscribeAttendanceBoards === "function") {
        subscribeAttendanceBoards(generation);
    }
    subscribeEvents(generation);
    subscribeNotices(generation);
}

function handleTvAuthStateChanged(user) {
    window.clearTimeout(tvAuthRecoveryTimer);
    tvAuthRecoveryTimer = null;
    window.clearTimeout(tvReconnectTimer);
    tvReconnectTimer = null;

    if (user) {
        var userChanged = tvObservedAuthUid !== user.uid;
        tvObservedAuthUid = user.uid;
        if (userChanged) resetTvRetryState();
        subscribeTvRealtimeData(user);
        return;
    }

    // Keep the last rendered values visible while authentication changes.
    // The caches are intentionally not cleared here.
    var signedOutStateChanged = tvObservedAuthUid !== "";
    tvObservedAuthUid = "";
    resetTvRealtimeSubscriptions();
    if (signedOutStateChanged) resetTvRetryState();
    scheduleTvAnonymousAuthRecovery("auth");
}

function subscribeTvAuthState() {
    if (tvAuthStateUnsubscribe) tvAuthStateUnsubscribe();
    tvAuthStateUnsubscribe = auth.onAuthStateChanged(handleTvAuthStateChanged, function(error) {
        console.error("[tv] auth state error:", error && (error.code || error.message));
        resetTvRealtimeSubscriptions();
        scheduleTvAnonymousAuthRecovery(classifyTvFailure(error, "auth"));
    });
}

function initializeTV() {
    if (tvInitialized) return;
    cacheTVDOM();

    // Start clock
    updateClock();
    clockTimer = window.setInterval(updateClock, 1000);

    // Set connection status to connecting
    setConnectionStatus("connecting", "Firebase 연결 중...");

    // Setup navigation
    setupDotNavigation();
    setupKeyboardShortcuts();
    setupPreviewControls();

    // Start slideshow
    startSlideshow();
    tvInitialized = true;

    // Restore a persisted administrator session before attaching protected
    // visit-log listeners. Only use anonymous auth when no session exists.
    subscribeTvAuthState();
}

function setupPreviewControls() {
    if (!TV_PREVIEW_MODE) return;
    var controls = document.getElementById("tv-preview-controls");
    if (!controls || controls.dataset.bound) return;
    controls.classList.remove("hidden");
    controls.dataset.bound = "true";
    controls.addEventListener("click", function(event) {
        var action = event.target.dataset.tvPreview;
        if (!action) return;
        if (action === "previous") { stopSlideshow(); currentSlideIndex = (currentSlideIndex - 1 + TV_CONFIG.slideOrder.length) % TV_CONFIG.slideOrder.length; showSlide(currentSlideIndex); }
        if (action === "next") { stopSlideshow(); advanceSlide(); }
        if (action === "pause") { if (slideTimer) { stopSlideshow(); event.target.textContent = "재생"; } else { startSlideshow(); event.target.textContent = "일시정지"; } }
        if (action === "restart") { stopSlideshow(); currentSlideIndex = 0; startSlideshow(); }
        if (action === "fullscreen") { document.documentElement.requestFullscreen?.(); }
    });
}

window.addEventListener("pagehide", function() {
    tvDestroyed = true;
    stopSlideshow();
    window.clearTimeout(resumeTimer);
    window.clearTimeout(statusTimer);
    window.clearTimeout(tvAuthRecoveryTimer);
    window.clearTimeout(tvReconnectTimer);
    window.clearTimeout(tvSubscriptionHealthTimer);
    window.clearInterval(clockTimer);
    stopEventImageRotation();
    if (tvAuthStateUnsubscribe) tvAuthStateUnsubscribe();
    resetTvRealtimeSubscriptions();
    if (TVCommon.shouldWriteStatus(TV_PREVIEW_MODE)) {
        db.ref("tvStatus").set({ online: false, lastSync: firebase.database.ServerValue.TIMESTAMP }).catch(function() {});
    }
});

window.addEventListener("pageshow", function(event) {
    if (!tvDestroyed || !event.persisted) return;
    tvDestroyed = false;
    updateClock();
    window.clearInterval(clockTimer);
    clockTimer = window.setInterval(updateClock, 1000);
    startSlideshow();
    setConnectionStatus("connecting", "Firebase 데이터 연결 중...");
    subscribeTvAuthState();
});

function resumeTvRecoveryFromEnvironment() {
    if (tvDestroyed || (tvRealtimeSubscribed && !tvRetryBlocked)) return;
    window.clearTimeout(tvAuthRecoveryTimer);
    tvAuthRecoveryTimer = null;
    window.clearTimeout(tvReconnectTimer);
    tvReconnectTimer = null;
    resetTvRetryState();
    if (auth.currentUser) {
        subscribeTvRealtimeData(auth.currentUser, true);
    } else {
        scheduleTvAnonymousAuthRecovery("auth");
    }
}

window.addEventListener("online", function() {
    resumeTvRecoveryFromEnvironment();
});

window.addEventListener("offline", function() {
    if (!tvDestroyed) setConnectionStatus("connecting", "네트워크 연결 대기 중...");
});

document.addEventListener("visibilitychange", function() {
    if (document.visibilityState !== "visible" || tvDestroyed) return;
    resumeTvRecoveryFromEnvironment();
    updateClock();
    if (typeof refreshAttendanceDateState === "function") refreshAttendanceDateState();
    renderEvents(tvEventsCache);
    renderNotices(tvNoticesCache);
});

// ==================== Bootstrap ====================

// Use same DOMContentLoaded pattern as the main page
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeTV);
} else {
    initializeTV();
}
