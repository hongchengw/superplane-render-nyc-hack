import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.factory');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export function loadConfig() {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function saveConfig(config) {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getConfigPath() {
  return CONFIG_FILE;
}

export function requireConfig(keys = []) {
  const config = loadConfig();
  const missing = keys.filter(k => !config[k]);
  if (missing.length > 0) {
    console.error(`Missing config: ${missing.join(', ')}. Run: factory init`);
    process.exit(1);
  }
  return config;
}
