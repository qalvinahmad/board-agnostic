# board-agnostic

[English](README.md) · [Bahasa Indonesia](README.id.md) · **简体中文** · [日本語](README.ja.md) · [한국어](README.ko.md)

[![CI](https://github.com/qalvinahmad/board-agnostic/actions/workflows/ci.yml/badge.svg)](https://github.com/qalvinahmad/board-agnostic/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

面向 JavaScript 和 Node.js、轻量且以 TypeScript 为先的硬件抽象层。

应用可以通过统一 API 使用 GPIO、UART 和 SPI，平台专用后端负责处理不同开发板及运行环境之间的差异。

> **状态：早期开发。** 核心 API 和可用的模拟后端已经实现。目前尚未实现或验证任何真实开发板后端，API 也可能发生变化。

## 为什么需要 board-agnostic？

不同硬件库提供不同的 API 和访问方式。Raspberry Pi 可以使用主机操作系统驱动，而 Arduino 和 ESP32 通常需要固件以及串口或网络桥接。外设能力、时序、引脚映射、权限和配置要求也因平台而异。

本项目为应用代码提供统一契约，同时明确保留这些硬件差异：

- **独立的外设 API**：GPIO、UART 和 SPI 分别定义。
- **显式的后端能力**：应用可以查询后端实际支持的功能。
- **可插拔后端**：扩展平台支持时无需将核心绑定到单一开发板。
- **模拟后端**：无需实体硬件即可测试应用逻辑。
- **TypeScript 优先**：提供类型定义、输入验证和生命周期错误。

## 当前可用功能

| 组件 | 状态 |
| --- | --- |
| 核心硬件 API 和能力查询 | 已实现 |
| GPIO 输入/输出模拟 | 已实现 |
| UART 缓冲读取和写入模拟 | 已实现 |
| SPI 传输模拟 | 已实现（回环或可配置响应） |
| Linux / Raspberry Pi 后端 | 尚未实现 |
| Arduino / ESP32 桥接 | 尚未实现 |
| Tessel 2 后端 | 仍需研究 |

模拟行为仅用于开发和测试，不代表已经验证真实硬件兼容性或实时性能。

## 环境要求

- Node.js 22 或更高版本
- npm

## 开始使用

目前尚未发布到 npm。可以克隆仓库并在本地试用：

```sh
git clone https://github.com/qalvinahmad/board-agnostic.git
cd board-agnostic
npm ci
npm test
npm run typecheck
npm run build
```

发布后可通过 `npm install board-agnostic` 安装。

## 使用示例

以下示例使用项目内置的模拟后端。该 API 已实现并经过测试：

```ts
import { createHardware, MockBackend } from "board-agnostic";

const backend = new MockBackend();
const hardware = createHardware({ backend });

const led = await hardware.gpio.open({ pin: 17, mode: "output" });
await led.write(true);
await led.close();

const uart = await hardware.uart.open({
  port: "mock:device",
  baudRate: 115200,
});
await uart.write(new Uint8Array([0x48, 0x69]));
backend.injectUartData("mock:device", new Uint8Array([0x4f, 0x4b]));
console.log(await uart.read({ timeoutMs: 1000 })); // Uint8Array [79, 75]
await uart.close();

const spi = await hardware.spi.open({
  bus: 0,
  chipSelect: 0,
  clockHz: 1_000_000,
});
console.log(await spi.transfer(new Uint8Array([0x01, 0x02])));
await spi.close();

await hardware.close();
```

不带参数的 `uart.read()` 是非阻塞的：返回后端当前缓冲的数据；如果没有数据则返回空数组。传入 `{ timeoutMs }` 可在指定时间内等待数据，传入 `{ signal }` 可等待数据或 `AbortSignal` 取消。超时返回空数组；取消时以 `OperationAbortedError` 拒绝。真实后端必须遵循此契约，并说明硬件相关的时序和缓冲特性。

模拟 SPI 默认回传发送的字节。要测试特定设备响应，可在打开设备前通过 `backend.setSpiResponder(0, 0, (transmitted) => new Uint8Array([0x42]))` 配置响应函数。这有助于测试响应处理，但不模拟设备协议、时序或片选行为。

## 后端能力

使用外设前请先检查能力。能力表示后端支持的功能，并不保证特定引脚或设备可用：

```ts
const hardware = createHardware({ backend: new MockBackend() });

if (hardware.capabilities.gpio?.modes.includes("input")) {
  const button = await hardware.gpio.open({ pin: 4, mode: "input" });
  console.log(await button.read());
  await button.close();
}

await hardware.close();
```

模拟后端提供 `setInputValue(pin, value)` 以模拟外部输入，并提供 `injectUartData(port, data)` 以模拟接收 UART 数据。

## 架构

```text
应用程序
    |
核心 API（GPIO / UART / SPI、类型、能力、生命周期）
    |
后端（模拟、本机、串口桥接或自定义实现）
    |
操作系统驱动 / 传输层 / 固件
    |
硬件
```

核心为每种外设定义独立契约。后端只需实现其声明支持的外设；如果声明支持某项功能却没有对应的 `open` 方法，初始化时会报错。核心会跟踪已打开的资源，在关闭时等待正在进行的打开操作，先关闭所有资源再关闭后端，并汇总清理错误。未来的 Raspberry Pi 后端可以访问本机硬件，微控制器后端则可以通过串口或网络与固件通信。

## 硬件安全

本库不会验证电气安全。连接硬件前，请检查开发板和外设的数据手册、电压等级、电流限制、引脚映射和接线。本库不能替代电气审查或硬件保护措施。

## 开发

```sh
npm ci
npm test
npm run typecheck
npm run build
```

测试使用模拟后端，不需要实体设备。测试通过并不代表真实硬件行为已得到验证。

当前软件包仅支持 ESM 导入；不支持 CommonJS `require()`。

## 路线图

- [x] 定义核心 API、生命周期、能力查询和类型化错误。
- [x] 为 GPIO、UART 和 SPI 添加模拟后端。
- [ ] 添加真实主机后端并在受支持硬件上验证。
- [ ] 为微控制器定义带版本的固件桥接协议。
- [ ] 发布配置指南和经过验证的兼容性矩阵。
- [ ] 探索 I²C、PWM 和中断支持。

## 参与贡献

欢迎为 API 设计、后端、固件协议、测试和硬件兼容性报告做出贡献。新增后端时，请说明支持的外设、操作系统要求、配置方式、限制和测试流程。进行较大的或不兼容的 API 改动前，请先创建 issue 讨论。

请参阅 [CONTRIBUTING.md](CONTRIBUTING.md) 了解开发设置和 pull request 检查，并参阅 [SECURITY.md](SECURITY.md) 了解私下报告漏洞的方式。

## 许可证

本项目使用 MIT 许可证。详见 [LICENSE](LICENSE)。
