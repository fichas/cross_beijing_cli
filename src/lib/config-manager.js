import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CONFIG_DIR, CONFIG_FILE } from '../constants.js';

/**
 * Returns the config directory path: ~/.cross-bj/
 */
export function getConfigDir() {
  return join(homedir(), CONFIG_DIR);
}

/**
 * Returns the config file path: ~/.cross-bj/config.json
 */
export function getConfigPath() {
  return join(getConfigDir(), CONFIG_FILE);
}

/**
 * Creates the config directory if it doesn't exist.
 */
export function ensureConfigDir() {
  const dir = getConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Reads and parses config.json. Returns null if the file doesn't exist.
 */
export function loadConfig() {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return null;
  }
  const raw = readFileSync(configPath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Writes config object to config.json (ensures dir exists first).
 */
export function saveConfig(config) {
  ensureConfigDir();
  const configPath = getConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf-8');
}

/**
 * Returns the first user from config, or null if no config or no users.
 */
export function getUser() {
  const config = loadConfig();
  if (!config || !Array.isArray(config.users) || config.users.length === 0) {
    return null;
  }
  return config.users[0];
}

/**
 * Merges updates into the first user and saves the config.
 * Creates a default config structure if none exists.
 */
export function updateUser(updates) {
  let config = loadConfig();
  if (!config) {
    config = {
      url: '',
      users: [
        {
          name: '',
          auth: '',
          bjt_phone: '',
          bjt_pwd: '',
          entry_type: '六环内',
          notify_urls: [],
          preferred_vehicle: '',
        },
      ],
    };
  }
  if (!Array.isArray(config.users) || config.users.length === 0) {
    config.users = [
      {
        name: '',
        auth: '',
        bjt_phone: '',
        bjt_pwd: '',
        entry_type: '六环内',
        notify_urls: [],
        preferred_vehicle: '',
      },
    ];
  }
  Object.assign(config.users[0], updates);
  saveConfig(config);
}

/**
 * Returns true if the first user has a non-empty `auth` token.
 */
export function isInitialized() {
  const user = getUser();
  return user !== null && typeof user.auth === 'string' && user.auth.length > 0;
}
