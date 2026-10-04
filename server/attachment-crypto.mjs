import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const magic = Buffer.from('OCAT1');
const ivLength = 12;
const tagLength = 16;

export function attachmentKey(value = process.env.ATTACHMENT_ENCRYPTION_KEY) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('ATTACHMENT_ENCRYPTION_KEY é obrigatória e deve conter uma chave Base64 de 32 bytes.');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value.trim())
    throw new Error('ATTACHMENT_ENCRYPTION_KEY deve ser uma chave Base64 canônica de 32 bytes.');
  return key;
}

export function isEncryptedAttachment(data) {
  return Buffer.isBuffer(data) && data.length >= magic.length + ivLength + tagLength && data.subarray(0, magic.length).equals(magic);
}

export function encryptAttachment(data, key) {
  const iv = randomBytes(ivLength);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([magic, iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptAttachment(data, key) {
  if (!isEncryptedAttachment(data)) return data;
  const offset = magic.length;
  const iv = data.subarray(offset, offset + ivLength);
  const tag = data.subarray(offset + ivLength, offset + ivLength + tagLength);
  const ciphertext = data.subarray(offset + ivLength + tagLength);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error('Não foi possível decifrar o comprovante. Confira a chave de criptografia.');
  }
}
