import { describe, expect, it } from "vitest";
import {
  createHardware,
  BackendConfigurationError,
  InvalidConfigurationError,
  MockBackend,
  OperationAbortedError,
  ResourceBusyError,
  ResourceClosedError,
  UnsupportedCapabilityError,
} from "../src/index.js";

describe("MockBackend", () => {
  it("supports GPIO output and releases a pin when closed", async () => {
    const backend = new MockBackend();
    const hardware = createHardware({ backend });
    const pin = await hardware.gpio.open({ pin: 17, mode: "output" });

    await pin.write(true);
    await expect(pin.read()).rejects.toBeInstanceOf(InvalidConfigurationError);
    await pin.close();
    await expect(pin.write(false)).rejects.toBeInstanceOf(ResourceClosedError);

    const reopenedPin = await hardware.gpio.open({ pin: 17, mode: "output" });
    await reopenedPin.close();
    await hardware.close();
  });

  it("simulates GPIO input and validates the GPIO mode", async () => {
    const backend = new MockBackend();
    const hardware = createHardware({ backend });
    const pin = await hardware.gpio.open({ pin: 4, mode: "input" });

    backend.setInputValue(4, true);
    await expect(pin.read()).resolves.toBe(true);
    await expect(pin.write(true)).rejects.toBeInstanceOf(InvalidConfigurationError);
    await pin.close();
    await hardware.close();
  });

  it("buffers UART input and records writes without sharing mutable bytes", async () => {
    const backend = new MockBackend();
    const hardware = createHardware({ backend });
    const uart = await hardware.uart.open({ port: "mock:device", baudRate: 115200 });
    const outgoing = new Uint8Array([0x48, 0x69]);

    await uart.write(outgoing);
    outgoing[0] = 0;
    expect(backend.getUartWrittenData("mock:device")).toEqual([
      new Uint8Array([0x48, 0x69]),
    ]);

    backend.injectUartData("mock:device", new Uint8Array([0x4f]));
    backend.injectUartData("mock:device", new Uint8Array([0x4b]));
    await expect(uart.read()).resolves.toEqual(new Uint8Array([0x4f, 0x4b]));
    await expect(uart.read()).resolves.toEqual(new Uint8Array());
    await hardware.close();
  });

  it("waits for UART data, times out, and supports cancellation", async () => {
    const backend = new MockBackend();
    const hardware = createHardware({ backend });
    const uart = await hardware.uart.open({ port: "mock:wait", baudRate: 9600 });

    const waitingRead = uart.read({ timeoutMs: 100 });
    setTimeout(() => backend.injectUartData("mock:wait", new Uint8Array([7])), 5);
    await expect(waitingRead).resolves.toEqual(new Uint8Array([7]));

    await expect(uart.read({ timeoutMs: 1 })).resolves.toEqual(new Uint8Array());

    const controller = new AbortController();
    const abortedRead = uart.read({ signal: controller.signal });
    controller.abort();
    await expect(abortedRead).rejects.toBeInstanceOf(OperationAbortedError);
    await hardware.close();
  });

  it("provides SPI loopback transfers and prevents duplicate device opens", async () => {
    const hardware = createHardware({ backend: new MockBackend() });
    const options = { bus: 0, chipSelect: 0, clockHz: 1_000_000 };
    const spi = await hardware.spi.open(options);

    await expect(hardware.spi.open(options)).rejects.toBeInstanceOf(ResourceBusyError);
    await expect(spi.transfer(new Uint8Array([1, 2]))).resolves.toEqual(
      new Uint8Array([1, 2]),
    );
    await spi.close();
    await hardware.close();
  });

  it("supports configurable SPI responses without exposing mutable buffers", async () => {
    const backend = new MockBackend();
    const hardware = createHardware({ backend });
    const response = new Uint8Array([0xaa]);
    backend.setSpiResponder(1, 2, (transmitted) => {
      expect(transmitted).toEqual(new Uint8Array([0x10]));
      return response;
    });
    const spi = await hardware.spi.open({ bus: 1, chipSelect: 2, clockHz: 500_000 });

    const received = await spi.transfer(new Uint8Array([0x10]));
    response[0] = 0;
    expect(received).toEqual(new Uint8Array([0xaa]));
    await spi.close();
    await hardware.close();
  });

  it("reports unsupported peripherals and invalid configurations", async () => {
    const backend = new MockBackend();
    const hardware = createHardware({
      backend: {
        name: "restricted-mock",
        capabilities: { gpio: { modes: ["input"] } },
        openGpio: (options) => backend.openGpio(options),
        close: () => backend.close(),
      },
    });

    await expect(hardware.uart.open({ port: "mock:device", baudRate: 9600 })).rejects.toBeInstanceOf(
      UnsupportedCapabilityError,
    );
    await expect(hardware.gpio.open({ pin: -1, mode: "input" })).rejects.toBeInstanceOf(
      InvalidConfigurationError,
    );
    await hardware.close();
  });

  it("rejects a backend that advertises a peripheral without implementing it", () => {
    expect(
      () =>
        createHardware({
          backend: {
            name: "incomplete",
            capabilities: { uart: true },
            close: async () => {},
          },
        }),
    ).toThrow(BackendConfigurationError);
  });

  it("rejects malformed backend and capability configurations with a typed error", () => {
    const createWithBackend = (backend: unknown) =>
      Reflect.apply(createHardware, undefined, [{ backend }]);
    const close = async () => {};

    for (const backend of [
      null,
      { name: "missing-capabilities", close },
      { name: "null-capabilities", capabilities: null, close },
      { name: "invalid-gpio", capabilities: { gpio: { modes: "input" } }, close },
      { name: "unknown-mode", capabilities: { gpio: { modes: ["analog"] } }, close },
      {
        name: "duplicate-mode",
        capabilities: { gpio: { modes: ["input", "input"] } },
        close,
      },
      { name: "invalid-uart-flag", capabilities: { uart: "yes" }, close },
      { name: "invalid-spi-flag", capabilities: { spi: null }, close },
      { name: "missing-close", capabilities: {}, close: undefined },
      { name: "invalid-open-method", capabilities: {}, openGpio: true, close },
    ]) {
      expect(() => createWithBackend(backend)).toThrow(BackendConfigurationError);
    }
  });

  it("freezes advertised capabilities and permits independent GPIO pins", async () => {
    const hardware = createHardware({ backend: new MockBackend() });
    expect(Object.isFrozen(hardware.capabilities)).toBe(true);
    expect(Object.isFrozen(hardware.capabilities.gpio?.modes)).toBe(true);
    expect(Reflect.set(hardware.capabilities, "uart", false)).toBe(false);

    const first = await hardware.gpio.open({ pin: 1, mode: "output" });
    const second = await hardware.gpio.open({ pin: 2, mode: "output" });
    await first.close();
    await second.close();
    await hardware.close();
  });

  it("closes every resource and the backend even when resource cleanup fails", async () => {
    let closedResources = 0;
    let backendClosed = 0;
    const hardware = createHardware({
      backend: {
        name: "failing-cleanup",
        capabilities: { gpio: { modes: ["output"] } },
        openGpio: async (options) => ({
          pin: options.pin,
          mode: options.mode,
          read: async () => false,
          write: async () => {},
          close: async () => {
            closedResources += 1;
            throw new Error(`failed to close ${options.pin}`);
          },
        }),
        close: async () => {
          backendClosed += 1;
        },
      },
    });
    await hardware.gpio.open({ pin: 1, mode: "output" });
    await hardware.gpio.open({ pin: 2, mode: "output" });

    await expect(hardware.close()).rejects.toMatchObject({
      name: "AggregateError",
      errors: expect.arrayContaining([expect.any(Error), expect.any(Error)]),
    });
    expect(closedResources).toBe(2);
    expect(backendClosed).toBe(1);
  });

  it("cleans up an open that finishes after hardware shutdown begins", async () => {
    let resolveOpen: ((resource: {
      pin: number;
      mode: "output";
      read(): Promise<boolean>;
      write(value: boolean): Promise<void>;
      close(): Promise<void>;
    }) => void) | undefined;
    let resourceClosed = 0;
    let backendClosed = 0;
    const hardware = createHardware({
      backend: {
        name: "slow-open",
        capabilities: { gpio: { modes: ["output"] } },
        openGpio: () =>
          new Promise((resolve) => {
            resolveOpen = resolve;
          }),
        close: async () => {
          backendClosed += 1;
        },
      },
    });

    const opening = hardware.gpio.open({ pin: 1, mode: "output" });
    await Promise.resolve();
    const closing = hardware.close();
    resolveOpen?.({
      pin: 1,
      mode: "output",
      read: async () => false,
      write: async () => {},
      close: async () => {
        resourceClosed += 1;
      },
    });

    await expect(opening).rejects.toBeInstanceOf(ResourceClosedError);
    await closing;
    expect(resourceClosed).toBe(1);
    expect(backendClosed).toBe(1);
  });

  it("closes the backend and rejects subsequent operations", async () => {
    const hardware = createHardware({ backend: new MockBackend() });

    await hardware.close();
    await expect(hardware.gpio.open({ pin: 1, mode: "output" })).rejects.toBeInstanceOf(
      ResourceClosedError,
    );
    await hardware.close();
  });
});
