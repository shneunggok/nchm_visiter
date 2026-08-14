const ADMIN_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_BACKUP_NODES = [
    "visitLogs", "arLogs", "arSlotLocks", "tvSettings", "tvContent",
    "arOperations", "specialDaySettings", "adminSettings", "adminTrash", "adminAudit"
];

let adminSearchVersion = 0;
let adminEditingRecord = null;

function adminActor() {
    const user = auth.currentUser;
    return {
        uid: user?.uid || "unknown",
        email: user?.email || "unknown"
    };
}

function adminAuditEntry(action, type, key, before, after) {
    const actor = adminActor();
    return {
        action,
        recordType: type,
        recordKey: key,
        actorUid: actor.uid,
        actorEmail: actor.email,
        changedAt: firebase.database.ServerValue.TIMESTAMP,
        before: before || null,
        after: after || null
    };
}

function adminRecordLabel(type, record) {
    if (type === "visit") return record?.name || "이름 없음";
    const names = toArray(record?.users)
        .map((user) => String(user?.name || "").trim())
        .filter(Boolean);
    return names.length ? names.join(", ") : "예약자 없음";
}

function adminRecordSummary(type, record) {
    if (type === "visit") {
        return `${record.date || "-"} ${record.time || "-"} · ${record.gender || "-"} · ${(record.age || "-").split("(")[0]} · ${toArray(record.purposes).join(", ")}`;
    }
    return `${record.date || "-"} ${record.timeSlot || "-"} · ${toArray(record.users).length}명 · ${record.status || "예약"}`;
}

function normalizeAdminNameSearchValue(value) {
    return String(value || "")
        .normalize("NFKC")
        .toLocaleLowerCase("ko-KR")
        .replace(/\s+/g, "");
}

function adminRecordUsers(type, record) {
    return type === "visit"
        ? [record]
        : toArray(record?.users).filter((user) => user && typeof user === "object");
}

function adminRecordMatchesSearch(type, record, filters) {
    const users = adminRecordUsers(type, record);
    const matchesName = !filters.name || users.some((user) =>
        normalizeAdminNameSearchValue(user?.name).includes(filters.name)
    );
    const matchesAge = !filters.age || users.some((user) => user?.age === filters.age);
    const matchesPurpose = !filters.purpose
        || (type === "visit" && toArray(record?.purposes).includes(filters.purpose));
    return matchesName && matchesAge && matchesPurpose;
}

async function loadAdminRecordsForSearch(type, start, end, requestVersion) {
    const ref = type === "visit" ? visitLogsRef : arLogsRef;
    const records = [];
    const snapshot = await ref.once("value");
    if (requestVersion !== adminSearchVersion || !isAdminUser) return null;
    snapshot.forEach((child) => {
        const value = child.val();
        if (!value || typeof value !== "object" || !isValidDateKey(value.date)) return;
        if (value.date < start || value.date > end) return;
        records.push({ ...value, _key: child.key });
    });
    return records;
}

function renderAdminSearchResults(results) {
    const target = document.getElementById("admin-search-results");
    const status = document.getElementById("admin-search-status");
    if (!target || !status) return;
    status.textContent = `${results.length.toLocaleString("ko-KR")}건을 찾았습니다.`;
    target.innerHTML = results.length ? results.map(({ type, record }) => `
        <article class="admin-record-card">
            <div class="admin-record-card-main">
                <strong>${type === "visit" ? "방문" : "AR"} · ${escapeHtml(adminRecordLabel(type, record))}</strong>
                <span>${escapeHtml(adminRecordSummary(type, record))}</span>
            </div>
            <div class="admin-record-card-actions">
                <button type="button" class="admin-secondary-button" onclick="openAdminRecordModal('${type}','${escapeHtml(record._key)}')">수정</button>
                <button type="button" class="admin-secondary-button admin-danger-button" onclick="moveAdminRecordToTrash('${type}','${escapeHtml(record._key)}')">삭제</button>
            </div>
        </article>`).join("") : '<p class="admin-inline-status">조건에 맞는 기록이 없습니다.</p>';
}

async function runAdminIntegratedSearch() {
    if (!isAdminUser) return false;
    const status = document.getElementById("admin-search-status");
    const start = document.getElementById("admin-search-start")?.value;
    const end = document.getElementById("admin-search-end")?.value;
    if (!isValidDateKey(start) || !isValidDateKey(end) || start > end) {
        showMessage("검색 시작일과 종료일을 확인해 주세요.");
        return false;
    }
    const name = normalizeAdminNameSearchValue(document.getElementById("admin-search-name")?.value);
    const age = document.getElementById("admin-search-age")?.value || "";
    const purpose = document.getElementById("admin-search-purpose")?.value || "";
    const selectedType = document.getElementById("admin-search-type")?.value || "all";
    const types = selectedType === "all" ? ["visit", "ar"] : [selectedType];
    const requestVersion = ++adminSearchVersion;
    const searchButton = document.getElementById("admin-integrated-search-button");
    if (searchButton) {
        searchButton.disabled = true;
        searchButton.setAttribute("aria-busy", "true");
    }
    if (status) status.textContent = "선택 기간 전체 기록을 검색하는 중입니다…";
    try {
        const loaded = await Promise.all(types.map(async (type) => ({
            type,
            records: await loadAdminRecordsForSearch(type, start, end, requestVersion)
        })));
        if (requestVersion !== adminSearchVersion) return false;
        const results = loaded.flatMap(({ type, records }) => (records || []).map((record) => ({ type, record })))
            .filter(({ type, record }) => adminRecordMatchesSearch(type, record, { name, age, purpose }))
            .sort((a, b) => `${b.record.date || ""} ${b.record.timeSlot || b.record.time || ""}`.localeCompare(`${a.record.date || ""} ${a.record.timeSlot || a.record.time || ""}`));
        renderAdminSearchResults(results);
        return true;
    } catch (error) {
        logError("admin-search", error);
        if (status) status.textContent = "검색하지 못했습니다. 네트워크 연결 후 다시 시도해 주세요.";
        return false;
    } finally {
        if (requestVersion === adminSearchVersion && searchButton) {
            searchButton.disabled = false;
            searchButton.setAttribute("aria-busy", "false");
        }
    }
}

function findLoadedAdminRecord(type, key) {
    const records = type === "visit" ? visitLogs : arLogs;
    const todayRecords = type === "ar" ? adminArTodayRecords : [];
    return records.find((item) => item._key === key) || todayRecords.find((item) => item._key === key) || null;
}

async function getAdminRecord(type, key) {
    const loaded = findLoadedAdminRecord(type, key);
    if (loaded) return loaded;
    const snap = await db.ref(`${type === "visit" ? "visitLogs" : "arLogs"}/${key}`).once("value");
    return snap.exists() ? { _key: key, ...snap.val() } : null;
}

function adminAgeOptions(selected) {
    return AGE_GROUPS.map((age) => `<option value="${escapeHtml(age)}" ${age === selected ? "selected" : ""}>${escapeHtml(age)}</option>`).join("");
}

async function openAdminRecordModal(type, key) {
    if (!isAdminUser || !["visit", "ar"].includes(type)) return false;
    const isNew = !key;
    const now = new Date();
    const defaultTime = `${String(now.getHours()).padStart(2, "0")}:${now.getMinutes() < 30 ? "00" : "30"}`;
    const record = isNew ? (type === "visit" ? {
        date: formatLocalDate(now), time: normalizeArTimeSlot(defaultTime), name: "", gender: "남", age: AGE_GROUPS[0], purposes: []
    } : {
        date: formatLocalDate(now), timeSlot: normalizeArTimeSlot(defaultTime), users: [{ name: "", gender: "남", age: AGE_GROUPS[0] }], status: "reserved"
    }) : await getAdminRecord(type, key);
    if (!record) {
        showMessage("수정할 기록을 찾을 수 없습니다.");
        return false;
    }
    adminEditingRecord = { type, key, record, isNew };
    const modal = document.getElementById("admin-record-modal");
    const title = document.getElementById("admin-record-modal-title");
    const body = document.getElementById("admin-record-form-body");
    if (title) title.textContent = `${type === "visit" ? "방문 기록" : "AR 예약"} ${isNew ? "수동 등록" : "수정"}`;
    if (type === "visit") {
        body.innerHTML = `
            <label>날짜<input name="date" type="date" required value="${escapeHtml(record.date || "")}"></label>
            <label>시간<input name="time" type="time" required value="${escapeHtml(normalizeArTimeSlot(record.time) || "")}"></label>
            <label>이름<input name="name" maxlength="10" required value="${escapeHtml(record.name || "")}"></label>
            <label>성별<select name="gender"><option ${record.gender === "남" ? "selected" : ""}>남</option><option ${record.gender === "여" ? "selected" : ""}>여</option></select></label>
            <label class="wide">연령<select name="age" required>${adminAgeOptions(record.age)}</select></label>
            <div class="wide"><span>이용 목적</span><div class="admin-purpose-checks">${PURPOSES.map((purpose) => `<label><input type="checkbox" name="purposes" value="${escapeHtml(purpose)}" ${toArray(record.purposes).includes(purpose) ? "checked" : ""}>${escapeHtml(purpose)}</label>`).join("")}</div></div>`;
    } else {
        body.innerHTML = `
            <label>예약 날짜<input name="date" type="date" required value="${escapeHtml(record.date || "")}"></label>
            <label>예약 시간<input name="timeSlot" type="time" step="1800" required value="${escapeHtml(normalizeArTimeSlot(record.timeSlot) || "")}"></label>
            <label class="wide">상태<select name="status"><option value="reserved">예약</option><option value="arrived">도착</option><option value="in_use">이용 중</option><option value="completed">이용 완료</option><option value="no_show">노쇼</option><option value="cancelled">취소</option></select></label>
            <div class="wide" id="admin-ar-edit-users">${toArray(record.users).map((user, index) => `
                <div class="admin-record-form-body" data-admin-ar-user style="padding:10px 0">
                    <label>이름 ${index + 1}<input name="userName" maxlength="10" required value="${escapeHtml(user.name || "")}"></label>
                    <label>성별<select name="userGender"><option ${user.gender === "남" ? "selected" : ""}>남</option><option ${user.gender === "여" ? "selected" : ""}>여</option></select></label>
                    <label class="wide">연령<select name="userAge">${adminAgeOptions(user.age)}</select></label>
                </div>`).join("")}</div>`;
        body.querySelector('[name="status"]').value = record.status || "reserved";
    }
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    body.querySelector("input")?.focus();
    return true;
}

function closeAdminRecordModal() {
    const modal = document.getElementById("admin-record-modal");
    modal?.classList.add("hidden");
    modal?.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    adminEditingRecord = null;
}

async function updateAdminArRecord(key, before, after, auditKey) {
    const oldSlotKey = before.slotKey || createSlotKey(before.date, before.timeSlot);
    const newSlotKey = createSlotKey(after.date, after.timeSlot);
    const lockValue = before.requestId || key;
    if (newSlotKey !== oldSlotKey) {
        const lockRef = db.ref(`arSlotLocks/${newSlotKey}`);
        const result = await lockRef.transaction((current) => current === null || current === lockValue ? lockValue : undefined, undefined, false);
        if (!result.committed) {
            const error = new Error("SLOT_TAKEN");
            error.code = "SLOT_TAKEN";
            throw error;
        }
    }
    const updates = {
        [`arLogs/${key}`]: after,
        [`adminAudit/${auditKey}`]: adminAuditEntry("update", "ar", key, before, after)
    };
    if (newSlotKey !== oldSlotKey) {
        updates[`arSlotLocks/${oldSlotKey}`] = null;
        updates[`arSlotLocks/${newSlotKey}`] = lockValue;
    }
    try {
        await db.ref().update(updates);
    } catch (error) {
        if (newSlotKey !== oldSlotKey) {
            await db.ref(`arSlotLocks/${newSlotKey}`).transaction((current) => current === lockValue ? null : current).catch(() => {});
        }
        throw error;
    }
}

async function createAdminManualRecord(type, record) {
    const payload = type === "visit"
        ? [{ date: record.date, time: record.time, name: record.name, gender: record.gender, age: record.age, purposes: record.purposes }]
        : { date: record.date, timeSlot: record.timeSlot, users: record.users };
    if (type === "visit") {
        const request = await saveVisitLogs(payload);
        const key = `${request.requestId}-0`;
        const auditKey = db.ref("adminAudit").push().key;
        await db.ref(`visitLogs/${key}`).once("value").then((snapshot) => db.ref(`adminAudit/${auditKey}`).set(adminAuditEntry("create", "visit", key, null, snapshot.val())));
        completePersistentRequest(request.requestId);
        return key;
    }
    const key = generateRequestId();
    const payloadHash = await hashRequestPayload(payload);
    const slotKey = createSlotKey(record.date, record.timeSlot);
    const lockRef = db.ref(`arSlotLocks/${slotKey}`);
    const lockResult = await lockRef.transaction((current) => current === null ? key : undefined, undefined, false);
    if (!lockResult.committed) {
        const error = new Error("SLOT_TAKEN");
        error.code = "SLOT_TAKEN";
        throw error;
    }
    const saved = {
        date: record.date,
        timeSlot: record.timeSlot,
        users: record.users,
        slotKey,
        requestId: key,
        payloadHash,
        ownerUid: auth.currentUser.uid,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        status: record.status || "reserved",
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
        updatedBy: adminActor().email
    };
    const auditKey = db.ref("adminAudit").push().key;
    try {
        await db.ref().update({
            [`arLogs/${key}`]: saved,
            [`arSlotLocks/${slotKey}`]: key,
            [`adminAudit/${auditKey}`]: adminAuditEntry("create", "ar", key, null, saved)
        });
    } catch (error) {
        await lockRef.transaction((current) => current === key ? null : current).catch(() => {});
        throw error;
    }
    return key;
}

async function submitAdminRecordEdit(event) {
    event.preventDefault();
    if (!adminEditingRecord) return false;
    const { type, key, record: before, isNew } = adminEditingRecord;
    const form = event.currentTarget;
    const data = new FormData(form);
    let after;
    if (type === "visit") {
        after = {
            ...before,
            date: data.get("date"),
            time: data.get("time"),
            name: String(data.get("name") || "").trim(),
            gender: data.get("gender"),
            age: data.get("age"),
            purposes: data.getAll("purposes"),
            updatedAt: firebase.database.ServerValue.TIMESTAMP,
            updatedBy: adminActor().email
        };
        delete after._key;
        delete after._sortCreatedAt;
        delete after._legacyCreatedAt;
        if (!isValidDateKey(after.date) || getArTimeMinutes(after.time) === null || validateUsers([after]) || !after.purposes.length) {
            showMessage("방문 기록 입력값을 다시 확인해 주세요.");
            return false;
        }
    } else {
        const rows = [...form.querySelectorAll("[data-admin-ar-user]")];
        const users = rows.map((row) => ({
            name: row.querySelector('[name="userName"]').value.trim(),
            gender: row.querySelector('[name="userGender"]').value,
            age: row.querySelector('[name="userAge"]').value
        }));
        after = {
            ...before,
            date: data.get("date"),
            timeSlot: normalizeArTimeSlot(data.get("timeSlot")),
            slotKey: createSlotKey(data.get("date"), normalizeArTimeSlot(data.get("timeSlot"))),
            status: data.get("status"),
            users,
            updatedAt: firebase.database.ServerValue.TIMESTAMP,
            updatedBy: adminActor().email
        };
        delete after._key;
        delete after._sortCreatedAt;
        delete after._legacyCreatedAt;
        if (!isValidDateKey(after.date) || !after.timeSlot || validateUsers(users)) {
            showMessage("AR 예약 입력값을 다시 확인해 주세요.");
            return false;
        }
    }
    const auditKey = db.ref("adminAudit").push().key;
    try {
        if (isNew) await createAdminManualRecord(type, after);
        else if (type === "ar") await updateAdminArRecord(key, before, after, auditKey);
        else await db.ref().update({
            [`visitLogs/${key}`]: after,
            [`adminAudit/${auditKey}`]: adminAuditEntry("update", type, key, before, after)
        });
        invalidateAdminStatsCache(type);
        closeAdminRecordModal();
        await Promise.all([loadAdminLogPage(type, { reset: true }), reloadAdminStatistics({ forceTypes: [type] })]);
        showMessage(isNew ? "현장 기록을 수동 등록했습니다." : "기록을 수정하고 변경 이력에 저장했습니다.", "success");
        return true;
    } catch (error) {
        logError("admin-record-update", error);
        showMessage(error?.code === "SLOT_TAKEN" ? "선택한 AR 시간대에 이미 예약이 있습니다." : "기록을 수정하지 못했습니다.");
        return false;
    }
}

async function moveAdminRecordToTrash(type, key) {
    if (!isAdminUser || !["visit", "ar"].includes(type) || !key) return false;
    const record = await getAdminRecord(type, key);
    if (!record) return false;
    if (!window.confirm(`${type === "visit" ? "방문 기록" : "AR 예약"}을 휴지통으로 이동하시겠습니까?\n\n${adminRecordLabel(type, record)} · ${adminRecordSummary(type, record)}\n\n휴지통에서 다시 복구할 수 있습니다.`)) return false;
    const cleanRecord = { ...record };
    delete cleanRecord._key;
    delete cleanRecord._sortCreatedAt;
    delete cleanRecord._legacyCreatedAt;
    const trashKey = `${type}_${key}`.replace(/[.#$\[\]\/]/g, "-");
    const auditKey = db.ref("adminAudit").push().key;
    const actor = adminActor();
    const updates = {
        [`${type === "visit" ? "visitLogs" : "arLogs"}/${key}`]: null,
        [`adminTrash/${trashKey}`]: {
            type,
            originalKey: key,
            record: cleanRecord,
            deletedAt: firebase.database.ServerValue.TIMESTAMP,
            expiresAt: Date.now() + ADMIN_TRASH_RETENTION_MS,
            deletedBy: actor.email
        },
        [`adminAudit/${auditKey}`]: adminAuditEntry("delete", type, key, cleanRecord, null)
    };
    if (type === "ar") updates[`arSlotLocks/${cleanRecord.slotKey || createSlotKey(cleanRecord.date, cleanRecord.timeSlot)}`] = null;
    if (cleanRecord.requestId) updates[`requestClaims/${cleanRecord.requestId}`] = null;
    try {
        await db.ref().update(updates);
        invalidateAdminStatsCache(type);
        if (type === "visit") invalidateAdminLegacyVisitCache();
        await Promise.all([loadAdminLogPage(type, { reset: true }), reloadAdminStatistics({ forceTypes: [type] }), loadAdminTrash()]);
        showMessage("휴지통으로 이동했습니다. 필요하면 휴지통에서 복구할 수 있습니다.", "success");
        return true;
    } catch (error) {
        logError("admin-record-trash", error);
        showMessage("기록을 휴지통으로 이동하지 못했습니다.");
        return false;
    }
}

async function loadAdminTrash() {
    const target = document.getElementById("admin-trash-list");
    if (!target || !isAdminUser) return false;
    target.innerHTML = '<p class="admin-inline-status">휴지통을 불러오는 중입니다…</p>';
    try {
        const snap = await db.ref("adminTrash").orderByChild("deletedAt").limitToLast(100).once("value");
        const items = [];
        snap.forEach((child) => items.push({ _key: child.key, ...child.val() }));
        items.reverse();
        target.innerHTML = items.length ? items.map((item) => `
            <article class="admin-record-card"><div class="admin-record-card-main"><strong>${item.type === "visit" ? "방문" : "AR"} · ${escapeHtml(adminRecordLabel(item.type, item.record))}</strong><span>${escapeHtml(adminRecordSummary(item.type, item.record))}<br>${escapeHtml(item.deletedBy || "-")} · ${new Date(item.deletedAt).toLocaleString("ko-KR")}</span></div><div class="admin-record-card-actions"><button type="button" class="admin-secondary-button" onclick="restoreAdminTrashRecord('${escapeHtml(item._key)}')">복구</button></div></article>`).join("") : '<p class="admin-inline-status">휴지통이 비어 있습니다.</p>';
        return true;
    } catch (error) {
        target.innerHTML = '<p class="admin-inline-status">휴지통을 불러오지 못했습니다.</p>';
        return false;
    }
}

async function restoreAdminTrashRecord(trashKey) {
    const snap = await db.ref(`adminTrash/${trashKey}`).once("value");
    const item = snap.val();
    if (!item?.record || !item.originalKey) return false;
    const node = item.type === "visit" ? "visitLogs" : "arLogs";
    const existing = await db.ref(`${node}/${item.originalKey}`).once("value");
    if (existing.exists()) {
        showMessage("같은 키의 현재 기록이 있어 복구할 수 없습니다.");
        return false;
    }
    const auditKey = db.ref("adminAudit").push().key;
    const updates = {
        [`${node}/${item.originalKey}`]: item.record,
        [`adminTrash/${trashKey}`]: null,
        [`adminAudit/${auditKey}`]: adminAuditEntry("restore", item.type, item.originalKey, null, item.record)
    };
    if (item.type === "ar") {
        const slotKey = item.record.slotKey || createSlotKey(item.record.date, item.record.timeSlot);
        const lockSnap = await db.ref(`arSlotLocks/${slotKey}`).once("value");
        if (lockSnap.exists()) {
            showMessage("해당 시간대에 다른 예약이 있어 복구할 수 없습니다.");
            return false;
        }
        updates[`arSlotLocks/${slotKey}`] = item.record.requestId || item.originalKey;
    }
    await db.ref().update(updates);
    invalidateAdminStatsCache(item.type);
    await Promise.all([loadAdminTrash(), loadAdminLogPage(item.type, { reset: true }), reloadAdminStatistics({ forceTypes: [item.type] })]);
    showMessage("기록을 복구했습니다.", "success");
    return true;
}

async function loadAdminAuditLog() {
    const target = document.getElementById("admin-audit-list");
    if (!target || !isAdminUser) return false;
    target.innerHTML = '<p class="admin-inline-status">변경 이력을 불러오는 중입니다…</p>';
    try {
        const snap = await db.ref("adminAudit").orderByChild("changedAt").limitToLast(100).once("value");
        const items = [];
        snap.forEach((child) => items.push(child.val()));
        items.reverse();
        const actions = { create: "수동 등록", update: "수정", delete: "삭제", restore: "복구", operation: "AR 운영 설정", special_day: "특별 운영일 설정", backup_restore: "백업 복원", anonymize: "개인정보 익명화" };
        target.innerHTML = items.length ? items.map((item) => `<article class="admin-record-card"><div class="admin-record-card-main"><strong>${escapeHtml(actions[item.action] || item.action)} · ${item.recordType === "visit" ? "방문" : item.recordType === "ar" ? "AR" : "설정"}</strong><span>${escapeHtml(item.actorEmail || "-")} · ${new Date(item.changedAt).toLocaleString("ko-KR")}<br>기록 키: ${escapeHtml(item.recordKey || "-")}</span></div></article>`).join("") : '<p class="admin-inline-status">변경 이력이 없습니다.</p>';
        return true;
    } catch (error) {
        target.innerHTML = '<p class="admin-inline-status">변경 이력을 불러오지 못했습니다.</p>';
        return false;
    }
}

function parseBlockedArSlots(value) {
    return [...new Set(String(value || "").split(",").map((item) => normalizeArTimeSlot(item)).filter(Boolean))].sort();
}

async function saveAdminArOperation() {
    const date = document.getElementById("admin-ar-operation-date")?.value;
    const closed = document.getElementById("admin-ar-operation-closed")?.checked === true;
    const start = normalizeArTimeSlot(document.getElementById("admin-ar-operation-start")?.value);
    const end = normalizeArTimeSlot(document.getElementById("admin-ar-operation-end")?.value);
    const blockedSlots = parseBlockedArSlots(document.getElementById("admin-ar-operation-blocked")?.value);
    if (!isValidDateKey(date) || (!closed && (!start || !end || getArTimeMinutes(start) >= getArTimeMinutes(end)))) {
        showMessage("AR 운영 날짜와 시간을 확인해 주세요.");
        return false;
    }
    const value = { closed, start, end, blockedSlots, updatedBy: adminActor().email, updatedAt: firebase.database.ServerValue.TIMESTAMP };
    const auditKey = db.ref("adminAudit").push().key;
    await db.ref().update({
        [`arOperations/${date}`]: value,
        [`adminAudit/${auditKey}`]: adminAuditEntry("operation", "settings", date, arOperationsState[date] || null, value)
    });
    showMessage("AR 운영 설정을 저장했습니다.", "success");
    loadAdminArOperations();
    return true;
}

function renderAdminArOperations() {
    const target = document.getElementById("admin-ar-operation-list");
    if (!target) return;
    const items = Object.entries(arOperationsState || {}).sort(([a], [b]) => a.localeCompare(b));
    target.innerHTML = items.length ? items.map(([date, value]) => `<article class="admin-record-card"><div class="admin-record-card-main"><strong>${escapeHtml(date)} · ${value.closed ? "휴관" : `${escapeHtml(value.start)}~${escapeHtml(value.end)}`}</strong><span>${value.closed ? "예약 전체 차단" : `차단: ${toArray(value.blockedSlots).join(", ") || "없음"}`}</span></div><div class="admin-record-card-actions"><button type="button" class="admin-secondary-button" onclick="selectAdminArOperation('${escapeHtml(date)}')">수정</button><button type="button" class="admin-secondary-button admin-danger-button" onclick="deleteAdminArOperation('${escapeHtml(date)}')">삭제</button></div></article>`).join("") : '<p class="admin-inline-status">등록된 특별 운영일이 없습니다.</p>';
}

async function loadAdminArOperations() {
    const snap = await db.ref("arOperations").once("value");
    arOperationsState = snap.val() || {};
    renderAdminArOperations();
    generateTimeSlots();
}

function selectAdminArOperation(date) {
    const value = arOperationsState[date] || {};
    document.getElementById("admin-ar-operation-date").value = date;
    document.getElementById("admin-ar-operation-closed").checked = value.closed === true;
    document.getElementById("admin-ar-operation-start").value = value.start || "10:00";
    document.getElementById("admin-ar-operation-end").value = value.end || "20:30";
    document.getElementById("admin-ar-operation-blocked").value = toArray(value.blockedSlots).join(", ");
}

async function deleteAdminArOperation(date) {
    if (!window.confirm(`${date} 특별 운영 설정을 삭제하시겠습니까?`)) return false;
    const auditKey = db.ref("adminAudit").push().key;
    await db.ref().update({
        [`arOperations/${date}`]: null,
        [`adminAudit/${auditKey}`]: adminAuditEntry("operation", "settings", date, arOperationsState[date] || null, null)
    });
    showMessage("특별 운영 설정을 삭제했습니다.", "success");
    return loadAdminArOperations();
}

async function exportAdminBackup() {
    if (!isAdminUser) return false;
    showMessage("전체 운영 데이터를 백업하는 중입니다.", "info");
    try {
        const snapshots = await Promise.all(ADMIN_BACKUP_NODES.map(async (node) => {
            try {
                return await db.ref(node).once("value");
            } catch (error) {
                error.backupNode = node;
                throw error;
            }
        }));
        const data = { schemaVersion: 1, exportedAt: new Date().toISOString(), project: "nchm-visiter", data: {} };
        ADMIN_BACKUP_NODES.forEach((node, index) => { data.data[node] = snapshots[index].val(); });
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = `nchm-backup-${formatLocalDate()}.json`;
        link.hidden = true;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showMessage("백업 파일을 다운로드했습니다.", "success");
        return true;
    } catch (error) {
        logError("admin-backup", error);
        const nodeLabel = {
            visitLogs: "방문 기록",
            arLogs: "AR 예약 기록",
            arSlotLocks: "AR 예약 시간",
            tvSettings: "TV 설정",
            tvContent: "TV 공지·이벤트",
            arOperations: "AR 운영일",
            specialDaySettings: "특별 운영일",
            adminSettings: "관리자 설정",
            adminTrash: "휴지통",
            adminAudit: "변경 이력"
        }[error?.backupNode];
        showMessage(nodeLabel
            ? `${nodeLabel} 자료를 읽지 못해 백업을 만들 수 없습니다. 관리자 권한과 Firebase 규칙을 확인해 주세요.`
            : "백업 파일을 만들지 못했습니다.");
        return false;
    }
}

async function importAdminBackup(file) {
    if (!isAdminUser || !file) return false;
    try {
        const parsed = JSON.parse(await file.text());
        if (parsed?.schemaVersion !== 1 || parsed?.project !== "nchm-visiter" || !parsed.data) throw new Error("INVALID_BACKUP");
        const nodes = ADMIN_BACKUP_NODES.filter((node) => Object.prototype.hasOwnProperty.call(parsed.data, node));
        if (!nodes.length || !window.confirm(`백업의 ${nodes.length}개 데이터 영역을 현재 데이터와 병합 복원합니다. 계속하시겠습니까?`)) return false;
        const updates = {};
        nodes.forEach((node) => {
            const value = parsed.data[node];
            if (value && typeof value === "object") {
                Object.entries(value).forEach(([key, item]) => { updates[`${node}/${key}`] = item; });
            }
        });
        const auditKey = db.ref("adminAudit").push().key;
        updates[`adminAudit/${auditKey}`] = adminAuditEntry("backup_restore", "settings", file.name, null, { nodes });
        await db.ref().update(updates);
        invalidateAdminStatsCache();
        await reloadAdminPages({ force: true });
        showMessage("백업 데이터를 병합 복원했습니다.", "success");
        return true;
    } catch (error) {
        logError("admin-backup-restore", error);
        showMessage("올바른 NCHM 백업 파일인지 확인해 주세요.");
        return false;
    } finally {
        const input = document.getElementById("admin-backup-file");
        if (input) input.value = "";
    }
}

async function loadPrivacyRetentionSetting() {
    if (!isAdminUser) return false;
    const snapshot = await db.ref("adminSettings/privacy").once("value");
    const value = snapshot.val() || {};
    const select = document.getElementById("admin-privacy-retention-days");
    const status = document.getElementById("admin-privacy-status");
    if (select) select.value = String(Number(value.retentionDays) >= 0 ? value.retentionDays : 0);
    if (status) status.textContent = value.lastRunAt
        ? `마지막 자동 처리: ${new Date(value.lastRunAt).toLocaleString("ko-KR")}`
        : value.retentionDays === undefined ? "보관기간을 저장하면 자동 익명화가 시작됩니다." : "아직 자동 익명화를 실행하지 않았습니다.";
    return value;
}

async function savePrivacyRetentionSetting() {
    const retentionDays = Number(document.getElementById("admin-privacy-retention-days")?.value);
    if (![0, 90, 180, 365, 730].includes(retentionDays)) return false;
    await db.ref("adminSettings/privacy").update({
        retentionDays,
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
        updatedBy: adminActor().email
    });
    showMessage(retentionDays ? `${retentionDays}일 보관 후 자동 익명화하도록 저장했습니다.` : "자동 익명화를 사용하지 않도록 저장했습니다.", "success");
    return runPrivacyRetention(true);
}

async function runPrivacyRetention(force = false) {
    if (!isAdminUser) return false;
    try {
        const privacy = await loadPrivacyRetentionSetting();
        if (privacy.retentionDays === undefined) return true;
        const retentionDays = Number(privacy.retentionDays);
        if (!retentionDays) return true;
        const today = formatLocalDate();
        if (!force && privacy.lastRunAt && formatLocalDate(new Date(privacy.lastRunAt)) === today) return true;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - retentionDays);
        const cutoffDate = formatLocalDate(cutoff);
        const requestVersion = ++adminSearchVersion;
        const [visits, ars] = await Promise.all([
            loadAdminRecordsForSearch("visit", "1900-01-01", cutoffDate, requestVersion),
            loadAdminRecordsForSearch("ar", "1900-01-01", cutoffDate, requestVersion)
        ]);
        if (!visits || !ars) return false;
        const updates = {};
        let anonymizedPeople = 0;
        visits.forEach((record) => {
            if (record.name && record.name !== "익명") {
                updates[`visitLogs/${record._key}/name`] = "익명";
                anonymizedPeople += 1;
            }
        });
        ars.forEach((record) => {
            toArray(record.users).forEach((user, index) => {
                if (user?.name && user.name !== "익명") {
                    updates[`arLogs/${record._key}/users/${index}/name`] = "익명";
                    anonymizedPeople += 1;
                }
            });
        });
        const paths = Object.entries(updates);
        for (let index = 0; index < paths.length; index += 300) {
            await db.ref().update(Object.fromEntries(paths.slice(index, index + 300)));
        }
        const auditKey = db.ref("adminAudit").push().key;
        await db.ref().update({
            "adminSettings/privacy/lastRunAt": firebase.database.ServerValue.TIMESTAMP,
            "adminSettings/privacy/lastRunBy": adminActor().email,
            [`adminAudit/${auditKey}`]: adminAuditEntry("anonymize", "privacy", cutoffDate, null, { anonymizedPeople, retentionDays })
        });
        const status = document.getElementById("admin-privacy-status");
        if (status) status.textContent = `${cutoffDate} 이전 이름 ${anonymizedPeople.toLocaleString("ko-KR")}건 처리 완료`;
        if (anonymizedPeople) {
            invalidateAdminStatsCache();
            loadAdminLogPage("visit", { reset: true });
            loadAdminLogPage("ar", { reset: true });
        }
        return true;
    } catch (error) {
        logError("privacy-retention", error);
        const status = document.getElementById("admin-privacy-status");
        if (status) status.textContent = "자동 익명화 처리에 실패했습니다.";
        return false;
    }
}

function initializeAdminOperationsUi() {
    const today = formatLocalDate();
    const monthStart = `${today.slice(0, 7)}-01`;
    const defaults = {
        "admin-search-start": monthStart,
        "admin-search-end": today,
        "admin-ar-operation-date": today
    };
    Object.entries(defaults).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element && !element.value) element.value = value;
    });
    const ageSelect = document.getElementById("admin-search-age");
    const purposeSelect = document.getElementById("admin-search-purpose");
    if (ageSelect && ageSelect.options.length === 1) AGE_GROUPS.forEach((age) => ageSelect.add(new Option(age, age)));
    if (purposeSelect && purposeSelect.options.length === 1) PURPOSES.forEach((purpose) => purposeSelect.add(new Option(purpose, purpose)));
    if (typeof initializeAdminSpecialDayUi === "function") initializeAdminSpecialDayUi();
    if (isAdminUser) loadPrivacyRetentionSetting();
}
