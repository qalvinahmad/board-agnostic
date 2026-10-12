# board-agnostic

**English** · [Bahasa Indonesia](README.id.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

[![CI](https://github.com/qalvinahmad/board-agnostic/actions/workflows/ci.yml/badge.svg)](https://github.com/qalvinahmad/board-agnostic/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A lightweight, TypeScript-first hardware abstraction layer for JavaScript and Node.js.

Use one application-facing API for GPIO, UART, and SPI, with platform-specific backends handling the differences between boards and operating environments.

> **Status: early development.** The core API and a functional mock backend are available. No physical-board backend has been implemented or verified yet, and the API may change.

## Why board-agnostic?

Hardware libraries expose different APIs and access patterns. A Raspberry Pi can use host-side operating-system drivers, while Arduino and ESP32 commonly require firmware and a serial or network bridge. Peripheral capabilities, timing, pin mapping, permissions, and setup requirements vary by platform.

This project provides a common contract for application code without pretending those hardware differences do not exist:

- **Separate peripheral APIs** for GPIO, UART, and SPI.
- **Explicit backend capabilities** so applications can check what is supported.
- **Pluggable backends** that can be added without coupling the core to one board.
- **A mock backend** for exercising application logic without physical hardware.
- **TypeScript-first interfaces** with validation and lifecycle errors.

## What works today

| Component | Status |
| --- | --- |
| Core hardware API and capability discovery | Implemented |
| Mock GPIO input/output | Implemented |
| Mock UART buffered reads and writes | Implemented |
| Mock SPI transfers | Implemented (loopback or configurable response) |
| Linux / Raspberry Pi backend | Not implemented |
| Arduino / ESP32 bridge | Not implemented |
| Tessel 2 backend | Research needed |

Mock behavior is for development and tests; it does not establish physical hardware compatibility or real-time performance.

## Requirements

- Node.js 22 or later
- npm

## Getting started

The package is not published to npm yet. To try the current implementation locally:

```sh
git clone https://github.com/qalvinahmad/board-agnostic.git
cd board-agnostic
npm ci
npm test
npm run typecheck
npm run build
```

Once published, installation will be available with `npm install board-agnostic`.

## Usage

The following example uses the included mock backend. Its API is implemented and covered by tests:

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
// Mock SPI returns a copy of the transmitted bytes.
await spi.close();

await hardware.close();
```

`uart.read()` without options is non-blocking: it returns the bytes currently buffered by the backend, or an empty array when no data is available. Pass `{ timeoutMs }` to wait for data for up to that many milliseconds, or `{ signal }` to wait until data arrives or the `AbortSignal` is aborted. A timed-out read returns an empty array; an aborted read rejects with `OperationAbortedError`. Real backends must follow this contract and document hardware-specific timing and buffering characteristics.

The mock SPI backend loops transmitted bytes back by default. To test a device-specific response, configure a responder before opening the device:

```ts
backend.setSpiResponder(0, 0, (transmitted) => {
  // Return the simulated device response.
  return new Uint8Array([0x42, transmitted[0] ?? 0]);
});
```

This lets tests exercise response handling, but does not emulate a device protocol, timing, or chip-select behavior.

## Backend capabilities

Check capabilities before using a peripheral. Capabilities describe what the selected backend supports; they do not guarantee that a particular pin or device is available:

```ts
const hardware = createHardware({ backend: new MockBackend() });

if (hardware.capabilities.gpio?.modes.includes("input")) {
  const button = await hardware.gpio.open({ pin: 4, mode: "input" });
  console.log(await button.read());
  await button.close();
}

await hardware.close();
```

The mock backend also provides `setInputValue(pin, value)` for simulating an external input and `injectUartData(port, data)` for simulating received UART data.

## Architecture

```text
Application
    |
Core API (GPIO / UART / SPI, types, capabilities, lifecycle)
    |
Backend (mock, native host, serial bridge, or custom)
    |
OS driver / transport / firmware
    |
Hardware
```

The core defines separate contracts for each peripheral. A backend only needs to implement the peripherals it advertises; claiming a capability without its matching `open` method is rejected during setup. The core tracks opened resources, waits for in-progress opens during shutdown, closes every resource before closing the backend, and reports cleanup failures together. A future Raspberry Pi backend may use local host access, while a microcontroller backend may communicate with firmware over serial or a network transport.

## Hardware safety

This library does not validate electrical safety. Check the board and peripheral datasheets, voltage levels, current limits, pin mapping, and wiring before connecting hardware. It is not a substitute for electrical review or hardware safeguards.

## Development

```sh
npm ci
npm test
npm run typecheck
npm run build
```

Tests use the mock backend and do not require physical devices. Passing them does not verify real hardware behavior.

The package currently provides ESM imports only; CommonJS `require()` is not supported.

## Roadmap

- [x] Define core API, lifecycle, capability discovery, and typed errors.
- [x] Add a mock backend for GPIO, UART, and SPI.
- [ ] Add a real host-side backend and verify it on supported hardware.
- [ ] Specify a versioned firmware bridge for microcontrollers.
- [ ] Publish setup guides and a tested compatibility matrix.
- [ ] Explore I²C, PWM, and interrupt support.

## Contributing

Contributions are welcome, especially around API design, backends, firmware protocols, tests, and hardware compatibility reports. For a new backend, document its supported peripherals, operating-system requirements, setup, limitations, and test procedure. Open an issue before making a large or breaking API change.

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and pull request checks, and [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
