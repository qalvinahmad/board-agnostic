export { MockBackend } from "./backends/mock.js";
export {
  BackendConfigurationError,
  HardwareError,
  InvalidConfigurationError,
  OperationAbortedError,
  ResourceBusyError,
  ResourceClosedError,
  UnsupportedCapabilityError,
} from "./errors.js";
export { createHardware } from "./hardware.js";
export type { Hardware } from "./hardware.js";
export type {
  GpioBackend,
  GpioMode,
  GpioOpenOptions,
  GpioPin,
  HardwareBackend,
  HardwareCapabilities,
  SpiBus,
  SpiBackend,
  SpiOpenOptions,
  UartOpenOptions,
  UartBackend,
  UartReadOptions,
  UartPort,
} from "./types.js";
export type { MockSpiResponder } from "./backends/mock.js";
