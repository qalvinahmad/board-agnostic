import {
  BackendConfigurationError,
  InvalidConfigurationError,
  ResourceClosedError,
  UnsupportedCapabilityError,
} from "./errors.js";
import type {
  GpioMode,
  GpioOpenOptions,
  GpioPin,
  HardwareBackend,
  HardwareCapabilities,
  SpiBus,
  SpiOpenOptions,
  UartOpenOptions,
  UartPort,
} from "./types.js";

interface Closable {
  close(): Promise<void>;
}

export interface Hardware {
  readonly backend: string;
  readonly capabilities: HardwareCapabilities;
  readonly gpio: {
    open(options: GpioOpenOptions): Promise<GpioPin>;
  };
  readonly uart: {
    open(options: UartOpenOptions): Promise<UartPort>;
  };
  readonly spi: {
    open(options: SpiOpenOptions): Promise<SpiBus>;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateBackend(backend: unknown): asserts backend is HardwareBackend {
  if (!isRecord(backend)) {
    throw new BackendConfigurationError("Backend must be an object.");
  }
  if (typeof backend.name !== "string" || backend.name.trim().length === 0) {
    throw new BackendConfigurationError("Backend name must be a non-empty string.");
  }
  if (typeof backend.close !== "function") {
    throw new BackendConfigurationError(`Backend "${backend.name}" must implement close().`);
  }
  if (!isRecord(backend.capabilities)) {
    throw new BackendConfigurationError(
      `Backend "${backend.name}" capabilities must be an object.`,
    );
  }

  const capabilityConfig = backend.capabilities;
  if ("gpio" in capabilityConfig && capabilityConfig.gpio !== undefined) {
    if (!isRecord(capabilityConfig.gpio) || !Array.isArray(capabilityConfig.gpio.modes)) {
      throw new BackendConfigurationError(
        `Backend "${backend.name}" GPIO capabilities must define a modes array.`,
      );
    }
    const modes: unknown[] = capabilityConfig.gpio.modes;
    if (
      modes.length === 0 ||
      modes.some((mode) => mode !== "input" && mode !== "output") ||
      new Set(modes).size !== modes.length
    ) {
      throw new BackendConfigurationError(
        `Backend "${backend.name}" GPIO modes must be a non-empty list of unique "input" or "output" values.`,
      );
    }
  }

  for (const peripheral of ["uart", "spi"] as const) {
    if (peripheral in capabilityConfig && typeof capabilityConfig[peripheral] !== "boolean") {
      throw new BackendConfigurationError(
        `Backend "${backend.name}" ${peripheral.toUpperCase()} capability must be a boolean.`,
      );
    }
  }

  const contracts = [
    ["GPIO", capabilityConfig.gpio !== undefined, backend.openGpio],
    ["UART", capabilityConfig.uart === true, backend.openUart],
    ["SPI", capabilityConfig.spi === true, backend.openSpi],
  ] as const;

  for (const [name, advertised, open] of contracts) {
    if (advertised && typeof open !== "function") {
      throw new BackendConfigurationError(
        `Backend "${backend.name}" advertises ${name} support but does not implement its open method.`,
      );
    }
    if (open !== undefined && typeof open !== "function") {
      throw new BackendConfigurationError(
        `Backend "${backend.name}" ${name} open method must be a function when provided.`,
      );
    }
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
  if (!isRecord(options) || !("backend" in options)) {
    throw new BackendConfigurationError("createHardware() requires a backend object.");
  }
  const backendCandidate: unknown = options.backend;
  validateBackend(backendCandidate);
  const backend = backendCandidate;

  let closed = false;
  let closePromise: Promise<void> | undefined;
  const capabilities = copyCapabilities(backend.capabilities);
  const resources = new Set<Closable>();
  const pendingOpens = new Set<Promise<unknown>>();
  const cleanupErrors: unknown[] = [];

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

  function trackResource<T extends Closable>(resource: T): T {
    let resourceClosed = false;
    let resourceClosePromise: Promise<void> | undefined;

    const closeResource = (): Promise<void> => {
      if (resourceClosePromise === undefined) {
        resourceClosed = true;
        resourceClosePromise = Promise.resolve()
          .then(() => resource.close())
          .finally(() => resources.delete(trackedResource));
      }
      return resourceClosePromise;
    };

    const trackedResource = new Proxy(resource, {
      get(target, property) {
        if (property === "close") {
          return closeResource;
        }
        const value = Reflect.get(target, property, target) as unknown;
        if (typeof value !== "function") {
          return value;
        }
        return (...args: unknown[]) => {
          if (closed || resourceClosed) {
            return Promise.reject(new ResourceClosedError("The hardware resource is closed."));
          }
          return Reflect.apply(value, target, args) as unknown;
        };
      },
    });

    resources.add(trackedResource);
    return trackedResource;
  }

  function openResource<T extends Closable>(open: () => Promise<T>): Promise<T> {
    assertOpen();
    let operation: Promise<T>;
    operation = Promise.resolve()
      .then(open)
      .then(async (resource) => {
        const tracked = trackResource(resource);
        if (closed) {
          try {
            await tracked.close();
          } catch (error) {
            cleanupErrors.push(error);
            throw new ResourceClosedError("The hardware connection closed while opening a resource.", {
              cause: error,
            });
          }
          throw new ResourceClosedError("The hardware connection closed while opening a resource.");
        }
        return tracked;
      })
      .finally(() => pendingOpens.delete(operation));
    pendingOpens.add(operation);
    return operation;
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
        return openResource(() => backend.openGpio!(options));
      },
    },
    uart: {
      async open(options) {
        requireCapability("uart");
        if (options.port.trim().length === 0) {
          throw new InvalidConfigurationError("port must not be empty.");
        }
        validatePositiveInteger(options.baudRate, "baudRate");
        return openResource(() => backend.openUart!(options));
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
        return openResource(() => backend.openSpi!(options));
      },
    },
    close() {
      if (closePromise === undefined) {
        closed = true;
        closePromise = (async () => {
          await Promise.allSettled([...pendingOpens]);
          const errors = [...cleanupErrors];
          const results = await Promise.allSettled([...resources].map((resource) => resource.close()));
          for (const result of results) {
            if (result.status === "rejected") {
              errors.push(result.reason);
            }
          }
          try {
            await backend.close();
          } catch (error) {
            errors.push(error);
          }
          if (errors.length > 0) {
            throw new AggregateError(errors, "One or more hardware resources failed to close.");
          }
        })();
      }
      return closePromise;
    },
  };
}
