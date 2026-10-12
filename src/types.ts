export type GpioMode = "input" | "output";

export interface GpioOpenOptions {
  readonly pin: number;
  readonly mode: GpioMode;
}

export interface UartOpenOptions {
  readonly port: string;
  readonly baudRate: number;
}

export interface SpiOpenOptions {
  readonly bus: number;
  readonly chipSelect: number;
  readonly clockHz: number;
  readonly mode?: 0 | 1 | 2 | 3;
}

export interface HardwareCapabilities {
  readonly gpio?: {
    readonly modes: readonly GpioMode[];
  };
  readonly uart?: boolean;
  readonly spi?: boolean;
}

export interface GpioPin {
  readonly pin: number;
  readonly mode: GpioMode;
  read(): Promise<boolean>;
  write(value: boolean): Promise<void>;
  close(): Promise<void>;
}

export interface UartPort {
  readonly port: string;
  readonly baudRate: number;
  read(): Promise<Uint8Array>;
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export interface SpiBus {
  readonly bus: number;
  readonly chipSelect: number;
  readonly clockHz: number;
  readonly mode: 0 | 1 | 2 | 3;
  transfer(data: Uint8Array): Promise<Uint8Array>;
  close(): Promise<void>;
}

export interface HardwareBackend {
  readonly name: string;
  readonly capabilities: HardwareCapabilities;
  openGpio(options: GpioOpenOptions): Promise<GpioPin>;
  openUart(options: UartOpenOptions): Promise<UartPort>;
  openSpi(options: SpiOpenOptions): Promise<SpiBus>;
  close(): Promise<void>;
}
