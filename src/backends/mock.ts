import {
  InvalidConfigurationError,
  ResourceBusyError,
  ResourceClosedError,
  UnsupportedCapabilityError,
} from "../errors.js";
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
} from "../types.js";

interface Closable {
  close(): Promise<void>;
}

interface MockGpioState {
  readonly mode: GpioMode;
  value: boolean;
}

export class MockBackend implements HardwareBackend {
  readonly name = "mock";
  readonly capabilities: HardwareCapabilities = Object.freeze({
    gpio: Object.freeze({ modes: Object.freeze(["input", "output"] as const) }),
    uart: true,
    spi: true,
  });

  private readonly gpioPins = new Map<number, MockGpioState>();
  private readonly uartPorts = new Map<string, { readonly rx: Uint8Array[]; readonly tx: Uint8Array[] }>();
  private readonly spiDevices = new Set<string>();
  private readonly resources = new Set<Closable>();
  private closed = false;

  private assertOpen(): void {
    if (this.closed) {
      throw new ResourceClosedError("The mock backend is closed.");
    }
  }

  private track<T extends Closable>(resource: T): T {
    this.resources.add(resource);
    return resource;
  }

  async openGpio(options: GpioOpenOptions): Promise<GpioPin> {
    this.assertOpen();
    if (!Number.isSafeInteger(options.pin) || options.pin < 0) {
      throw new InvalidConfigurationError("pin must be a non-negative safe integer.");
    }
    if (!this.capabilities.gpio?.modes.includes(options.mode)) {
      throw new UnsupportedCapabilityError(`GPIO mode "${options.mode}" is not supported.`);
    }
    if (this.gpioPins.has(options.pin)) {
      throw new ResourceBusyError(`GPIO pin ${options.pin} is already open.`);
    }

    const state = { mode: options.mode, value: false };
    this.gpioPins.set(options.pin, state);
    let resourceClosed = false;
    const ensureUsable = () => {
      this.assertOpen();
      if (resourceClosed) {
        throw new ResourceClosedError(`GPIO pin ${options.pin} is closed.`);
      }
    };
    const pin = this.track<GpioPin>({
      pin: options.pin,
      mode: options.mode,
      async read() {
        ensureUsable();
        if (options.mode === "output") {
          throw new InvalidConfigurationError("Cannot read a GPIO pin opened in output mode.");
        }
        return state.value;
      },
      async write(value) {
        ensureUsable();
        if (options.mode === "input") {
          throw new InvalidConfigurationError("Cannot write to a GPIO pin opened in input mode.");
        }
        if (typeof value !== "boolean") {
          throw new InvalidConfigurationError("GPIO value must be a boolean.");
        }
        state.value = value;
      },
      async close() {
        if (!resourceClosed) {
          resourceClosed = true;
          thisBackend.gpioPins.delete(options.pin);
          thisBackend.resources.delete(pin);
        }
      },
    });
    const thisBackend = this;
    return pin;
  }

  async openUart(options: UartOpenOptions): Promise<UartPort> {
    this.assertOpen();
    if (options.port.trim().length === 0) {
      throw new InvalidConfigurationError("port must not be empty.");
    }
    if (!Number.isSafeInteger(options.baudRate) || options.baudRate <= 0) {
      throw new InvalidConfigurationError("baudRate must be a positive safe integer.");
    }
    if (this.uartPorts.has(options.port)) {
      throw new ResourceBusyError(`UART port "${options.port}" is already open.`);
    }

    const state = { rx: [] as Uint8Array[], tx: [] as Uint8Array[] };
    this.uartPorts.set(options.port, state);
    let resourceClosed = false;
    const ensureUsable = () => {
      this.assertOpen();
      if (resourceClosed) {
        throw new ResourceClosedError(`UART port "${options.port}" is closed.`);
      }
    };
    const thisBackend = this;
    const port = this.track<UartPort>({
      port: options.port,
      baudRate: options.baudRate,
      async read() {
        ensureUsable();
        const length = state.rx.reduce((total, chunk) => total + chunk.length, 0);
        const data = new Uint8Array(length);
        let offset = 0;
        for (const chunk of state.rx) {
          data.set(chunk, offset);
          offset += chunk.length;
        }
        state.rx.length = 0;
        return data;
      },
      async write(data) {
        ensureUsable();
        if (!(data instanceof Uint8Array)) {
          throw new InvalidConfigurationError("UART data must be a Uint8Array.");
        }
        state.tx.push(data.slice());
      },
      async close() {
        if (!resourceClosed) {
          resourceClosed = true;
          thisBackend.uartPorts.delete(options.port);
          thisBackend.resources.delete(port);
        }
      },
    });
    return port;
  }

  async openSpi(options: SpiOpenOptions): Promise<SpiBus> {
    this.assertOpen();
    if (!Number.isSafeInteger(options.bus) || options.bus < 0) {
      throw new InvalidConfigurationError("bus must be a non-negative safe integer.");
    }
    if (!Number.isSafeInteger(options.chipSelect) || options.chipSelect < 0) {
      throw new InvalidConfigurationError("chipSelect must be a non-negative safe integer.");
    }
    if (!Number.isSafeInteger(options.clockHz) || options.clockHz <= 0) {
      throw new InvalidConfigurationError("clockHz must be a positive safe integer.");
    }
    const mode = options.mode ?? 0;
    if (![0, 1, 2, 3].includes(mode)) {
      throw new InvalidConfigurationError("mode must be 0, 1, 2, or 3.");
    }

    const key = `${options.bus}:${options.chipSelect}`;
    if (this.spiDevices.has(key)) {
      throw new ResourceBusyError(`SPI device ${key} is already open.`);
    }
    this.spiDevices.add(key);
    let resourceClosed = false;
    const ensureUsable = () => {
      this.assertOpen();
      if (resourceClosed) {
        throw new ResourceClosedError(`SPI device ${key} is closed.`);
      }
    };
    const thisBackend = this;
    const bus = this.track<SpiBus>({
      bus: options.bus,
      chipSelect: options.chipSelect,
      clockHz: options.clockHz,
      mode,
      async transfer(data) {
        ensureUsable();
        if (!(data instanceof Uint8Array)) {
          throw new InvalidConfigurationError("SPI data must be a Uint8Array.");
        }
        return data.slice();
      },
      async close() {
        if (!resourceClosed) {
          resourceClosed = true;
          thisBackend.spiDevices.delete(key);
          thisBackend.resources.delete(bus);
        }
      },
    });
    return bus;
  }

  setInputValue(pin: number, value: boolean): void {
    this.assertOpen();
    const state = this.gpioPins.get(pin);
    if (state === undefined || state.mode !== "input") {
      throw new InvalidConfigurationError(`GPIO pin ${pin} is not open in input mode.`);
    }
    if (typeof value !== "boolean") {
      throw new InvalidConfigurationError("GPIO value must be a boolean.");
    }
    state.value = value;
  }

  injectUartData(port: string, data: Uint8Array): void {
    this.assertOpen();
    const state = this.uartPorts.get(port);
    if (state === undefined) {
      throw new InvalidConfigurationError(`UART port "${port}" is not open.`);
    }
    if (!(data instanceof Uint8Array)) {
      throw new InvalidConfigurationError("UART data must be a Uint8Array.");
    }
    state.rx.push(data.slice());
  }

  getUartWrittenData(port: string): Uint8Array[] {
    this.assertOpen();
    const state = this.uartPorts.get(port);
    if (state === undefined) {
      throw new InvalidConfigurationError(`UART port "${port}" is not open.`);
    }
    return state.tx.map((chunk) => chunk.slice());
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    await Promise.all([...this.resources].map((resource) => resource.close()));
  }
}
