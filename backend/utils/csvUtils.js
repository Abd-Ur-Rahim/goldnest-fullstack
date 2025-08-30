// backend/utils/csvUtils.js

// ===================================================================================
// DEPRECATED FILE
// ===================================================================================
// This file is no longer in use. All data handling logic for gold prices has been
// migrated to use MongoDB and is now located in 'backend/utils/goldDataUtils.js'.
//
// This file can be safely deleted from the project.
// ===================================================================================

const formatDateMDY = (date) => {
    // This function may or may not be used elsewhere. If it is, move it to a 
    // more general utility file. If not, it can be deleted with this file.
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
};

module.exports = { formatDateMDY };