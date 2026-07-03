window.NCHM = window.NCHM || {};

(function registerReservation(namespace) {
    const { refs, auth, serverTimestamp } = namespace.firebase;
    const { state, config, utils, validation } = namespace;

    function createArUserCard() {
        const div = document.createElement("div");
        div.className = "ar-user-card card-shadow animate-fadeIn";
        div.innerHTML = `
            <div class="flex flex-1 gap-3">
                <div class="flex-1"><input type="text" maxlength="${config.limits.maxNameLength}" placeholder="이름" class="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center text-base font-bold outline-none focus:border-indigo-400"></div>
                <div class="flex bg-slate-100 p-1.5 rounded-2xl gap-1 w-32 shrink-0">
                    <button type="button" class="flex-1 py-2.5 bg-white rounded-xl text-sm font-bold shadow-sm" onclick="selectGender(this)">남</button>
                    <button type="button" class="flex-1 py-2.5 text-sm font-bold text-slate-400" onclick="selectGender(this)">여</button>
                </div>
            </div>
            <div class="flex gap-3 items-center">
                <select class="flex-1 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold outline-none focus:border-indigo-400">
                    <option value="" disabled selected>나이 선택</option>
                    ${config.ageGroups.map((age) => `<option>${utils.escapeHtml(age)}</option>`).join("")}
                </select>
                <button type="button" onclick="this.closest('.ar-user-card').remove()" class="text-slate-300 hover:text-red-500 transition-colors p-2 shrink-0">
                    <i data-lucide="minus-circle" class="w-7 h-7"></i>
                </button>
            </div>
        `;

        return div;
    }

    function addUserForm() {
        const container = document.getElementById("ar-user-container");
        if (!container) return;

        container.appendChild(createArUserCard());
        utils.refreshIcons();
    }

    function collectReservationUsers() {
        return Array.from(document.querySelectorAll("#ar-user-container .ar-user-card")).map((card) => {
            const selectedGenderButton = Array.from(card.querySelectorAll("button")).find((button) => button.classList.contains("bg-white"));
            return {
                name: card.querySelector("input")?.value.trim() || "",
                gender: selectedGenderButton ? selectedGenderButton.innerText.trim() : "",
                age: card.querySelector("select")?.value || ""
            };
        });
    }

    function resetReservationForm() {
        const container = document.getElementById("ar-user-container");
        if (container) {
            container.innerHTML = "";
        }

        document.querySelectorAll(".time-slot-btn").forEach((button) => button.classList.remove("active"));
        addUserForm();
    }

    function getScheduleForDate(date = new Date()) {
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        return isWeekend ? config.schedule.weekend : config.schedule.weekday;
    }

    function getRenderedReservedSlots(date) {
        const dateString = utils.formatLocalDate(date);
        return state.arLogsToday
            .filter((log) => log.date === dateString)
            .map((log) => log.timeSlot);
    }

    function addTimeButton(container, timeString, endTimeString, isReserved) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `time-slot-btn choice-btn p-4 rounded-2xl flex flex-col items-center ${isReserved ? "disabled" : ""}`;

        if (isReserved) {
            button.innerHTML = `<span class="text-lg font-black">${timeString}</span><span class="text-[10px] text-red-500 font-bold">예약 완료</span>`;
        } else {
            button.innerHTML = `
                <span class="text-lg font-black">${timeString}</span>
                <span class="text-[10px] text-slate-400">~ ${endTimeString}</span>
                <div class="check-badge"><i data-lucide="check" class="w-3 h-3"></i></div>
            `;
            button.onclick = () => namespace.ui.selectSingleChoice(button, "time-slot-btn");
        }

        container.appendChild(button);
    }

    function generateTimeSlots() {
        const container = document.getElementById("time-container");
        const indicator = document.getElementById("ar-day-indicator");
        if (!container || !indicator) return;

        container.innerHTML = "";

        const now = new Date();
        const schedule = getScheduleForDate(now);
        const reservedSlots = getRenderedReservedSlots(now);
        const isWeekend = schedule === config.schedule.weekend;

        indicator.innerText = isWeekend ? "🗓️ 주말 운영 (10:00~17:30)" : "🗓️ 평일 운영 (10:00~19:30)";
        indicator.className = isWeekend
            ? "mb-4 inline-block px-4 py-1.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700"
            : "mb-4 inline-block px-4 py-1.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700";

        for (let hour = schedule.startHour; hour <= schedule.endHour; hour += 1) {
            if (schedule.excludeHours.includes(hour)) continue;

            ["00", "30"].forEach((minute) => {
                const timeString = `${String(hour).padStart(2, "0")}:${minute}`;
                if (schedule.excludeSlots.includes(timeString)) return;

                const endHour = minute === "30" ? hour + 1 : hour;
                const endMinute = minute === "30" ? "00" : "30";
                const endTimeString = `${String(endHour).padStart(2, "0")}:${endMinute}`;
                addTimeButton(container, timeString, endTimeString, reservedSlots.includes(timeString));
            });
        }

        utils.refreshIcons();
    }

    function setArLogsToday(snapshot) {
        state.arLogsToday = [];
        snapshot.forEach((child) => {
            state.arLogsToday.push({ _key: child.key, ...child.val() });
        });

        if (!document.getElementById("section-ar")?.classList.contains("hidden")) {
            generateTimeSlots();
        }
    }

    function subscribeArLogsToday() {
        const today = utils.formatLocalDate(new Date());
        if (state.subscriptions.arLogsTodayQuery) {
            state.subscriptions.arLogsTodayQuery.off();
        }

        const query = refs.arLogs.orderByChild("date").equalTo(today);
        state.subscriptions.arLogsTodayQuery = query;
        query.on("value", setArLogsToday, (error) => utils.logError("subscribeArLogsToday", error));
    }

    function subscribeArLogsAll() {
        if (state.subscriptions.arLogsTodayQuery) {
            state.subscriptions.arLogsTodayQuery.off();
            state.subscriptions.arLogsTodayQuery = null;
        }

        if (state.subscriptions.arLogsAllBound) {
            refs.arLogs.off("value", state.subscriptions.arLogsAllBound);
            state.subscriptions.arLogsAllBound = null;
        }

        const onValue = (snapshot) => {
            state.arLogs = [];
            snapshot.forEach((child) => {
                state.arLogs.push({ _key: child.key, ...child.val() });
            });
            namespace.statistics.updateAdminDashboard();
        };

        state.subscriptions.arLogsAllBound = onValue;
        refs.arLogs.on("value", onValue, (error) => utils.logError("subscribeArLogsAll", error));
    }

    function unsubscribeArLogsAll() {
        if (state.subscriptions.arLogsAllBound) {
            refs.arLogs.off("value", state.subscriptions.arLogsAllBound);
            state.subscriptions.arLogsAllBound = null;
        }

        state.arLogs = [];
    }

    async function cleanupExpiredSlotLocks() {
        try {
            const snapshot = await refs.arSlotLocks.orderByChild("expiresAt").endAt(Date.now()).once("value");
            const updates = {};

            snapshot.forEach((child) => {
                const lock = child.val();
                if (utils.isExpiredLock(lock)) {
                    // Cloud Functions가 없는 환경을 고려해 만료 락을 클라이언트에서 기회주의적으로 정리합니다.
                    updates[`${config.dbPaths.arSlotLocks}/${child.key}`] = null;
                }
            });

            if (Object.keys(updates).length > 0) {
                await refs.root.update(updates);
            }
        } catch (error) {
            utils.logError("cleanupExpiredSlotLocks", error);
        }
    }

    async function claimSlotLock({ slotId, date, timeSlot, reservationId, clientRequestId }) {
        const lockRef = refs.arSlotLocks.child(slotId);

        const result = await utils.withRetry(
            () => lockRef.transaction((currentLock) => {
                const now = Date.now();

                if (currentLock) {
                    const sameRequest = currentLock.clientRequestId === clientRequestId && currentLock.reservationId === reservationId;
                    if (sameRequest) {
                        return currentLock;
                    }

                    if (!utils.isExpiredLock(currentLock, now)) {
                        return;
                    }
                }

                return {
                    slotId,
                    date,
                    timeSlot,
                    reservationId,
                    clientRequestId,
                    ownerUid: auth.currentUser?.uid || "",
                    status: "pending",
                    claimedAt: now,
                    expiresAt: utils.getLockExpiresAt(now)
                };
            }),
            { shouldRetry: () => true }
        );

        if (!result.committed) {
            const error = new Error("SLOT_TAKEN");
            error.code = "SLOT_TAKEN";
            throw error;
        }

        return result.snapshot.val();
    }

    async function releaseSlotLock(slotId, reservationId, clientRequestId) {
        try {
            await refs.arSlotLocks.child(slotId).transaction((currentLock) => {
                if (!currentLock) return null;
                const sameReservation = currentLock.reservationId === reservationId && currentLock.clientRequestId === clientRequestId;
                return sameReservation ? null : currentLock;
            });
        } catch (error) {
            utils.logError("releaseSlotLock", error);
        }
    }

    async function ensureReservationIdempotency(clientRequestId) {
        const snapshot = await refs.arRequestLedger.child(clientRequestId).once("value");
        return snapshot.exists() ? snapshot.val() : null;
    }

    async function persistReservationBundle({ reservationId, clientRequestId, slotId, date, timeSlot, users }) {
        const updates = {};

        updates[`${config.dbPaths.arLogs}/${reservationId}`] = {
            reservationId,
            clientRequestId,
            slotId,
            date,
            timeSlot,
            users,
            status: "confirmed",
            createdAt: serverTimestamp,
            updatedAt: serverTimestamp
        };

        updates[`${config.dbPaths.arSlotLocks}/${slotId}`] = {
            reservationId,
            clientRequestId,
            slotId,
            date,
            timeSlot,
            ownerUid: auth.currentUser?.uid || "",
            status: "confirmed",
            expiresAt: utils.getLockExpiresAt(),
            confirmedAt: serverTimestamp,
            updatedAt: serverTimestamp
        };

        updates[`${config.dbPaths.arRequestLedger}/${clientRequestId}`] = {
            reservationId,
            slotId,
            date,
            timeSlot,
            status: "confirmed",
            createdAt: serverTimestamp,
            updatedAt: serverTimestamp
        };

        // 예약 본문, 락, idempotency ledger를 하나의 update로 저장해 정합성을 최대한 보장합니다.
        await utils.withRetry(() => refs.root.update(updates), { shouldRetry: () => true });
    }

    async function createReservation({ date, timeSlot, users }) {
        const reservationId = refs.arLogs.push().key;
        const clientRequestId = utils.generateClientRequestId();
        const slotId = utils.makeSlotId(date, timeSlot);

        const existingLedger = await ensureReservationIdempotency(clientRequestId);
        if (existingLedger?.reservationId) {
            return existingLedger;
        }

        await claimSlotLock({ slotId, date, timeSlot, reservationId, clientRequestId });

        try {
            await persistReservationBundle({ reservationId, clientRequestId, slotId, date, timeSlot, users });
            return { reservationId, clientRequestId, slotId };
        } catch (error) {
            await releaseSlotLock(slotId, reservationId, clientRequestId);
            throw error;
        }
    }

    async function submitReservation() {
        if (state.isSubmittingAr) return;

        const timeSlot = document.querySelector(".time-slot-btn.active")?.querySelector("span")?.innerText || "";
        const users = collectReservationUsers();
        const date = utils.formatLocalDate(new Date());

        if (!validation.isValidTimeSlot(timeSlot)) {
            utils.showMessage("시간을 선택해 주세요!");
            return;
        }

        if (!validation.isValidUserList(users)) {
            utils.showMessage("이름은 한글/영문/숫자 10자 이내로, 나이와 성별은 모두 선택해 주세요!");
            return;
        }

        state.isSubmittingAr = true;
        const submitButton = document.querySelector("#section-ar .submit-btn");
        if (submitButton) submitButton.disabled = true;

        try {
            await cleanupExpiredSlotLocks();
            await createReservation({ date, timeSlot, users });
            utils.showMessage("AR 예약이 완료되었습니다! ✓", "success");
            resetReservationForm();
            generateTimeSlots();
            namespace.ui.switchTab("visit");
        } catch (error) {
            utils.logError("submitReservation", error);
            if (error && error.code === "SLOT_TAKEN") {
                utils.showMessage("방금 다른 이용자가 같은 시간을 먼저 예약했습니다. 다른 시간을 선택해 주세요.");
                generateTimeSlots();
            } else {
                utils.showMessage(config.messages.genericSaveError);
            }
        } finally {
            state.isSubmittingAr = false;
            if (submitButton) submitButton.disabled = false;
        }
    }

    async function deleteReservation(logKey) {
        const log = state.arLogs.find((item) => item._key === logKey);
        if (!log) {
            utils.showMessage("이미 삭제된 예약입니다.", "info");
            return;
        }

        const slotId = log.slotId || utils.makeSlotId(log.date, log.timeSlot);
        const auditLogId = refs.auditLogs.push().key;
        const reservationId = log.reservationId || logKey;
        const requestId = log.clientRequestId || "";
        const actorEmail = utils.getCurrentUserEmail();
        const updates = {};

        updates[`${config.dbPaths.arLogs}/${logKey}`] = null;
        updates[`${config.dbPaths.arSlotLocks}/${slotId}`] = null;
        if (requestId) {
            updates[`${config.dbPaths.arRequestLedger}/${requestId}`] = null;
        }
        updates[`${config.dbPaths.auditLogs}/${auditLogId}`] = {
            action: "DELETE_AR_RESERVATION",
            actorEmail,
            reservationId,
            slotId,
            targetKey: logKey,
            snapshot: log,
            createdAt: serverTimestamp
        };

        try {
            // 관리자 삭제 시 예약/락/ledger/audit를 하나의 update로 묶어 삭제 원자성을 확보합니다.
            await refs.root.update(updates);
            utils.showMessage("삭제되었습니다.", "info");
        } catch (error) {
            utils.logError("deleteReservation", error);
            utils.showMessage(config.messages.genericDeleteError);
        }
    }

    namespace.reservation = {
        addUserForm,
        generateTimeSlots,
        subscribeArLogsToday,
        subscribeArLogsAll,
        unsubscribeArLogsAll,
        submitReservation,
        deleteReservation,
        cleanupExpiredSlotLocks
    };
})(window.NCHM);
