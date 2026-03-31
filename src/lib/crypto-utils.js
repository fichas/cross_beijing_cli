import { createHash, publicEncrypt, constants } from 'node:crypto';

/**
 * Returns the MD5 hex digest of the input string.
 */
export function md5(str) {
  return createHash('md5').update(str).digest('hex');
}

/**
 * RSA-encrypts a data object using PKCS1 v1.5 padding.
 *
 * Ported from the Python bjt_login.py:
 * - JSON-stringifies the data object
 * - Splits into 214-byte chunks
 * - Encrypts each chunk with RSA_PKCS1_PADDING
 * - Returns base64 chunks joined by ','
 */
export function rsaEncrypt(dataObj, publicKeyBase64) {
  const pem = `-----BEGIN PUBLIC KEY-----\n${publicKeyBase64}\n-----END PUBLIC KEY-----`;
  const jsonStr = JSON.stringify(dataObj);
  const dataBytes = Buffer.from(jsonStr, 'utf-8');

  const chunkSize = 214;
  const chunks = [];
  for (let i = 0; i < dataBytes.length; i += chunkSize) {
    chunks.push(dataBytes.subarray(i, i + chunkSize));
  }

  const encryptedChunks = chunks.map((chunk) =>
    publicEncrypt(
      { key: pem, padding: constants.RSA_PKCS1_PADDING },
      chunk,
    ).toString('base64'),
  );

  return encryptedChunks.join(',');
}
