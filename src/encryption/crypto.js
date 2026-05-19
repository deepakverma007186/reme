import 'react-native-get-random-values';
import CryptoJS from 'crypto-js';

/**
 * Derives a strong 256-bit symmetric key from a Master Password using the user's UUID as a salt.
 * Uses PBKDF2 with 10,000 iterations and SHA-256.
 * @param {string} masterPassword - The user's Master Password.
 * @param {string} salt - The user's Supabase UUID.
 * @returns {string} The derived AES key in Hex format.
 */
export function deriveKey(masterPassword, salt) {
  if (!masterPassword || !salt) return '';
  const key = CryptoJS.PBKDF2(masterPassword, salt, {
    keySize: 256 / 32, // 8 words = 256 bits
    iterations: 10000,
    hasher: CryptoJS.algo.SHA256,
  });
  return key.toString(CryptoJS.enc.Hex);
}

/**
 * Encrypts a plaintext string using an AES key (Hex format) and CBC mode.
 * Generates a unique 128-bit random IV for every encryption call.
 * Returns the IV and ciphertext combined as "ivHex:ciphertextHex".
 * @param {string} plaintext - The raw value to encrypt.
 * @param {string} hexKey - The 256-bit key in Hex format.
 * @returns {string} The combined IV and ciphertext.
 */
export function encryptData(plaintext, hexKey) {
  if (!plaintext) return '';
  if (!hexKey) throw new Error('Missing encryption key');

  try {
    const key = CryptoJS.enc.Hex.parse(hexKey);
    const iv = CryptoJS.lib.WordArray.random(128 / 8); // 16 bytes IV
    const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    
    const ivHex = iv.toString(CryptoJS.enc.Hex);
    const ciphertextHex = encrypted.ciphertext.toString(CryptoJS.enc.Hex);
    return `${ivHex}:${ciphertextHex}`;
  } catch (e) {
    console.error('Encryption failed:', e);
    throw new Error('Encryption error occurred.');
  }
}

/**
 * Decrypts a combined "ivHex:ciphertextHex" string using an AES key (Hex format).
 * @param {string} ciphertextWithIv - The combined IV and ciphertext string.
 * @param {string} hexKey - The 256-bit key in Hex format.
 * @returns {string} The decrypted plaintext string.
 */
export function decryptData(ciphertextWithIv, hexKey) {
  if (!ciphertextWithIv) return '';
  if (!hexKey) return '[Locked]';

  try {
    const parts = ciphertextWithIv.split(':');
    if (parts.length !== 2) return '';
    
    const iv = CryptoJS.enc.Hex.parse(parts[0]);
    const ciphertext = CryptoJS.enc.Hex.parse(parts[1]);
    const key = CryptoJS.enc.Hex.parse(hexKey);
    
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: ciphertext,
    });
    
    const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    console.error('Decryption failed:', e);
    return '[Decryption Error]';
  }
}

// Lists of sensitive fields per entry type that must be encrypted
const SENSITIVE_FIELDS = {
  password: ['login_username', 'login_email', 'login_phone', 'login_password', 'notes'],
  card: ['card_name', 'card_number', 'card_expiry', 'card_cvv', 'card_pin', 'notes'],
  document: ['doc_full_name', 'doc_number', 'doc_issue_date', 'doc_expiry_date', 'doc_images', 'notes'],
};

/**
 * Encrypts all sensitive fields of a vault entry prior to database insertion.
 * @param {object} rawEntry - The unencrypted, plain entry fields.
 * @param {string} hexKey - The derived encryption key.
 * @returns {object} The entry with sensitive fields encrypted.
 */
export function encryptEntry(rawEntry, hexKey) {
  if (!rawEntry || !hexKey) return rawEntry;
  const encrypted = { ...rawEntry };
  const fieldsToEncrypt = SENSITIVE_FIELDS[rawEntry.entry_type] || [];

  for (const field of fieldsToEncrypt) {
    if (rawEntry[field]) {
      encrypted[field] = encryptData(rawEntry[field], hexKey);
    }
  }

  return encrypted;
}

/**
 * Decrypts all sensitive fields of an encrypted vault entry for in-memory display.
 * @param {object} encryptedEntry - The ciphertext entry fetched from Supabase.
 * @param {string} hexKey - The derived decryption key.
 * @returns {object} The decrypted entry.
 */
export function decryptEntry(encryptedEntry, hexKey) {
  if (!encryptedEntry || !hexKey) return encryptedEntry;
  const decrypted = { ...encryptedEntry };
  const fieldsToDecrypt = SENSITIVE_FIELDS[encryptedEntry.entry_type] || [];

  for (const field of fieldsToDecrypt) {
    if (encryptedEntry[field]) {
      decrypted[field] = decryptData(encryptedEntry[field], hexKey);
    }
  }

  return decrypted;
}
