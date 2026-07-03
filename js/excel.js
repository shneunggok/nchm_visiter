window.NCHM = window.NCHM || {};

(function registerExcel(namespace) {
    const { state, utils } = namespace;

    function exportToExcel(type) {
        let csvContent = "\uFEFF";
        let fileName = "";

        if (type === "visit") {
            const filteredLogs = state.visitLogs.filter((log) => namespace.statistics.isDateInRange(log.date));
            if (filteredLogs.length === 0) {
                utils.showMessage("다운로드할 데이터가 없습니다.", "info");
                return;
            }

            csvContent += "날짜,시간,이름,성별,나이,이용목적\n";
            filteredLogs.forEach((log) => {
                csvContent += `${utils.sanitizeCsvField(log.date)},${utils.sanitizeCsvField(log.time)},${utils.sanitizeCsvField(log.name)},${utils.sanitizeCsvField(log.gender)},${utils.sanitizeCsvField((log.age || "").split("(")[0])},"${utils.sanitizeCsvField((log.purposes || []).join(", "))}"\n`;
            });
            fileName = `방문등록_${utils.formatLocalDate(new Date())}.csv`;
        } else {
            const filteredLogs = state.arLogs.filter((log) => namespace.statistics.isDateInRange(log.date));
            if (filteredLogs.length === 0) {
                utils.showMessage("다운로드할 데이터가 없습니다.", "info");
                return;
            }

            csvContent += "예약날짜,예약시간,대표자,총인원,이용자상세\n";
            filteredLogs.forEach((log) => {
                const details = (log.users || []).map((user) => `${user.name}(${user.gender}/${(user.age || "").split("(")[0]})`).join(" | ");
                csvContent += `${utils.sanitizeCsvField(log.date)},${utils.sanitizeCsvField(log.timeSlot)},${utils.sanitizeCsvField(log.users?.[0]?.name || "")},${log.users?.length || 0},"${utils.sanitizeCsvField(details)}"\n`;
            });
            fileName = `AR예약_${utils.formatLocalDate(new Date())}.csv`;
        }

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        link.click();
    }

    namespace.excel = {
        exportToExcel
    };
})(window.NCHM);
