export class HardwareError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class UnsupportedCapabilityError extends HardwareError {}

export class InvalidConfigurationError extends HardwareError {}

export class ResourceBusyError extends HardwareError {}

export class ResourceClosedError extends HardwareError {}
