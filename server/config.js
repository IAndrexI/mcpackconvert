import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = process.env.DATA_DIR 
  ? path.resolve(process.env.DATA_DIR) 
  : path.join(ROOT_DIR, 'data');

export const PORT = parseInt(process.env.PORT || '8080', 10);
export const HOST = process.env.HOST || '0.0.0.0';

// CurseForge API key: User can supply their own or use the standard key
export const CURSEFORGE_API_KEY = process.env.CURSEFORGE_API_KEY || '$2a$10$bL4bIL5pUWqfcO7KQtnMReakwtfHbNKh6v1uTpKlzhwoueEJQnPnm';

// User Agent for Modrinth and external requests
export const USER_AGENT = process.env.USER_AGENT || 'PackHub/1.0.0 (contact: github.com/packhub)';

// Default Prism Launcher paths by OS
export function getDefaultPrismInstancesPath() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'PrismLauncher', 'instances');
  } else if (process.platform === 'darwin') {
    return path.join(process.env.HOME || '', 'Library', 'Application Support', 'PrismLauncher', 'instances');
  } else {
    return path.join(process.env.HOME || '', '.local', 'share', 'PrismLauncher', 'instances');
  }
}
