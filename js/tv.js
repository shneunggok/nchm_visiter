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
        "photos",
        "notices"
    ],
    enabledSlides: {
        welcome: true,   // Welcome is always shown
        visitors: true,
        ranking: true,
        ar: true,
        events: true,
        photos: true,
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
let tvLastSettings = {};

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
    TV_DOM.photoContainer = document.getElementById("tv-photo-container");
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

function showSlide(index) {
    if (isTransitioning) return;
    if (index < 0 || index >= TV_CONFIG.slideOrder.length) return;

    isTransitioning = true;
    currentSlideIndex = index;

    const slideId = TV_CONFIG.slideOrder[index];
    const sourceId = slideId.split("-")[0];

    // Skip slide if it's disabled in settings
    if (!TV_CONFIG.enabledSlides[slideId]) {
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
    db.ref("tvStatus").set({ online: true, lastSync: firebase.database.ServerValue.TIMESTAMP, currentSlide: sourceId }).catch(function(error) {
        console.warn("[tv] status update skipped:", error.code || error.message);
    });

    setTimeout(function() {
        isTransitioning = false;
    }, TV_CONFIG.transitionDuration);
}

function advanceSlide() {
    var nextIndex = currentSlideIndex + 1;

    // Find next enabled slide
    var attempts = 0;
    while (attempts < TV_CONFIG.slideOrder.length) {
        if (nextIndex >= TV_CONFIG.slideOrder.length) {
            nextIndex = 0;
        }
        var slideId = TV_CONFIG.slideOrder[nextIndex];
        if (TV_CONFIG.enabledSlides[slideId]) {
            break;
        }
        nextIndex++;
        attempts++;
    }

    showSlide(nextIndex);
}

function startSlideshow() {
    if (slideTimer) {
        clearInterval(slideTimer);
    }

    // Show first enabled slide
    var firstIndex = 0;
    for (var i = 0; i < TV_CONFIG.slideOrder.length; i++) {
        if (TV_CONFIG.enabledSlides[TV_CONFIG.slideOrder[i]]) {
            firstIndex = i;
            break;
        }
    }
    showSlide(firstIndex);

    const scheduleNext = function() {
        const slide = tvLastSettings.slides && tvLastSettings.slides[currentSlideIndex];
        const duration = Math.max(3000, Number(slide && slide.duration || TV_CONFIG.slideInterval / 1000) * 1000);
        slideTimer = setTimeout(function() { advanceSlide(); scheduleNext(); }, duration);
    };
    scheduleNext();
}

function stopSlideshow() {
    if (slideTimer) {
        clearTimeout(slideTimer);
        slideTimer = null;
    }
}

// ==================== Slide Content Refresh ====================

function refreshSlideContent(slideId) {
    switch (slideId) {
        case "visitors":
            loadTodayVisitors();
            break;
        case "ranking":
            loadAttendanceRanking();
            break;
        case "ar":
            loadARStatus();
            break;
        case "events":
            loadEvents();
            break;
        case "photos":
            loadPhotos();
            break;
        case "notices":
            loadNotices();
            break;
        default:
            break;
    }
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
            TV_CONFIG.slideOrder = settings.slides.map(function(slide) { return slide.id; });
            TV_CONFIG.enabledSlides = {};
            settings.slides.forEach(function(slide) { TV_CONFIG.enabledSlides[slide.id] = slide.enabled !== false; });
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
        if (settings.slideInterval && settings.slideInterval >= 3000) {
            TV_CONFIG.slideInterval = settings.slideInterval;
            // Restart slideshow with new interval
            if (tvInitialized) {
                startSlideshow();
            }
        }
        applyTVAppearance(settings);

        setConnectionStatus("connected", "Firebase 연결됨");
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
    if (overlay && bg.image) overlay.style.backgroundImage = "linear-gradient(rgba(15,23,42,.65),rgba(15,23,42,.65)),url('" + bg.image.replace(/'/g, "%27") + "')";
    var welcome = settings.welcome || {};
    if (welcome.title) document.querySelector(".tv-title").textContent = welcome.title;
    if (welcome.subtitle) document.querySelector(".tv-subtitle").textContent = welcome.subtitle;
    if (welcome.logo) document.querySelector(".tv-logo").src = welcome.logo;
}

// ==================== Firebase: Today's Visitors ====================

function loadTodayVisitors() {
    var todayStr = formatLocalDate(new Date());
    var query = visitLogsRef.orderByChild("date").equalTo(todayStr);

    query.once("value").then(function(snapshot) {
        var count = snapshot.numChildren();
        TV_DOM.todayCount.textContent = count;
    }).catch(function(error) {
        console.error("[tv] loadTodayVisitors error:", error);
    });
}

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
        TV_DOM.arCount.textContent = count;

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

        if (isOperating) {
            TV_DOM.arStatus.textContent = "운영 중";
            TV_DOM.arStatus.className = "tv-ar-status-badge status-active";
        } else {
            TV_DOM.arStatus.textContent = "운영 종료";
            TV_DOM.arStatus.className = "tv-ar-status-badge status-inactive";
        }
    }).catch(function(error) {
        console.error("[tv] loadARStatus error:", error);
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
    });
}

// ==================== Firebase: Events ====================

function loadEvents() {
    var eventsRef = db.ref("tvContent/events");
    eventsRef.once("value").then(function(snapshot) {
        var events = snapshot.val();
        var container = TV_DOM.eventsContainer;

        if (!events) {
            container.innerHTML = "<div class='tv-events-empty'>진행 중인 이벤트가 없습니다</div>";
            return;
        }

        var now = new Date().getTime();
        var activeEvents = [];
        var keys = Object.keys(events);

        for (var i = 0; i < keys.length; i++) {
            var event = events[keys[i]];
            if (event && event.enabled !== false) {
                var startTime = event.startDate ? new Date(event.startDate).getTime() : 0;
                var endTime = event.endDate ? new Date(event.endDate).getTime() : Infinity;

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
            html += "<div class='tv-event-card'>";
            if (evt.image) html += "  <img src='" + escapeHtml(evt.image) + "' alt='' class='tv-event-image'>";
            html += "  <div class='tv-event-title'>" + escapeHtml(evt.title || "이벤트") + "</div>";
            if (evt.description) {
                html += "  <div class='tv-event-desc'>" + escapeHtml(evt.description) + "</div>";
            }
            html += "</div>";
        }

        container.innerHTML = html;
    }).catch(function(error) {
        console.error("[tv] loadEvents error:", error);
    });
}

function subscribeEvents() {
    var eventsRef = db.ref("tvContent/events");
    eventsRef.on("value", function(snapshot) {
        // Re-load events whenever data changes
        loadEvents();
    }, function(error) {
        console.error("[tv] subscribeEvents error:", error);
    });
}

// ==================== Firebase: Photos ====================

function loadPhotos() {
    var photosRef = db.ref("tvContent/photos");
    photosRef.once("value").then(function(snapshot) {
        var photos = snapshot.val();
        var container = TV_DOM.photoContainer;

        if (!photos) {
            container.innerHTML = "<div class='tv-photo-empty'>등록된 사진이 없습니다</div>";
            return;
        }

        var photoList = [];
        var keys = Object.keys(photos);
        for (var i = 0; i < keys.length; i++) {
            var photo = photos[keys[i]];
            if (photo && photo.url) {
                photoList.push(photo);
            }
        }

        if (photoList.length === 0) {
            container.innerHTML = "<div class='tv-photo-empty'>등록된 사진이 없습니다</div>";
            return;
        }

        // Show first photo
        container.innerHTML = "<img src='" + escapeHtml(photoList[0].url) + "' alt='갤러리' class='tv-photo-img' onerror='this.style.display=\"none\"'>";
    }).catch(function(error) {
        console.error("[tv] loadPhotos error:", error);
    });
}

function subscribePhotos() {
    var photosRef = db.ref("tvContent/photos");
    photosRef.on("value", function(snapshot) {
        loadPhotos();
    }, function(error) {
        console.error("[tv] subscribePhotos error:", error);
    });
}

// ==================== Firebase: Notices ====================

function loadNotices() {
    var noticesRef = db.ref("tvContent/notices");
    noticesRef.once("value").then(function(snapshot) {
        var notices = snapshot.val();
        var container = TV_DOM.noticesContainer;

        if (!notices) {
            container.innerHTML = "<div class='tv-notices-empty'>공지사항이 없습니다</div>";
            return;
        }

        var noticeList = [];
        var keys = Object.keys(notices);
        for (var i = 0; i < keys.length; i++) {
            var notice = notices[keys[i]];
            var now = Date.now();
            var start = notice && notice.startDate ? new Date(notice.startDate).getTime() : 0;
            var end = notice && notice.endDate ? new Date(notice.endDate + "T23:59:59").getTime() : Infinity;
            if (notice && notice.title && start <= now && end >= now) {
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

        var html = "";
        var maxNotices = Math.min(noticeList.length, 5); // Show max 5 notices
        for (var j = 0; j < maxNotices; j++) {
            var notice = noticeList[j];
            html += "<div class='tv-notice-item'>";
            html += "  <div class='tv-notice-title'>" + escapeHtml(notice.title) + "</div>";
            if (notice.date) {
                html += "  <div class='tv-notice-date'>" + escapeHtml(notice.date) + "</div>";
            }
            html += "</div>";
        }

        container.innerHTML = html;
    }).catch(function(error) {
        console.error("[tv] loadNotices error:", error);
    });
}

function subscribeNotices() {
    var noticesRef = db.ref("tvContent/notices");
    noticesRef.on("value", function(snapshot) {
        loadNotices();
    }, function(error) {
        console.error("[tv] subscribeNotices error:", error);
    });
}

// ==================== Manual Dot Click Navigation ====================

function setupDotNavigation() {
    TV_DOM.dots.forEach(function(dot) {
        dot.addEventListener("click", function() {
            var slideId = this.getAttribute("data-slide");
            var index = TV_CONFIG.slideOrder.indexOf(slideId);
            if (index >= 0) {
                stopSlideshow();
                showSlide(index);
                // Restart after manual navigation
                setTimeout(function() {
                    startSlideshow();
                }, TV_CONFIG.slideInterval * 2);
            }
        });
    });
}

// ==================== Keyboard Shortcuts ====================

function setupKeyboardShortcuts() {
    document.addEventListener("keydown", function(e) {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            stopSlideshow();
            advanceSlide();
            setTimeout(function() { startSlideshow(); }, TV_CONFIG.slideInterval * 2);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            stopSlideshow();
            var prevIndex = currentSlideIndex - 1;
            if (prevIndex < 0) prevIndex = TV_CONFIG.slideOrder.length - 1;
            showSlide(prevIndex);
            setTimeout(function() { startSlideshow(); }, TV_CONFIG.slideInterval * 2);
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
    cacheTVDOM();

    // Start clock
    updateClock();
    setInterval(updateClock, 1000);

    // Set connection status to connecting
    setConnectionStatus("connecting", "Firebase 연결 중...");

    // Subscribe to Firebase TV settings
    subscribeTVSettings();

    // Subscribe to real-time data
    subscribeTodayVisitors();
    subscribeARStatus();
    subscribeEvents();
    subscribePhotos();
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
    controls.classList.remove("hidden");
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
    stopSlideshow();
    if (tvSettingsListener) tvSettingsListener.off();
    if (visitorListener) visitorListener.off();
    if (arListener) arListener.off();
    db.ref("tvStatus").set({ online: false, lastSync: firebase.database.ServerValue.TIMESTAMP }).catch(function() {});
});

// ==================== Bootstrap ====================

// Use same DOMContentLoaded pattern as the main page
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeTV);
} else {
    initializeTV();
}
