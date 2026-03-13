const { customAlphabet } = require('nanoid');

const createShortCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

function generateShareKey() {
  return createShortCode();
}

module.exports = { generateShareKey };
