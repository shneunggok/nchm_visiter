/**
 * ============================================================================
 * admin-tool / config / settings.js
 * ============================================================================
 * 
 * DEFAULT configuration values for the admin framework.
 * 
 * IMPORTANT: Do NOT put project-specific values in this file.
 * This file contains only the structure and sensible defaults.
 * 
 * Your project-specific configuration must be passed via:
 * 
 *   window.AdminTool.init({ firebase: {...}, auth: {...}, ... })
 * 
 * See admin-tool/README.md for detailed instructions.
 * ============================================================================
 */

window.ADMIN_TOOL_DEFAULTS = {

    // ────────────────────────────────────────────────────────────────────────
    // Firebase Database Paths (change if your DB structure differs)
    // ────────────────────────────────────────────────────────────────────────
    collections: {
        visitLogs: "visitLogs",
        arLogs: "arLogs",
        arSlotLocks: "arSlotLocks"
    },

    // ────────────────────────────────────────────────────────────────────────
    // Auth Security Defaults
    // ────────────────────────────────────────────────────────────────────────
    auth: {
        adminEmail: "",              // ★ YOU MUST SET THIS via AdminTool.init()
        maxLoginAttempts: 5,
        lockoutDurationMs: 60 * 1000,
        idleTimeoutMs: 30 * 60 * 1000
    },

    // ────────────────────────────────────────────────────────────────────────
    // Branding Defaults
    // ────────────────────────────────────────────────────────────────────────
    branding: {
        title: "Admin Tool",
        logoUrl: "",
        logoAlt: "Logo",
        faviconUrl: ""
    },

    // ────────────────────────────────────────────────────────────────────────
    // Menu / Navigation
    // ────────────────────────────────────────────────────────────────────────
    menu: [
        {
            id: "dashboard",
            label: "Dashboard",
            icon: "layout-dashboard",
            defaultTab: "visit-logs"
        }
    ],

    // ────────────────────────────────────────────────────────────────────────
    // Sub-Tabs for the Dashboard
    // ────────────────────────────────────────────────────────────────────────
    subTabs: {
        dashboard: [
            { id: "visit-logs", label: "Visit Logs", theme: "visit" },
            { id: "ar-logs", label: "AR Reservations", theme: "ar" }
        ]
    },

    // ────────────────────────────────────────────────────────────────────────
    // Demographics / Age Groups
    // ────────────────────────────────────────────────────────────────────────
    ageGroups: [],

    // ────────────────────────────────────────────────────────────────────────
    // Purposes
    // ────────────────────────────────────────────────────────────────────────
    visitPurposes: [],

    // ────────────────────────────────────────────────────────────────────────
    // Statistics Labels
    // ────────────────────────────────────────────────────────────────────────
    stats: {
        studyRoomLabel: "Study Room",
        arRoomLabel: "AR Room",
        youthSumLabel: "Youth Total",
        youngSumLabel: "Young Adult Total",
        totalSumLabel: "Grand Total"
    },

    // ────────────────────────────────────────────────────────────────────────
    // Theme / CSS Classes
    // ────────────────────────────────────────────────────────────────────────
    theme: {
        adminBodyClass: "at-theme-admin",
        adminLayoutClass: "at-max-w-6xl",
        publicLayoutClass: "at-max-w-xl",
        statsSumCol: "at-sum-col",
        statsArSumCol: "at-ar-sum-col",
        statsTotalSumCol: "at-total-sum-col",
        statsFinalVisit: "at-final-total-visit",
        statsFinalAR: "at-final-total-ar"
    },

    // ────────────────────────────────────────────────────────────────────────
    // Future Expansion Flags
    // ────────────────────────────────────────────────────────────────────────
    features: {
        eventManagement: false,
        tvDashboard: true,
        popupManagement: false,
        bannerManagement: false,
        noticeManagement: false,
        websiteSettings: false,
        themeSettings: false,
        userManagement: false,
        attendanceRanking: false,
        analytics: false
    },

    // ────────────────────────────────────────────────────────────────────────
    // Excel Export Settings
    // ────────────────────────────────────────────────────────────────────────
    excel: {
        visitFileName: "visit_log",
        arFileName: "ar_reservation",
        dateFormat: "YYYY-MM-DD"
    }
};