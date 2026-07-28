const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const context = { console };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../js/tv-common.js"), "utf8"),
    context
);
const common = context.TVCommon;

test("preview mode blocks every TV status write decision", () => {
    assert.equal(common.shouldWriteStatus(true), false);
    assert.equal(common.shouldWriteStatus(false), true);
});

test("date status uses inclusive start and end dates", () => {
    const event = { startDate: "2026-07-01", endDate: "2026-07-31" };
    assert.equal(common.dateStatus(event, "2026-06-30"), "upcoming");
    assert.equal(common.dateStatus(event, "2026-07-01"), "active");
    assert.equal(common.dateStatus(event, "2026-07-31"), "active");
    assert.equal(common.dateStatus(event, "2026-08-01"), "ended");
});

test("failed autosave revision is not retried until a new edit", () => {
    assert.equal(common.canAutoSaveRevision(4, 4), false);
    assert.equal(common.canAutoSaveRevision(5, 4), true);
});

test("Cloudinary file fingerprints allow successful uploads to be reused", () => {
    const file = { name: "poster.png", size: 1200, lastModified: 42 };
    assert.equal(common.cloudFileFingerprint(file), common.cloudFileFingerprint({ ...file }));
    assert.notEqual(common.cloudFileFingerprint(file), common.cloudFileFingerprint({ ...file, size: 1201 }));
});

test("ended attendance events do not auto-load logs", () => {
    assert.equal(common.shouldAutoLoadAttendance({ startDate: "2026-01-01", endDate: "2026-01-02" }, "2026-07-26"), false);
    assert.equal(common.shouldAutoLoadAttendance({ startDate: "2026-07-26", endDate: "2026-07-26" }, "2026-07-26"), true);
});

test("fixed playlist ignores duplicate records and restores welcome when all disabled", () => {
    const slides = common.normalizeFixedSlides(
        common.FIXED_SLIDE_IDS.map((id) => ({ id, enabled: false })).concat({ id: "welcome-copy", enabled: true })
    );
    assert.equal(slides.length, 7);
    assert.equal(slides.filter((slide) => slide.id === "welcome").length, 1);
    assert.equal(slides.find((slide) => slide.id === "welcome").enabled, true);
});

test("admin and TV notice order is emergency, priority, then newest", () => {
    const sorted = common.sortNotices([
        ["normal", { priority: 100, createdAt: 300 }],
        ["urgent-old", { emergency: true, priority: 1, createdAt: 100 }],
        ["urgent-new", { emergency: true, priority: 1, createdAt: 200 }]
    ]);
    assert.deepEqual(Array.from(sorted, (entry) => entry[0]), ["urgent-new", "urgent-old", "normal"]);
});

test("event order uses priority and creation time consistently", () => {
    const sorted = common.sortEvents([
        ["old", { priority: 1, createdAt: 100 }],
        ["high", { priority: 2, createdAt: 1 }],
        ["new", { priority: 1, createdAt: 200 }]
    ]);
    assert.deepEqual(Array.from(sorted, (entry) => entry[0]), ["high", "new", "old"]);
});

test("TV theme presets keep the documented palette and safe fallback", () => {
    assert.deepEqual(
        { ...common.themePreset("dark") },
        { name: "Midnight Mint", background: "#0B1220", accent: "#2DD4BF", secondary: "#38BDF8" }
    );
    assert.equal(common.themePreset("unknown").name, "Midnight Mint");
});

test("recommended TV backgrounds are complete, unique, and safely selectable", () => {
    const presets = common.backgroundPresets();
    assert.equal(presets.length, 8);
    assert.equal(new Set(presets.map((preset) => preset.id)).size, presets.length);
    presets.forEach((preset) => {
        assert.match(preset.background, /^#[0-9a-f]{6}$/i);
        assert.ok(["dark", "blue", "light"].includes(preset.theme));
        assert.match(preset.preview, /gradient\(/);
    });
    assert.equal(common.backgroundPreset("midnight-mint").name, "미드나잇 민트");
    assert.equal(common.backgroundPreset("does-not-exist"), null);

    const copy = common.backgroundPreset("midnight-mint");
    copy.background = "#000000";
    assert.equal(common.backgroundPreset("midnight-mint").background, "#0B1220");
});
