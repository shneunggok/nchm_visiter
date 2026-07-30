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

test("TV slide duration offers short and long choices while preserving a custom value", () => {
    const harness = createEditorModalHarness();
    const standard = harness.modalContext.tvSlideDurationOptions(45);
    const custom = harness.modalContext.tvSlideDurationOptions(7);

    [3, 5, 8, 10, 12, 15, 20, 25, 30, 45, 60, 90, 120].forEach((seconds) => {
        assert.match(standard, new RegExp(`value="${seconds}"`));
    });
    assert.match(standard, /value="45" selected/);
    assert.match(custom, /value="7" selected/);
    assert.ok(custom.indexOf('value="5"') < custom.indexOf('value="7"'));
    assert.ok(custom.indexOf('value="7"') < custom.indexOf('value="8"'));
});

function createEditorModalHarness() {
    const handlers = new Map();
    const makeTarget = () => ({
        isConnected: true,
        handlers: new Map(),
        addEventListener(type, handler) {
            this.handlers.set(type, handler);
        },
        focus() {
            this.focused = true;
        }
    });
    const closeButtons = [makeTarget(), makeTarget()];
    const firstInput = makeTarget();
    const error = { textContent: "" };
    const form = makeTarget();
    form.elements = {
        startDate: { value: "" },
        endDate: { value: "", focus() {} }
    };
    form.reportValidity = () => true;
    form.querySelector = () => firstInput;

    const root = makeTarget();
    root.hidden = true;
    root.innerHTML = "";
    root.querySelector = (selector) => selector === "#tv-editor-form" ? form : error;
    root.querySelectorAll = () => closeButtons;
    const modalSibling = makeTarget();
    const modalParent = {
        isConnected: true,
        appendChild(child) {
            child.parentNode = this;
            child.nextSibling = null;
        },
        insertBefore(child, sibling) {
            child.parentNode = this;
            child.nextSibling = sibling;
        }
    };
    root.parentNode = modalParent;
    root.nextSibling = modalSibling;
    modalSibling.parentNode = modalParent;

    const returnFocus = makeTarget();
    const body = {
        style: { overflow: "clip" },
        appendChild(child) {
            child.parentNode = this;
            child.nextSibling = null;
        }
    };
    const document = {
        activeElement: returnFocus,
        body,
        getElementById: (id) => id === "tv-content-modal" ? root : null,
        addEventListener(type, handler) {
            handlers.set(type, handler);
        },
        removeEventListener(type, handler) {
            if (handlers.get(type) === handler) handlers.delete(type);
        }
    };
    const modalContext = {
        console,
        document,
        window: { addEventListener() {} },
        TVCommon: {},
        escapeHtml: (value) => String(value),
        FormData: class {
            entries() {
                return [["title", "테스트"]];
            }
        }
    };
    modalContext.globalThis = modalContext;
    vm.createContext(modalContext);
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, "../js/tv-admin.js"), "utf8"),
        modalContext
    );
    return {
        modalContext,
        document,
        root,
        form,
        closeButtons,
        firstInput,
        returnFocus,
        handlers,
        modalParent,
        modalSibling
    };
}

test("TV editor modal restores the previous page scroll state on every central close", async () => {
    const harness = createEditorModalHarness();
    const result = harness.modalContext.tvOpenEditorModal({
        title: "출석 이벤트 수정",
        submitLabel: "수정 저장",
        fields: "<input name=\"title\">"
    });

    assert.equal(harness.root.hidden, false);
    assert.equal(harness.document.body.style.overflow, "hidden");
    assert.equal(harness.root.parentNode, harness.document.body);
    assert.equal(harness.firstInput.focused, true);
    assert.equal(harness.handlers.has("keydown"), true);

    harness.closeButtons[0].handlers.get("click")();
    assert.equal(await result, null);
    assert.equal(harness.root.hidden, true);
    assert.equal(harness.document.body.style.overflow, "clip");
    assert.equal(harness.handlers.has("keydown"), false);
    assert.equal(harness.returnFocus.focused, true);
    assert.equal(harness.root.parentNode, harness.modalParent);
    assert.equal(harness.root.nextSibling, harness.modalSibling);
});

test("TV editor modal ESC close cannot leave a duplicate key listener or body lock", async () => {
    const harness = createEditorModalHarness();
    const result = harness.modalContext.tvOpenEditorModal({
        title: "행사 수정",
        submitLabel: "수정 저장",
        fields: "<input name=\"title\">"
    });
    let prevented = false;
    harness.handlers.get("keydown")({
        key: "Escape",
        preventDefault() {
            prevented = true;
        }
    });

    assert.equal(await result, null);
    assert.equal(prevented, true);
    assert.equal(harness.document.body.style.overflow, "clip");
    assert.equal(harness.handlers.size, 0);
});

test("TV editor modal submit and backdrop close use the same cleanup path", async () => {
    const submitHarness = createEditorModalHarness();
    const submitResult = submitHarness.modalContext.tvOpenEditorModal({
        title: "출석 이벤트 수정",
        submitLabel: "수정 저장",
        fields: "<input name=\"title\">"
    });
    submitHarness.form.handlers.get("submit")({ preventDefault() {} });
    assert.equal((await submitResult).title, "테스트");
    assert.equal(submitHarness.document.body.style.overflow, "clip");
    assert.equal(submitHarness.handlers.size, 0);

    const backdropHarness = createEditorModalHarness();
    const backdropResult = backdropHarness.modalContext.tvOpenEditorModal({
        title: "행사 수정",
        submitLabel: "수정 저장",
        fields: "<input name=\"title\">"
    });
    backdropHarness.root.onclick({ target: backdropHarness.root });
    assert.equal(await backdropResult, null);
    assert.equal(backdropHarness.document.body.style.overflow, "clip");
    assert.equal(backdropHarness.handlers.size, 0);
    assert.equal(backdropHarness.root.onclick, null);
});

test("TV editor CSS assigns overflow to the form body for wheel and touch scrolling", () => {
    const css = fs.readFileSync(path.join(__dirname, "../tv-admin.css"), "utf8");
    const bodyRule = css.match(/\.tv-admin-dialog-body\s*\{([^}]+)\}/)?.[1] || "";
    const dialogRule = css.match(/\.tv-admin-dialog\s*\{([^}]+)\}/)?.[1] || "";

    assert.match(dialogRule, /display:\s*flex/);
    assert.match(dialogRule, /overflow:\s*hidden/);
    assert.match(bodyRule, /overflow-y:\s*auto/);
    assert.match(bodyRule, /overscroll-behavior:\s*contain/);
    assert.match(bodyRule, /touch-action:\s*pan-y/);
    assert.match(bodyRule, /-webkit-overflow-scrolling:\s*touch/);
    assert.match(css, /100dvh/);
});
