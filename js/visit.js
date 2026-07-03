window.NCHM = window.NCHM || {};

(function registerVisit(namespace) {
    const { refs, serverTimestamp } = namespace.firebase;
    const { state, config, utils, validation } = namespace;

    function focusFirstVisitInput() {
        const nameInput = document.querySelector("#visit-user-container input");
        if (!nameInput) return;

        requestAnimationFrame(() => {
            nameInput.focus();
        });
    }

    function createVisitUserCard() {
        const div = document.createElement("div");

        div.className = "ar-user-card visit-user-card card-shadow animate-fadeIn";
        div.innerHTML = `
            <div class="visit-user-card-row">
                <input type="text" maxlength="${config.limits.maxNameLength}" placeholder="이름" class="visit-name-input visit-user-name w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center text-base font-bold outline-none focus:border-blue-400">
                <div class="visit-user-gender flex bg-slate-100 p-1.5 rounded-2xl gap-1 shrink-0">
                    <button type="button" class="flex-1 py-2.5 bg-white rounded-xl text-sm font-bold shadow-sm" onclick="selectGender(this)">남</button>
                    <button type="button" class="flex-1 py-2.5 text-sm font-bold text-slate-400" onclick="selectGender(this)">여</button>
                </div>
                <select class="visit-user-age flex-1 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold outline-none focus:border-blue-400">
                    <option value="" disabled selected>나이 선택</option>
                    ${config.ageGroups.map((age) => `<option>${utils.escapeHtml(age)}</option>`).join("")}
                </select>
            </div>
        `;

        return div;
    }

    function updateVisitCountControls() {
        const countDisplay = document.getElementById("visit-count-display");
        if (countDisplay) {
            countDisplay.innerText = String(state.visitCount);
        }

        const minusButton = document.getElementById("visit-count-minus");
        if (!minusButton) return;

        if (state.visitCount <= config.limits.minUsersPerSubmission) {
            minusButton.disabled = true;
            minusButton.classList.add("disabled");
        } else {
            minusButton.disabled = false;
            minusButton.classList.remove("disabled");
        }
    }

    function renderVisitUserForms() {
        const container = document.getElementById("visit-user-container");
        if (!container) return;

        container.innerHTML = "";
        for (let index = 0; index < state.visitCount; index += 1) {
            container.appendChild(createVisitUserCard());
        }

        updateVisitCountControls();
        utils.refreshIcons();
    }

    function changeVisitCount(delta) {
        const nextCount = state.visitCount + delta;
        if (nextCount < config.limits.minUsersPerSubmission || nextCount > config.limits.maxUsersPerSubmission) {
            return;
        }

        state.visitCount = nextCount;
        renderVisitUserForms();
        focusFirstVisitInput();
    }

    function collectVisitUsers() {
        return Array.from(document.querySelectorAll("#visit-user-container .ar-user-card")).map((card) => {
            const selectedGenderButton = Array.from(card.querySelectorAll("button")).find((button) => button.classList.contains("bg-white"));
            return {
                name: card.querySelector("input")?.value.trim() || "",
                gender: selectedGenderButton ? selectedGenderButton.innerText.trim() : "",
                age: card.querySelector("select")?.value || ""
            };
        });
    }

    function resetVisitForm() {
        state.visitCount = 1;
        renderVisitUserForms();
        document.querySelectorAll(".v-purpose").forEach((button) => button.classList.remove("active"));
        focusFirstVisitInput();
    }

    async function submitVisitRegistration() {
        if (state.isSubmittingVisit) return;

        const purposes = Array.from(document.querySelectorAll(".v-purpose.active")).map((button) => button.querySelector("span")?.innerText || "");
        const users = collectVisitUsers();

        if (!validation.isValidPurposeList(purposes)) {
            utils.showMessage("이용 목적을 선택해 주세요!");
            return;
        }

        if (!validation.isValidUserList(users)) {
            utils.showMessage("이름은 한글/영문/숫자 10자 이내로, 나이와 성별은 모두 선택해 주세요!");
            return;
        }

        state.isSubmittingVisit = true;
        const submitButton = document.querySelector("#section-visit .submit-btn");
        if (submitButton) submitButton.disabled = true;

        const now = new Date();
        const visitBatchId = utils.generateClientRequestId();
        const date = utils.formatLocalDate(now);
        const time = utils.formatLocalTime(now);
        const updates = {};

        users.forEach((user) => {
            const logKey = refs.visitLogs.push().key;
            updates[`${config.dbPaths.visitLogs}/${logKey}`] = {
                date,
                time,
                name: user.name,
                gender: user.gender,
                age: user.age,
                purposes,
                visitBatchId,
                createdAt: serverTimestamp,
                updatedAt: serverTimestamp
            };
        });

        try {
            // 방문자 여러 명 저장을 한 번의 multi-path update로 묶어 부분 성공을 막습니다.
            await utils.withRetry(() => refs.root.update(updates), {
                shouldRetry: () => true
            });

            utils.showMessage(`${users.length}명 방문 등록이 완료되었습니다! ✓`, "success");
            resetVisitForm();
        } catch (error) {
            utils.logError("submitVisitRegistration", error);
            utils.showMessage(config.messages.genericSaveError);
        } finally {
            state.isSubmittingVisit = false;
            if (submitButton) submitButton.disabled = false;
        }
    }

    namespace.visit = {
        focusFirstVisitInput,
        renderVisitUserForms,
        changeVisitCount,
        collectVisitUsers,
        resetVisitForm,
        submitVisitRegistration
    };
})(window.NCHM);
