// utils/generateToken.js
const jwt = require('jsonwebtoken');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '2h', // Token expires in 1 day
    });
};

module.exports = generateToken;