import {
  InvalidConfigurationError,
  ResourceClosedError,
  UnsupportedCapabilityError,
} from "./errors.js";
import type {
  GpioMode,
  HardwareBackend,
  HardwareCapabilities,
  SpiOpenOptions,
  UartOpenOptions,
} from "./types.js";

export interface Hardware {
  readonly backend: string;
  readonly capabilities: HardwareCapabilities;
  readonly gpio: {
    open(options: { readonly pin: number; readonly mode: GpioMode }): ReturnType<HardwareBackend["openGpio"]>;
  };
  readonly uart: {
    open(options: UartOpenOptions): ReturnType<HardwareBackend["openUart"]>;
  };
  readonly spi: {
    open(options: SpiOpenOptions): ReturnType<HardwareBackend["openSpi"]>;
  };
  close(): Promise<void>;
}

function validateNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidConfigurationError(`${name} must be a non-negative safe integer.`);
  }
}

function validatePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new InvalidConfigurationError(`${name} must be a positive safe integer.`);
  }
}

function copyCapabilities(capabilities: HardwareCapabilities): HardwareCapabilities {
  return Object.freeze({
    ...(capabilities.gpio === undefined
      ? {}
      : { gpio: Object.freeze({ modes: Object.freeze([...capabilities.gpio.modes]) }) }),
    ...(capabilities.uart === undefined ? {} : { uart: capabilities.uart }),
    ...(capabilities.spi === undefined ? {} : { spi: capabilities.spi }),
  });
}

export function createHardware(options: { readonly backend: HardwareBackend }): Hardware {
  const { backend } = options;
  let closed = false;
  let closePromise: Promise<void> | undefined;
  const capabilities = copyCapabilities(backend.capabilities);

  function assertOpen(): void {
    if (closed) {
      throw new ResourceClosedError("The hardware connection is closed.");
    }
  }

  function requireCapability(capability: "gpio" | "uart" | "spi"): void {
    assertOpen();
    const supported =
      capability === "gpio"
        ? capabilities.gpio !== undefined
        : capabilities[capability] === true;

    if (!supported) {
      throw new UnsupportedCapabilityError(
        `Backend "${backend.name}" does not support ${capability.toUpperCase()}.`,
      );
    }
  }

  return {
    backend: backend.name,
    capabilities,
    gpio: {
      async open(options) {
        requireCapability("gpio");
        validateNonNegativeInteger(options.pin, "pin");
        if (!capabilities.gpio?.modes.includes(options.mode)) {
          throw new UnsupportedCapabilityError(
            `Backend "${backend.name}" does not support GPIO mode "${options.mode}".`,
          );
        }
        return backend.openGpio(options);
      },
    },
    uart: {
      async open(options) {
        requireCapability("uart");
        if (options.port.trim().length === 0) {
          throw new InvalidConfigurationError("port must not be empty.");
        }
        validatePositiveInteger(options.baudRate, "baudRate");
        return backend.openUart(options);
      },
    },
    spi: {
      async open(options) {
        requireCapability("spi");
        validateNonNegativeInteger(options.bus, "bus");
        validateNonNegativeInteger(options.chipSelect, "chipSelect");
        validatePositiveInteger(options.clockHz, "clockHz");
        if (options.mode !== undefined && ![0, 1, 2, 3].includes(options.mode)) {
          throw new InvalidConfigurationError("mode must be 0, 1, 2, or 3.");
        }
        return backend.openSpi(options);
      },
    },
    close() {
      if (closePromise === undefined) {
        closed = true;
        closePromise = backend.close();
      }
      return closePromise;
    },
  };
}
