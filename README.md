# Murder Case: Evidence Deck

เกมสืบสวนคดีฆาตกรรมแบบผู้เล่นคนเดียวบนเว็บ ผู้เล่นตรวจหลักฐานผ่านจุดตรวจ (hotspot) ที่ใช้จำนวนแอ็กชันจำกัด จัดกระดานสรุปข้อสันนิษฐาน และยื่นคำกล่าวหาสุดท้ายเพื่อทำคะแนน

ข้อมูลโปรไฟล์ ความคืบหน้าคดี บันทึกหลักฐาน กระดานสรุป คะแนนย้อนหลัง และสถิติของผู้เล่นแต่ละชื่อจะถูกเก็บแยกกันใน `localStorage` ของเบราว์เซอร์ ไม่มีระบบห้องออนไลน์ ไม่มีมัลติเพลเยอร์ และไม่ต้องใช้ฐานข้อมูลสำหรับ MVP

## เทคโนโลยี

- Node.js 18 ขึ้นไป
- Express
- Vanilla HTML, CSS และ JavaScript
- Browser `localStorage`

## เริ่มใช้งานบนเครื่อง

```bash
npm install
npm start
```

จากนั้นเปิด [http://localhost:3000](http://localhost:3000)

ตรวจสอบกฎและโครงสร้างของเกมด้วย:

```bash
npm test
```

หรือเรียกสคริปต์โดยตรงด้วย `npm run rule-check`

Health endpoint อยู่ที่ [http://localhost:3000/api/health](http://localhost:3000/api/health)

## การบันทึกข้อมูล

เกมบันทึกข้อมูลในเบราว์เซอร์ของอุปกรณ์ที่กำลังใช้งาน ชื่อผู้เล่นใหม่จะสร้างโปรไฟล์แยก ส่วนชื่อเดิมจะโหลดเซฟของโปรไฟล์นั้นกลับมา การล้างข้อมูลเว็บไซต์หรือ `localStorage` จะลบเซฟทั้งหมดบนเบราว์เซอร์นั้น

## โครงสร้างโครงการ

```text
.
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── scripts/
│   └── rule-check.js
├── src/
│   ├── cases.js
│   └── gameLogic.js
├── .gitignore
├── package-lock.json
├── package.json
├── server.js
└── render.yaml
```

## Deploy บน Render

ไฟล์ `render.yaml` กำหนด Web Service ไว้แล้ว โดยใช้:

- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`

ขั้นตอนแบบ Blueprint:

1. Push โครงการไปยัง Git repository
2. ใน Render เลือก **New > Blueprint**
3. เชื่อม repository และเลือกไฟล์ `render.yaml`
4. สร้าง service แล้วรอ build สำเร็จ

หากสร้าง Web Service เอง ให้เลือก Node runtime ใส่คำสั่ง build/start ด้านบน และไม่ต้องตั้งค่า `PORT` เอง เพราะ Render จะส่งค่าให้แอปผ่าน environment variable โดยอัตโนมัติ

## MVP notes

- ไม่มี server-side account หรือ cloud save
- โปรไฟล์ที่ชื่อเหมือนกันในคนละเบราว์เซอร์ถือเป็นคนละข้อมูล
- ตัวเซิร์ฟเวอร์มีหน้าที่ให้บริการไฟล์เกมแบบ static และ health endpoint เท่านั้น

การตั้งค่า Blueprint ใช้ `autoDeployTrigger: commit` ตามสเปกปัจจุบันของ Render เพื่อ deploy ทุกครั้งที่ push commit ไปยัง branch ที่เชื่อมไว้
