import { describe, expect, it } from "vitest";
import {
  createHardware,
  InvalidConfigurationError,
  MockBackend,
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

  it("reports unsupported peripherals and invalid configurations", async () => {
    const backend = new MockBackend();
    const hardware = createHardware({
      backend: {
        name: "restricted-mock",
        capabilities: { gpio: { modes: ["input"] } },
        openGpio: (options) => backend.openGpio(options),
        openUart: (options) => backend.openUart(options),
        openSpi: (options) => backend.openSpi(options),
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

  it("closes the backend and rejects subsequent operations", async () => {
    const hardware = createHardware({ backend: new MockBackend() });

    await hardware.close();
    await expect(hardware.gpio.open({ pin: 1, mode: "output" })).rejects.toBeInstanceOf(
      ResourceClosedError,
    );
    await hardware.close();
  });
});
