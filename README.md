# ITHALA20 Smart Weather Dashboard

> IoT Smart Weather Dashboard สำหรับโรงแรม — ภูเก็ต

## สถานี
- **ITHALA20-PHUKET-01** · ESP32 · Phuket, Thailand
- Database: Supabase PostgreSQL (`sensor_readings`)

## Features

### 🌤 Guest View
- สรุปสภาพอากาศแบบ plain language พร้อม emoji
- **Beach Condition Score** — คะแนน % + ดาว
- **Comfort Index** (NOAA Heat Index formula)
- Weather Timeline วันนี้ รายชั่วโมง
- 3-Hour Forecast (rule-based)
- คำแนะนำกิจกรรม
- QR Code → Guest Dashboard URL
- สลับภาษา TH/EN

### 🔧 Admin View
- กราฟ Time Series 24h / 7d (Chart.js)
- Heatmap รายชั่วโมง × 7 วัน
- Multi-Station Map
- IoT Health Monitor (Uptime, Missing Data, Wet-Stuck)
- สถิติรายวัน (Max/Min Temp, ฝนตกกี่ชั่วโมง)
- Alert Threshold Config (ตั้งค่าเองได้)
- Alert Log
- Export CSV / JSON / Daily Report
- Telegram Bot Alert setup (ESP32 firmware code)

## Stack
- **Frontend:** HTML/CSS/JS (Vanilla) + Chart.js
- **Database:** Supabase PostgreSQL
- **Deploy:** Vercel
- **Hardware:** ESP32 + DHT22 + BH1750 + Rain Sensor

## Config (ใน index.html)
```js
const SB_URL  = 'https://ndcdpkkptbyeosgkcvgy.supabase.co';
const SB_KEY  = 'sb_publishable_...';
const TABLE   = 'sensor_readings';
const STATION = 'ITHALA20-PHUKET-01';
```

## Deploy
1. Push ขึ้น GitHub
2. ไป [vercel.com](https://vercel.com) → Import repo นี้
3. Deploy ได้เลย (ไม่ต้องตั้งค่าอะไรเพิ่ม)

---
*โครงงานวิชา IoT — สาขาเทคโนโลยีดิจิทัล มหาวิทยาลัยราชภัฏภูเก็ต*
