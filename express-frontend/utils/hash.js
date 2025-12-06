const bcrypt = require('bcryptjs');

const hashToken = async (token) => bcrypt.hash(token, 10);

const compareTokenHash = async (token, hash) => bcrypt.compare(token, hash);

module.exports = {
  hashToken,
  compareTokenHash,
};

