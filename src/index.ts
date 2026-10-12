export { MockBackend } from "./backends/mock.js";
export {
  HardwareError,
  InvalidConfigurationError,
  ResourceBusyError,
  ResourceClosedError,
  UnsupportedCapabilityError,
} from "./errors.js";
export { createHardware } from "./hardware.js";
export type { Hardware } from "./hardware.js";
export type {
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
