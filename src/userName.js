function randomSuffix(length = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < length; i += 1) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

/** @returns {string} `user_${Date.now()}_${random}` */
export function generateDefaultUserName() {
  return `user_${Date.now()}_${randomSuffix()}`;
}
