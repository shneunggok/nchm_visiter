/**
 * ============================================================================
 * admin-tool / components / modal.js
 * ============================================================================
 * 
 * Self-rendering admin password modal component.
 * ============================================================================
 */

window.AT_Modal = {

    _dom: {},

    render: function(container) {
        var html = '';
        html += '<div id="at-password-modal" class="at-modal-overlay at-hidden">';
        html += '<div class="at-modal-content">';
        html += '<h3 class="at-modal-title">관리자 인증</h3>';
        html += '<input type="password" id="at-admin-password-input" maxlength="64" placeholder="****" class="at-password-input">';
        html += '<div class="at-modal-actions">';
        html += '<button id="at-modal-cancel-btn" class="at-modal-btn at-modal-btn-cancel">취소</button>';
        html += '<button id="at-modal-confirm-btn" class="at-modal-btn at-modal-btn-confirm">확인</button>';
        html += '</div>';
        html += '</div>';
        html += '</div>';

        container.innerHTML = html;

        this._dom = {
            overlay: document.getElementById("at-password-modal"),
            input: document.getElementById("at-admin-password-input"),
            confirmBtn: document.getElementById("at-modal-confirm-btn"),
            cancelBtn: document.getElementById("at-modal-cancel-btn")
        };

        this._wireEvents();
    },

    _wireEvents: function() {
        var self = this;

        if (this._dom.cancelBtn) {
            this._dom.cancelBtn.addEventListener("click", function() {
                self.close();
            });
        }

        if (this._dom.confirmBtn) {
            this._dom.confirmBtn.addEventListener("click", function() {
                self._verify();
            });
        }

        if (this._dom.input) {
            this._dom.input.addEventListener("keyup", function(e) {
                if (e.key === "Enter") {
                    self._verify();
                }
            });
        }
    },

    open: function() {
        if (this._dom.overlay) {
            this._dom.overlay.classList.remove("at-hidden");
        }
        if (this._dom.input) {
            this._dom.input.value = "";
            this._dom.input.focus();
        }
    },

    close: function() {
        if (this._dom.overlay) {
            this._dom.overlay.classList.add("at-hidden");
        }
    },

    _verify: function() {
        var password = this._dom.input ? this._dom.input.value : "";
        if (!password) {
            this._showMsg("비밀번호를 입력해 주세요.");
            return;
        }

        var adminEmail = window.ADMIN_TOOL.auth.adminEmail;
        var auth = window.AT_auth;

        var self = this;

        auth.signInWithEmailAndPassword(adminEmail, password)
            .then(function(credential) {
                return credential.user.getIdTokenResult();
            })
            .then(function(tokenResult) {
                if (tokenResult.claims.email !== adminEmail) {
                    auth.signOut();
                    self._showMsg("관리자 권한이 없는 계정입니다.");
                    return;
                }
                self.close();
                if (window.AT_Auth) {
                    window.AT_Auth.onLoginSuccess();
                }
            })
            .catch(function(err) {
                if (window.AT_Utils) {
                    window.AT_Utils.logError("verifyAdminPassword", err);
                }
                self._showMsg("비밀번호가 틀렸습니다.");
                if (self._dom.input) {
                    self._dom.input.value = "";
                    self._dom.input.focus();
                }
            });
    },

    _showMsg: function(msg) {
        if (window.AT_Utils) {
            window.AT_Utils.showMessage(msg);
        }
    }
};


