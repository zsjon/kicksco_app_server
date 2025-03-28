import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 현재 파일의 __dirname 대체 (ESM에서는 직접 구해야 함)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ 경로 수정: 상대경로 대신 절대경로로 설정
const filePath = path.join(__dirname, '../data/events.json');

export function saveEvent(email, date, event) {
  const events = getEvents();
  events.push({ email, date, event });
  fs.writeFileSync(filePath, JSON.stringify(events, null, 2));
}

export function getEvents() {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}
