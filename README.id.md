# board-agnostic

[English](README.md) · **Bahasa Indonesia** · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

[![CI](https://github.com/qalvinahmad/board-agnostic/actions/workflows/ci.yml/badge.svg)](https://github.com/qalvinahmad/board-agnostic/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Lapisan abstraksi perangkat keras yang ringan dan mengutamakan TypeScript untuk JavaScript dan Node.js.

Gunakan satu API di sisi aplikasi untuk GPIO, UART, dan SPI; backend khusus platform menangani perbedaan antar-board dan lingkungan operasi.

> **Status: tahap awal pengembangan.** Core API dan mock backend yang berfungsi sudah tersedia. Belum ada backend untuk board fisik yang diimplementasikan atau diverifikasi, dan API masih dapat berubah.

## Mengapa board-agnostic?

Library perangkat keras menyediakan API dan cara akses yang berbeda. Raspberry Pi dapat menggunakan driver sistem operasi di host, sedangkan Arduino dan ESP32 umumnya memerlukan firmware serta bridge serial atau jaringan. Kemampuan periferal, timing, pemetaan pin, izin akses, dan konfigurasi juga berbeda-beda.

Proyek ini menyediakan kontrak bersama untuk kode aplikasi tanpa mengabaikan perbedaan hardware tersebut:

- **API terpisah** untuk GPIO, UART, dan SPI.
- **Kapabilitas backend yang eksplisit** agar aplikasi dapat memeriksa fitur yang tersedia.
- **Backend yang dapat dipasang** tanpa mengikat core pada satu board.
- **Mock backend** untuk menguji logika aplikasi tanpa hardware fisik.
- **Antarmuka yang mengutamakan TypeScript**, dilengkapi validasi dan error lifecycle.

## Fitur yang tersedia

| Komponen | Status |
| --- | --- |
| Core hardware API dan penemuan kapabilitas | Tersedia |
| Mock GPIO input/output | Tersedia |
| Mock UART buffered read/write | Tersedia |
| Mock SPI transfer | Tersedia (loopback atau respons yang dapat dikonfigurasi) |
| Backend Linux / Raspberry Pi | Belum diimplementasikan |
| Bridge Arduino / ESP32 | Belum diimplementasikan |
| Backend Tessel 2 | Perlu riset |

Perilaku mock ditujukan untuk pengembangan dan pengujian; ini bukan bukti kompatibilitas hardware fisik atau performa real-time.

## Persyaratan

- Node.js 20 atau lebih baru
- npm

## Mulai menggunakan

Paket belum diterbitkan ke npm. Untuk mencoba implementasi saat ini secara lokal:

```sh
git clone https://github.com/qalvinahmad/board-agnostic.git
cd board-agnostic
npm ci
npm test
npm run typecheck
npm run build
```

Setelah diterbitkan, paket dapat dipasang dengan `npm install board-agnostic`.

## Contoh penggunaan

Contoh berikut menggunakan mock backend bawaan. API ini sudah diimplementasikan dan diuji:

```ts
import { createHardware, MockBackend } from "board-agnostic";

const backend = new MockBackend();
const hardware = createHardware({ backend });

const led = await hardware.gpio.open({ pin: 17, mode: "output" });
await led.write(true);
await led.close();

const uart = await hardware.uart.open({
  port: "mock:device",
  baudRate: 115200,
});
await uart.write(new Uint8Array([0x48, 0x69]));
backend.injectUartData("mock:device", new Uint8Array([0x4f, 0x4b]));
console.log(await uart.read({ timeoutMs: 1000 })); // Uint8Array [79, 75]
await uart.close();

const spi = await hardware.spi.open({
  bus: 0,
  chipSelect: 0,
  clockHz: 1_000_000,
});
console.log(await spi.transfer(new Uint8Array([0x01, 0x02])));
await spi.close();

await hardware.close();
```

`uart.read()` tanpa opsi bersifat non-blocking: mengembalikan byte yang saat itu tersedia di buffer backend, atau array kosong jika belum ada data. Gunakan `{ timeoutMs }` untuk menunggu data selama waktu tertentu, atau `{ signal }` untuk menunggu sampai data masuk atau `AbortSignal` dibatalkan. Timeout mengembalikan array kosong; pembatalan melempar `OperationAbortedError`. Backend nyata harus mengikuti kontrak ini serta mendokumentasikan timing dan buffering spesifik hardware.

Secara default, mock SPI mengembalikan byte yang dikirim. Untuk menguji respons perangkat tertentu, daftarkan responder sebelum membuka perangkat dengan `backend.setSpiResponder(0, 0, (transmitted) => new Uint8Array([0x42]))`. Ini membantu menguji penanganan respons, tetapi bukan emulator protokol, timing, atau chip-select perangkat.

## Kapabilitas backend

Periksa kapabilitas sebelum menggunakan periferal. Kapabilitas menunjukkan dukungan backend, bukan jaminan bahwa pin atau perangkat tertentu tersedia:

```ts
const hardware = createHardware({ backend: new MockBackend() });

if (hardware.capabilities.gpio?.modes.includes("input")) {
  const button = await hardware.gpio.open({ pin: 4, mode: "input" });
  console.log(await button.read());
  await button.close();
}

await hardware.close();
```

Mock backend menyediakan `setInputValue(pin, value)` untuk menyimulasikan input eksternal dan `injectUartData(port, data)` untuk menyimulasikan data UART yang diterima.

## Arsitektur

```text
Aplikasi
    |
Core API (GPIO / UART / SPI, tipe, kapabilitas, lifecycle)
    |
Backend (mock, host native, serial bridge, atau implementasi khusus)
    |
Driver OS / transport / firmware
    |
Hardware
```

Core mendefinisikan kontrak terpisah untuk tiap periferal. Backend hanya perlu mengimplementasikan periferal yang diumumkannya; klaim kapabilitas tanpa metode `open` yang sesuai akan ditolak saat setup. Core melacak resource, menunggu operasi pembukaan yang sedang berlangsung ketika shutdown, menutup semua resource sebelum backend, dan melaporkan kegagalan cleanup secara bersama. Backend Raspberry Pi kelak dapat mengakses host secara lokal, sedangkan backend mikrokontroler dapat berkomunikasi dengan firmware melalui serial atau jaringan.

## Pengembangan

```sh
npm ci
npm test
npm run typecheck
npm run build
```

Pengujian menggunakan mock backend dan tidak memerlukan perangkat fisik. Lulus tes bukan berarti perilaku hardware nyata telah diverifikasi.

Paket saat ini hanya mendukung impor ESM; CommonJS `require()` belum didukung.

## Roadmap

- [x] Menentukan core API, lifecycle, penemuan kapabilitas, dan typed errors.
- [x] Menambahkan mock backend untuk GPIO, UART, dan SPI.
- [ ] Menambahkan backend host nyata dan mengujinya pada hardware yang didukung.
- [ ] Menentukan firmware bridge berversi untuk mikrokontroler.
- [ ] Menerbitkan panduan setup dan matriks kompatibilitas teruji.
- [ ] Mengeksplorasi dukungan I²C, PWM, dan interrupt.

## Kontribusi

Kontribusi sangat terbuka, terutama untuk desain API, backend, protokol firmware, pengujian, dan laporan kompatibilitas hardware. Backend baru sebaiknya mendokumentasikan periferal yang didukung, persyaratan sistem operasi, setup, keterbatasan, dan prosedur tesnya. Buka issue sebelum membuat perubahan API besar atau breaking.

## Lisensi

Proyek ini menggunakan lisensi MIT. Lihat [LICENSE](LICENSE).
