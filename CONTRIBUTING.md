# Contributing

Thanks for helping improve `board-agnostic`. The project is an early-stage prototype: its core API and mock backend are implemented, but no physical-board backend has been verified. Please keep compatibility claims specific to hardware and tests that have actually been exercised.

## Development setup

Requirements: Node.js 22 or later and npm.

```sh
git clone https://github.com/qalvinahmad/board-agnostic.git
cd board-agnostic
npm ci
```

Before submitting a pull request, run the complete local checks:

```sh
npm test
npm run typecheck
npm run build
```

All checks must pass. Add or update tests for behavior changes. Tests against the mock backend do not count as verification on physical hardware.

## Backend contributions

Backends should implement only the peripherals they advertise. Each backend must document:

- Supported operations and capability details.
- Runtime, operating-system, hardware, firmware, permission, and setup requirements.
- Pin mapping, timing, buffering, and known limitations.
- How its behavior was tested, clearly distinguishing mock, integration, and physical hardware tests.

Run the shared core tests for lifecycle, capability validation, and cleanup behavior. Do not claim board compatibility without recording the specific board, OS/runtime, wiring or configuration, and actual test results.

## Pull requests

- Keep changes focused and explain the user-visible behavior.
- Include tests and update relevant documentation.
- Do not include credentials, private keys, or other secrets.
- For breaking API changes, explain the migration impact and open an issue first when practical.

## Hardware safety

This software does not validate electrical safety. Check the board and peripheral datasheets, voltage levels, current limits, pin mappings, and wiring before connecting hardware. Do not rely on this library as a substitute for electrical review or hardware safeguards.
