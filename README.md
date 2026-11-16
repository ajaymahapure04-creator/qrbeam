# QRBeam

Send files between two phones with animated QR codes. No Wi-Fi, Bluetooth, mobile data or pairing needed. The file travels as light.

- **Send:** pick a file. The screen loops fountain-coded (LT) QR frames.
- **Receive:** point the camera at the sender's screen. Missed frames only cost time, never data. The rebuilt file is checked with CRC32.
- **Offline:** open the site once over HTTPS and add it to your home screen. After that it works in airplane mode (service worker).

## Layout
- `public/`: the deployable static site (single self-contained `index.html` + `sw.js` + manifest + icons)
- `src/core.js`: packing, fountain encoder, peeling decoder
- `src/app.html`: UI template (libraries get inlined at build time)
- `build.py`: `npm i && python3 build.py` regenerates `public/`
- `test/`: Node tests (`node test/sweep2.js`) and a headless-browser end-to-end test

## Deploy
Static site, publish directory `public`, no build command needed.

## Tuning
Expect roughly 10–25 KB/s in practice. If scanning struggles, lower "Data per frame" or the frame rate. If it scans easily, use Max and 30 fps.
