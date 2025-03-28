
import { getEvents } from './fileManager.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();
const TOKEN = process.env.WEBEX_BOT_TOKEN;

export default async function sendDailyNotifications() {
  const today = new Date().toISOString().slice(0, 10);
  const events = getEvents().filter(e => e.date === today);

  for (const e of events) {
    try {
      await axios.post('https://webexapis.com/v1/messages', {
        toPersonEmail: e.email,
        text: `📌 오늘 일정: ${e.event}`
      }, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      console.log(`✅ Sent to ${e.email}`);
    } catch (err) {
      console.error(`❌ Failed for ${e.email}`, err.response?.data);
    }
  }
}
