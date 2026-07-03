window.NCHM = window.NCHM || {};

(function registerValidation(namespace) {
    const { ageGroups, genders, purposes, limits } = namespace.config;

    function isValidName(name) {
        return typeof name === "string" && /^[가-힣a-zA-Z0-9\s]{1,10}$/.test(name.trim());
    }

    function isValidGender(gender) {
        return genders.includes(gender);
    }

    function isValidAge(age) {
        return ageGroups.includes(age);
    }

    function isValidPurposeList(selectedPurposes) {
        return Array.isArray(selectedPurposes) && selectedPurposes.length > 0 && selectedPurposes.every((purpose) => purposes.includes(purpose));
    }

    function isValidUserList(users) {
        return Array.isArray(users)
            && users.length >= limits.minUsersPerSubmission
            && users.length <= limits.maxUsersPerSubmission
            && users.every((user) => isValidName(user.name) && isValidGender(user.gender) && isValidAge(user.age));
    }

    function isValidDateString(date) {
        return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
    }

    function isValidTimeSlot(timeSlot) {
        return typeof timeSlot === "string" && /^\d{2}:\d{2}$/.test(timeSlot);
    }

    namespace.validation = {
        isValidName,
        isValidGender,
        isValidAge,
        isValidPurposeList,
        isValidUserList,
        isValidDateString,
        isValidTimeSlot
    };
})(window.NCHM);
