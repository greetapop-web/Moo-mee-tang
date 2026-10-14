/**
 * service-worker.js — ตัวทำให้แอปเปิดได้แม้ไม่มีเน็ต
 *
 * หลักการ: ตอนติดตั้งครั้งแรก จะดาวน์โหลดไฟล์หน้าตาแอปทั้งหมด (HTML/CSS/JS/ไอคอน) เก็บไว้ในเครื่อง
 * ครั้งต่อ ๆ ไปจะเปิดจากในเครื่องทันที ไม่ต้องรอเน็ต
 *
 * สำคัญ: ไฟล์นี้ "ไม่" แคชข้อมูลบัญชีรับ-จ่าย — ข้อมูลนั้นเก็บแยกใน IndexedDB ผ่าน app.js
 * และคำขอที่วิ่งไป Google Apps Script จะไม่ถูกแคชเด็ดขาด เพื่อไม่ให้เห็นยอดเงินเก่าค้าง
 */

// เปลี่ยนเลขเวอร์ชันนี้ทุกครั้งที่แก้ไฟล์หน้าตาแอป เพื่อบังคับให้เครื่องโหลดของใหม่
const CACHE_NAME = 'moo-mee-tang-v4';

const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './config.js',
  './app.js',
  './manifest.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/icon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // ไม่ยุ่งกับคำขอที่ไม่ใช่ GET และคำขอที่วิ่งไปหา Google (ข้อมูลต้องสดเสมอ)
  if (req.method !== 'GET') return;
  if (req.url.includes('script.google.com') || req.url.includes('googleusercontent.com')) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // มีในเครื่องแล้ว — ใช้เลยเพื่อความเร็ว แล้วค่อยแอบอัปเดตไว้ใช้รอบหน้า
        fetch(req)
          .then((res) => {
            if (res && res.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
            }
          })
          .catch(() => { /* ออฟไลน์อยู่ ไม่เป็นไร ของในเครื่องยังใช้ได้ */ });
        return cached;
      }

      return fetch(req)
        .then((res) => {
          if (res && res.ok && req.url.startsWith(self.location.origin)) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
