/**
 * ============================================================================
 * admin-tool / components / table.js
 * ============================================================================
 * 
 * Self-rendering statistics table component.
 * Preserves the exact original table structure, styling, and behavior.
 * ============================================================================
 */

window.AT_Table = {

    /**
     * Render a statistics table with age/gender breakdown.
     */
    renderStatsTable: function(data, categories, targetBodyId, targetFooterId, themeClass) {
        var body = document.getElementById(targetBodyId);
        var footer = document.getElementById(targetFooterId);
        if (!body || !footer) return;

        body.innerHTML = "";

        var grandTotal = 0;
        var ageGenderTotals = {};
        var ageGroups = window.ADMIN_TOOL.ageGroups || [];

        ageGroups.forEach(function(age) {
            ageGenderTotals[age] = { "\uB0A8": 0, "\uC5EC": 0 };
        });

        categories.forEach(function(category) {
            var youthSum = 0;
            var youngSum = 0;
            var rowTotal = 0;

            var tr = document.createElement("tr");
            tr.innerHTML = '<td class="at-category-row">' + window.AT_Utils.escapeHtml(category) + '</td>';

            ageGroups.forEach(function(age, idx) {
                var male = data[category][age]["\uB0A8"] || 0;
                var female = data[category][age]["\uC5EC"] || 0;
                var rowVal = male + female;

                tr.innerHTML += '<td>' + (male || "-") + '</td><td>' + (female || "-") + '</td>';
                rowTotal += rowVal;
                ageGenderTotals[age]["\uB0A8"] += male;
                ageGenderTotals[age]["\uC5EC"] += female;

                if (idx < 3) youthSum += rowVal;
                if (idx >= 3 && idx <= 4) youngSum += rowVal;
            });

            tr.innerHTML += '<td class="' + themeClass + '">' + youthSum + '</td><td class="' + themeClass + '">' + youngSum + '</td><td class="at-total-sum-col">' + rowTotal + '</td>';
            body.appendChild(tr);
            grandTotal += rowTotal;
        });

        footer.innerHTML = "<td>\uD569\uACC4</td>";

        var footerYouth = 0;
        var footerYoung = 0;

        ageGroups.forEach(function(age, idx) {
            var male = ageGenderTotals[age]["\uB0A8"];
            var female = ageGenderTotals[age]["\uC5EC"];
            footer.innerHTML += '<td>' + male + '</td><td>' + female + '</td>';
            var sum = male + female;
            if (idx < 3) footerYouth += sum;
            if (idx >= 3 && idx <= 4) footerYoung += sum;
        });

        var finalClass = themeClass === "at-sum-col" ? "at-final-total-visit" : "at-final-total-ar";
        footer.innerHTML += '<td>' + footerYouth + '</td><td>' + footerYoung + '</td><td class="' + finalClass + '">' + grandTotal + '</td>';
    }
};