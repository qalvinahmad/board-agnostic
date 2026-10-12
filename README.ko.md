# board-agnostic

[English](README.md) · [Bahasa Indonesia](README.id.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · **한국어**

JavaScript 및 Node.js를 위한 경량 TypeScript 우선 하드웨어 추상화 계층입니다.

애플리케이션은 GPIO, UART, SPI에 하나의 API를 사용하고, 플랫폼별 백엔드가 보드와 실행 환경 간의 차이를 처리합니다.

> **상태: 초기 개발 단계.** 코어 API와 동작하는 모의 백엔드가 제공됩니다. 실제 보드용 백엔드는 아직 구현하거나 검증하지 않았으며 API는 변경될 수 있습니다.

## 왜 board-agnostic인가요?

하드웨어 라이브러리마다 API와 접근 방식이 다릅니다. Raspberry Pi는 호스트 운영체제 드라이버를 사용할 수 있지만, Arduino와 ESP32는 일반적으로 펌웨어와 시리얼 또는 네트워크 브리지가 필요합니다. 주변 장치 기능, 타이밍, 핀 매핑, 권한 및 설정 요구사항도 플랫폼마다 다릅니다.

이 프로젝트는 하드웨어 차이를 숨기지 않으면서 애플리케이션 코드에 공통 계약을 제공합니다.

- **GPIO, UART, SPI별로 분리된 API**
- **백엔드 지원 기능을 확인할 수 있는 명시적 capability**
- **코어를 특정 보드에 종속시키지 않는 플러그형 백엔드**
- **실제 하드웨어 없이 애플리케이션 로직을 테스트하는 모의 백엔드**
- **타입 정의, 입력 검증, lifecycle 오류를 갖춘 TypeScript 우선 인터페이스**

## 현재 제공 기능

| 구성 요소 | 상태 |
| --- | --- |
| 코어 하드웨어 API 및 capability 탐색 | 구현됨 |
| GPIO 입력/출력 모의 기능 | 구현됨 |
| UART 버퍼 읽기/쓰기 모의 기능 | 구현됨 |
| SPI 전송 모의 기능 | 구현됨 (loopback 응답) |
| Linux / Raspberry Pi 백엔드 | 미구현 |
| Arduino / ESP32 브리지 | 미구현 |
| Tessel 2 백엔드 | 조사 필요 |

모의 동작은 개발 및 테스트용이며 실제 하드웨어 호환성이나 실시간 성능을 입증하지 않습니다.

## 요구 사항

- Node.js 20 이상
- npm

## 시작하기

아직 npm에 패키지를 배포하지 않았습니다. 현재 구현을 로컬에서 사용하려면 다음을 실행하세요.

```sh
git clone https://github.com/qalvinahmad/board-agnostic-public.git
cd board-agnostic-public
npm install
npm run build
```

배포 후에는 `npm install board-agnostic`으로 설치할 수 있습니다.

## 사용 예제

다음 예제는 구현되어 테스트를 통과한 모의 백엔드를 사용합니다.

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
console.log(await uart.read()); // Uint8Array [79, 75]
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

`uart.read()`는 백엔드에 현재 버퍼링된 데이터를 반환하며, 데이터가 없으면 빈 배열을 반환합니다. 실제 백엔드의 타이밍과 버퍼링 동작은 다를 수 있으므로 각 백엔드 문서에 명시해야 합니다.

## 백엔드 capability

주변 장치를 사용하기 전에 capability를 확인하세요. capability는 백엔드가 지원하는 기능을 나타내며 특정 핀이나 장치의 사용 가능성을 보장하지는 않습니다.

```ts
const hardware = createHardware({ backend: new MockBackend() });

if (hardware.capabilities.gpio?.modes.includes("input")) {
  const button = await hardware.gpio.open({ pin: 4, mode: "input" });
  console.log(await button.read());
  await button.close();
}

await hardware.close();
```

모의 백엔드의 `setInputValue(pin, value)`는 외부 입력을, `injectUartData(port, data)`는 수신 UART 데이터를 시뮬레이션합니다.

## 아키텍처

```text
애플리케이션
    |
코어 API (GPIO / UART / SPI, 타입, capability, lifecycle)
    |
백엔드 (모의, 호스트 네이티브, 시리얼 브리지 또는 사용자 구현)
    |
운영체제 드라이버 / 전송 계층 / 펌웨어
    |
하드웨어
```

코어는 주변 장치별로 별도의 계약을 정의합니다. 백엔드는 자신이 선언한 기능만 구현합니다. 향후 Raspberry Pi 백엔드는 호스트에서 하드웨어에 접근하고, 마이크로컨트롤러 백엔드는 시리얼이나 네트워크로 펌웨어와 통신할 수 있습니다.

## 개발

```sh
npm install
npm test
npm run build
```

테스트는 모의 백엔드를 사용하므로 실제 장치가 필요하지 않습니다. 테스트 통과가 실제 하드웨어 동작 검증을 의미하지는 않습니다.

## 로드맵

- [x] 코어 API, lifecycle, capability 탐색 및 타입 오류 정의
- [x] GPIO, UART, SPI 모의 백엔드 추가
- [ ] 실제 호스트 백엔드 구현 및 지원 하드웨어에서 검증
- [ ] 마이크로컨트롤러용 버전 관리 펌웨어 브리지 설계
- [ ] 설정 가이드와 검증된 호환성 표 제공
- [ ] I²C, PWM, 인터럽트 지원 검토

## 기여하기

API 설계, 백엔드, 펌웨어 프로토콜, 테스트 및 하드웨어 호환성 보고서 기여를 환영합니다. 새 백엔드에는 지원 주변 장치, 운영체제 요구사항, 설정 방법, 제한사항 및 테스트 절차를 문서화해 주세요. 대규모 변경이나 호환성을 깨는 API 변경 전에 issue를 열어 논의해 주세요.

## 라이선스

아직 라이선스를 선택하지 않았습니다. 저장소에 라이선스가 추가되기 전까지는 오픈 소스 라이선스로 재사용할 수 있다고 가정하지 마세요.
