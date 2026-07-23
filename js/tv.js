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
        "ranking",
        "ar",
        "events",
        "notices"
    ],
    enabledSlides: {
        welcome: true,   // Welcome is always shown
        visitors: true,
        ranking: true,
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
let tvLastSettings = {};
let clockTimer = null;
let resumeTimer = null;
let statusTimer = null;
let navigationBound = false;
let tvDestroyed = false;
let lastRankingLoadAt = 0;

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
    TV_DOM.rankingList = document.getElementById("tv-ranking-list");
    TV_DOM.arCount = document.getElementById("tv-ar-count");
    TV_DOM.arStatus = document.getElementById("tv-ar-status");
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
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(function() {
        db.ref("tvStatus").set({ online: true, lastSync: firebase.database.ServerValue.TIMESTAMP, currentSlide: slideId }).catch(function(error) {
            console.warn("[tv] status update skipped:", error.code || error.message);
        });
    }, 100);
}

// ==================== Slide Content Refresh ====================

function refreshSlideContent(slideId) {
    switch (slideId) {
        case "visitors":
            break;
        case "ranking":
            if (Date.now() - lastRankingLoadAt > 300000) {
                lastRankingLoadAt = Date.now();
                loadAttendanceRanking();
            }
            break;
        case "ar":
            loadARStatus();
            break;
        default:
            break;
    }
}

function renderContentError(container, message) {
    if (!container) return;
    container.innerHTML = "<div class='tv-content-error' role='status'>" + escapeHtml(message) + "</div>";
}

// ==================== Firebase: TV Settings Subscription ====================

function subscribeTVSettings() {
    if (tvSettingsListener) tvSettingsListener.off();
    tvSettingsListener = tvSettingsRef;
    tvSettingsListener.on("value", function(snapshot) {
        var settings = snapshot.val();
        if (!settings) {
            setConnectionStatus("connected", "Firebase 연결됨 (기본 설정)");
            return;
        }

        tvLastSettings = settings;
        // Update enabled slides and playlist from settings
        if (Array.isArray(settings.slides) && settings.slides.length) {
            var validSlides = settings.slides.filter(function(slide) {
                return slide && typeof slide.id === "string" && TV_DOM.slideMap[slide.id.split("-")[0]];
            });
            if (validSlides.length) {
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

        // Update slide interval if configured
        if (Number(settings.slideInterval) >= 3000) TV_CONFIG.slideInterval = Number(settings.slideInterval);
        applyTVAppearance(settings);

        setConnectionStatus("connected", "Firebase 연결됨");
        if (tvInitialized) startSlideshow();
    }, function(error) {
        console.error("[tv] TV settings subscription error:", error);
        setConnectionStatus("error", "Firebase 연결 오류");
    });
}

function applyTVAppearance(settings) {
    var root = document.documentElement;
    var theme = settings.theme || "dark";
    document.body.dataset.tvTheme = theme;
    var bg = settings.background || {};
    if (bg.color) root.style.setProperty("--tv-background", bg.color);
    var overlay = document.querySelector(".tv-bg-overlay");
    if (overlay) {
        overlay.style.backgroundImage = bg.image ? "linear-gradient(rgba(15,23,42,.65),rgba(15,23,42,.65)),url('" + String(bg.image).replace(/'/g, "%27") + "')" : "";
    }
    var welcome = settings.welcome || {};
    var title = document.querySelector(".tv-title");
    var subtitle = document.querySelector(".tv-subtitle");
    var logo = document.querySelector(".tv-logo");
    if (title && welcome.title) title.textContent = welcome.title;
    if (subtitle && welcome.subtitle) subtitle.textContent = welcome.subtitle;
    if (logo && welcome.logo) logo.src = welcome.logo;
}

// ==================== Firebase: Today's Visitors ====================
function subscribeTodayVisitors() {
    var todayStr = formatLocalDate(new Date());
    var query = visitLogsRef.orderByChild("date").equalTo(todayStr);

    if (visitorListener) visitorListener.off();
    visitorListener = query;
    visitorListener.on("value", function(snapshot) {
        var count = snapshot.numChildren();
        if (TV_DOM.todayCount) {
            TV_DOM.todayCount.textContent = count;
        }
    }, function(error) {
        console.error("[tv] subscribeTodayVisitors error:", error);
        setConnectionStatus("error", "방문자 연결 오류");
    });
}

// ==================== Firebase: Attendance Ranking ====================

/**
 * Load attendance ranking for the current month.
 * 
 * Strategy (optimized):
 *   1. First, try to read from the pre-computed attendanceCount path.
 *      This path is updated at write-time (when a visitor registers),
 *      so it avoids scanning all visitLogs on every TV display.
 *   2. If attendanceCount is empty (first run / migration), fall back
 *      to computing from visitLogs (the original full-scan method).
 * 
 * Firebase structure:
 *   attendanceCount/{year-month}/{sanitized-name}/
 *     { displayName: "김철수", count: 12 }
 */
function loadAttendanceRanking() {
    var now = new Date();
    var monthKey = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");

    // Try optimized path first: read from pre-computed attendanceCount
    var countRef = db.ref("attendanceCount/" + monthKey);
    countRef.once("value").then(function(snapshot) {
        var data = snapshot.val();
        if (!data) {
            // No pre-computed data yet — fall back to full scan
            computeRankingFromLogs(monthKey);
            return;
        }

        // Convert object to sorted array
        var entries = [];
        var keys = Object.keys(data);
        for (var i = 0; i < keys.length; i++) {
            var entry = data[keys[i]];
            if (entry && entry.displayName && entry.count > 0) {
                entries.push({ name: entry.displayName, count: entry.count });
            }
        }

        // Sort by count descending
        entries.sort(function(a, b) { return b.count - a.count; });

        var top5 = entries.slice(0, 5);
        renderRanking(top5);
    }).catch(function(error) {
        console.error("[tv] loadAttendanceRanking error:", error);
        // Fall back to full scan on error
        computeRankingFromLogs(monthKey);
    });
}

/**
 * Fallback: Compute ranking by scanning all visitLogs for the month.
 * This is the original method, kept for backward compatibility
 * during migration to the optimized attendanceCount path.
 */
function computeRankingFromLogs(monthKey) {
    var parts = monthKey.split("-");
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    var startDate = year + "-" + String(month).padStart(2, "0") + "-01";
    
    // Calculate end date
    var endDateObj = new Date(year, month, 0); // Last day of the month
    var endDate = formatLocalDate(endDateObj);

    var query = visitLogsRef.orderByChild("date").startAt(startDate).endAt(endDate);

    query.once("value").then(function(snapshot) {
        var nameCount = {};
        snapshot.forEach(function(child) {
            var log = child.val();
            // Check if log has individual user data
            if (log.name) {
                var name = log.name.trim();
                if (name) {
                    nameCount[name] = (nameCount[name] || 0) + 1;
                }
            }
        });

        // Sort by count descending
        var sorted = Object.keys(nameCount).map(function(name) {
            return { name: name, count: nameCount[name] };
        });
        sorted.sort(function(a, b) { return b.count - a.count; });

        var top5 = sorted.slice(0, 5);
        renderRanking(top5);
    }).catch(function(error) {
        console.error("[tv] computeRankingFromLogs error:", error);
        TV_DOM.rankingList.innerHTML = "<div class='tv-ranking-empty'>순위 정보를 불러올 수 없습니다</div>";
    });
}

function renderRanking(ranking) {
    var list = TV_DOM.rankingList;
    if (!list) return;
    if (!ranking || ranking.length === 0) {
        list.innerHTML = "<div class='tv-ranking-empty'>출석 정보가 없습니다</div>";
        return;
    }

    var html = "";
    var rankEmojis = ["🥇", "🥈", "🥉"];
    var rankClasses = ["tv-rank-1", "tv-rank-2", "tv-rank-3"];

    for (var i = 0; i < ranking.length; i++) {
        var item = ranking[i];
        var rank = i + 1;
        var rankNumClass = rank <= 3 ? rankClasses[i] : "tv-rank-other";
        var rankDisplay = rank <= 3 ? rankEmojis[i] : rank;

        html += "<div class='tv-ranking-item'>";
        html += "  <div class='tv-rank-num " + rankNumClass + "'>" + rankDisplay + "</div>";
        html += "  <div class='tv-rank-name'>" + escapeHtml(item.name) + "</div>";
        html += "  <div class='tv-rank-count'>" + escapeHtml(String(item.count)) + "</div>";
        html += "  <div class='tv-rank-label'>회</div>";
        html += "</div>";
    }

    list.innerHTML = html;
}

// ==================== Firebase: AR Status ====================

function loadARStatus() {
    var todayStr = formatLocalDate(new Date());
    var query = arLogsRef.orderByChild("date").equalTo(todayStr);

    query.once("value").then(function(snapshot) {
        var count = snapshot.numChildren();
        if (TV_DOM.arCount) TV_DOM.arCount.textContent = count;

        // Check if AR is currently active (within operating hours)
        var now = new Date();
        var hour = now.getHours();
        var day = now.getDay();
        var isWeekend = day === 0 || day === 6;
        var isOperating = false;

        if (isWeekend) {
            isOperating = hour >= 10 && hour < 18;
        } else {
            isOperating = hour >= 10 && hour < 21;
        }

        if (!TV_DOM.arStatus) return;
        if (isOperating) {
            TV_DOM.arStatus.textContent = "운영 중";
            TV_DOM.arStatus.className = "tv-ar-status-badge status-active";
        } else {
            TV_DOM.arStatus.textContent = "운영 종료";
            TV_DOM.arStatus.className = "tv-ar-status-badge status-inactive";
        }
    }).catch(function(error) {
        console.error("[tv] loadARStatus error:", error);
        if (TV_DOM.arStatus) {
            TV_DOM.arStatus.textContent = "확인 불가";
            TV_DOM.arStatus.className = "tv-ar-status-badge status-inactive";
        }
    });
}

function subscribeARStatus() {
    var todayStr = formatLocalDate(new Date());
    var query = arLogsRef.orderByChild("date").equalTo(todayStr);

    if (arListener) arListener.off();
    arListener = query;
    arListener.on("value", function(snapshot) {
        var count = snapshot.numChildren();
        if (TV_DOM.arCount) {
            TV_DOM.arCount.textContent = count;
        }
    }, function(error) {
        console.error("[tv] subscribeARStatus error:", error);
        setConnectionStatus("error", "AR 예약 연결 오류");
    });
}

// ==================== Firebase: Events ====================

function renderEvents(events) {
    var container = TV_DOM.eventsContainer;
    if (!container) return;
    if (!events || typeof events !== "object") {
        container.innerHTML = "<div class='tv-events-empty'>진행 중인 이벤트가 없습니다</div>";
        return;
    }
        var now = new Date().getTime();
        var activeEvents = [];
        var keys = Object.keys(events);

        for (var i = 0; i < keys.length; i++) {
            var event = events[keys[i]];
            if (event && event.enabled !== false) {
                var startTime = event.startDate ? new Date(event.startDate + "T00:00:00").getTime() : 0;
                var endTime = event.endDate ? new Date(event.endDate + "T23:59:59").getTime() : Infinity;

                if (startTime <= now && endTime >= now) {
                    activeEvents.push(event);
                }
            }
        }

        if (activeEvents.length === 0) {
            container.innerHTML = "<div class='tv-events-empty'>진행 중인 이벤트가 없습니다</div>";
            return;
        }

        activeEvents.sort(function(a, b) { return (b.priority || 0) - (a.priority || 0); });
        var html = "";
        for (var j = 0; j < activeEvents.length; j++) {
            var evt = activeEvents[j];
            var eventImages = Array.isArray(evt.images) ? evt.images : (evt.images && typeof evt.images === "object" ? Object.values(evt.images) : []);
            if (!eventImages.length && evt.image) eventImages = [{ secure_url: evt.image }];
            html += "<div class='tv-event-card'>";
            if (eventImages.length) {
                html += "<div class='tv-event-images'>";
                eventImages.forEach(function(eventImage) {
                    if (eventImage && eventImage.secure_url) html += "<img src='" + escapeHtml(eventImage.secure_url) + "' alt='' class='tv-event-image'>";
                });
                html += "</div>";
            }
            html += "  <div class='tv-event-title'>" + escapeHtml(evt.title || "이벤트") + "</div>";
            if (evt.description) {
                html += "  <div class='tv-event-desc'>" + escapeHtml(evt.description) + "</div>";
            }
            html += "</div>";
        }

        container.innerHTML = html;
        container.querySelectorAll(".tv-event-image").forEach(function(image) {
            image.addEventListener("error", function() { image.remove(); }, { once: true });
        });
}

function subscribeEvents() {
    var eventsRef = db.ref("tvContent/events");
    if (eventsListener) eventsListener.off();
    eventsListener = eventsRef;
    eventsRef.on("value", function(snapshot) {
        renderEvents(snapshot.val());
    }, function(error) {
        console.error("[tv] subscribeEvents error:", error);
        renderContentError(TV_DOM.eventsContainer, "이벤트 연결 오류");
    });
}

// ==================== Firebase: Notices ====================

function renderNotices(notices) {
        var container = TV_DOM.noticesContainer;
        if (!container) return;
        container.classList.remove("tv-notices-container--fullscreen");
        var slideContent = container.closest(".tv-slide-content");
        if (slideContent) slideContent.classList.remove("tv-slide-content--fullscreen-notice");
        if (!notices || typeof notices !== "object") {
            container.innerHTML = "<div class='tv-notices-empty'>공지사항이 없습니다</div>";
            return;
        }
        var noticeList = [];
        var keys = Object.keys(notices);
        var now = Date.now();
        for (var i = 0; i < keys.length; i++) {
            var notice = notices[keys[i]];
            var start = notice && notice.startDate ? new Date(notice.startDate + "T00:00:00").getTime() : 0;
            var end = notice && notice.endDate ? new Date(notice.endDate + "T23:59:59").getTime() : Infinity;
            if (notice && notice.enabled !== false && (notice.title || notice.secure_url || notice.image || notice.imageUrl || notice.url) && start <= now && end >= now) {
                noticeList.push(notice);
            }
        }

        if (noticeList.length === 0) {
            container.innerHTML = "<div class='tv-notices-empty'>공지사항이 없습니다</div>";
            return;
        }

        // Sort by creation date (newest first)
        noticeList.sort(function(a, b) {
            return Number(b.emergency) - Number(a.emergency) || (b.priority || 0) - (a.priority || 0) || (b.createdAt || 0) - (a.createdAt || 0);
        });

        var imageNotice = noticeList.find(function(notice) {
            return notice && (notice.type === "image" || notice.secure_url || notice.image || notice.imageUrl || notice.url);
        });
        if (imageNotice) {
            var noticeImage = imageNotice.secure_url || imageNotice.image || imageNotice.imageUrl || imageNotice.url;
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

        var html = "";
        var maxNotices = Math.min(noticeList.length, 5); // Show max 5 notices
        for (var j = 0; j < maxNotices; j++) {
            var notice = noticeList[j];
            html += "<div class='tv-notice-item'>";
            html += "  <div class='tv-notice-title'>" + escapeHtml(notice.title) + "</div>";
            if (notice.description) {
                html += "  <div class='tv-notice-description'>" + escapeHtml(notice.description) + "</div>";
            }
            if (notice.date) {
                html += "  <div class='tv-notice-date'>" + escapeHtml(notice.date) + "</div>";
            }
            html += "</div>";
        }

        container.innerHTML = html;
}

function subscribeNotices() {
    var noticesRef = db.ref("tvContent/notices");
    if (noticesListener) noticesListener.off();
    noticesListener = noticesRef;
    noticesRef.on("value", function(snapshot) {
        renderNotices(snapshot.val());
    }, function(error) {
        console.error("[tv] subscribeNotices error:", error);
        renderContentError(TV_DOM.noticesContainer, "공지사항 연결 오류");
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

function initializeTV() {
    if (tvInitialized) return;
    cacheTVDOM();

    // Start clock
    updateClock();
    clockTimer = window.setInterval(updateClock, 1000);

    // Set connection status to connecting
    setConnectionStatus("connecting", "Firebase 연결 중...");

    // Subscribe to Firebase TV settings
    subscribeTVSettings();

    // Subscribe to real-time data
    subscribeTodayVisitors();
    subscribeARStatus();
    subscribeEvents();
    subscribeNotices();

    // Setup navigation
    setupDotNavigation();
    setupKeyboardShortcuts();
    setupPreviewControls();

    // Start slideshow
    startSlideshow();
    tvInitialized = true;

    // Re-check connection after auth
    auth.signInAnonymously()
        .then(function() {
            setConnectionStatus("connected", "Firebase 연결됨");
        })
        .catch(function(e) {
            console.error("[tv] auth error:", e);
            setConnectionStatus("error", "인증 오류");
        });
}

function setupPreviewControls() {
    if (!new URLSearchParams(location.search).has("preview")) return;
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
    window.clearInterval(clockTimer);
    if (tvSettingsListener) tvSettingsListener.off();
    if (visitorListener) visitorListener.off();
    if (arListener) arListener.off();
    if (eventsListener) eventsListener.off();
    if (noticesListener) noticesListener.off();
    db.ref("tvStatus").set({ online: false, lastSync: firebase.database.ServerValue.TIMESTAMP }).catch(function() {});
});

// ==================== Bootstrap ====================

// Use same DOMContentLoaded pattern as the main page
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeTV);
} else {
    initializeTV();
}
