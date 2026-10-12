# board-agnostic

[English](README.md) · [Bahasa Indonesia](README.id.md) · [简体中文](README.zh-CN.md) · **日本語** · [한국어](README.ko.md)

JavaScript と Node.js 向けの、軽量で TypeScript を重視したハードウェア抽象化レイヤーです。

アプリケーション側では GPIO、UART、SPI に共通 API を使用し、プラットフォーム固有のバックエンドがボードや実行環境の違いを処理します。

> **ステータス：初期開発段階。** コア API と動作するモックバックエンドを提供しています。実機向けバックエンドはまだ実装・検証されておらず、API は変更される可能性があります。

## なぜ board-agnostic なのか

ハードウェアライブラリごとに API やアクセス方法が異なります。Raspberry Pi はホスト OS のドライバーを利用できますが、Arduino や ESP32 ではファームウェアとシリアルまたはネットワークブリッジが必要になることが一般的です。周辺機器の機能、タイミング、ピン割り当て、権限、設定もプラットフォームによって異なります。

このプロジェクトは、ハードウェアの違いを隠さずに、アプリケーションコード向けの共通契約を提供します。

- **GPIO、UART、SPI ごとに分離した API**
- **バックエンドが対応する機能を確認できる明示的な capability**
- **コアを特定のボードに依存させない拡張可能なバックエンド**
- **実機なしでアプリケーションロジックを試せるモックバックエンド**
- **型定義、入力検証、ライフサイクルエラーを備えた TypeScript 重視の設計**

## 現在利用できる機能

| コンポーネント | ステータス |
| --- | --- |
| コア API と capability の確認 | 実装済み |
| GPIO 入出力モック | 実装済み |
| UART バッファ読み書きモック | 実装済み |
| SPI 転送モック | 実装済み（ループバック応答） |
| Linux / Raspberry Pi バックエンド | 未実装 |
| Arduino / ESP32 ブリッジ | 未実装 |
| Tessel 2 バックエンド | 要調査 |

モックは開発とテスト用です。実機との互換性やリアルタイム性能を保証するものではありません。

## 必要環境

- Node.js 20 以降
- npm

## はじめに

npm パッケージはまだ公開されていません。現在の実装はローカルで試せます。

```sh
git clone https://github.com/qalvinahmad/board-agnostic-public.git
cd board-agnostic-public
npm install
npm run build
```

公開後は `npm install board-agnostic` でインストールできます。

## 使用例

以下は実装済みでテストされているモックバックエンドの例です。

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

`uart.read()` はバックエンドで現在バッファされているデータを返し、データがなければ空の配列を返します。実際のバックエンドではタイミングやバッファ動作が異なる場合があるため、個別の説明が必要です。

## バックエンドの capability

周辺機器を使う前に capability を確認してください。capability はバックエンドの対応機能を示すもので、特定のピンやデバイスの利用可能性を保証するものではありません。

```ts
const hardware = createHardware({ backend: new MockBackend() });

if (hardware.capabilities.gpio?.modes.includes("input")) {
  const button = await hardware.gpio.open({ pin: 4, mode: "input" });
  console.log(await button.read());
  await button.close();
}

await hardware.close();
```

モックバックエンドの `setInputValue(pin, value)` は外部入力を、`injectUartData(port, data)` は受信 UART データをシミュレートします。

## アーキテクチャ

```text
アプリケーション
    |
コア API（GPIO / UART / SPI、型、capability、ライフサイクル）
    |
バックエンド（モック、ホストネイティブ、シリアルブリッジ、独自実装）
    |
OS ドライバー / トランスポート / ファームウェア
    |
ハードウェア
```

コアは周辺機器ごとに独立した契約を定義します。バックエンドは宣言した機能のみを実装します。将来の Raspberry Pi バックエンドはホスト上でアクセスし、マイコン用バックエンドはシリアルやネットワーク経由でファームウェアと通信できます。

## 開発

```sh
npm install
npm test
npm run build
```

テストはモックバックエンドを使用するため実機は不要です。テストの成功は実機での動作検証を意味しません。

## ロードマップ

- [x] コア API、ライフサイクル、capability 確認、型付きエラーを定義する。
- [x] GPIO、UART、SPI のモックバックエンドを追加する。
- [ ] 実機で検証したホストバックエンドを追加する。
- [ ] マイコン向けのバージョン管理されたファームウェアブリッジを仕様化する。
- [ ] セットアップ手順と検証済み互換性一覧を公開する。
- [ ] I²C、PWM、割り込み対応を検討する。

## コントリビュート

API 設計、バックエンド、ファームウェアプロトコル、テスト、ハードウェア互換性レポートへの貢献を歓迎します。新しいバックエンドでは、対応周辺機器、OS 要件、設定方法、制限事項、テスト手順を文書化してください。大規模な変更や破壊的な API 変更の前に issue を作成してください。

## ライセンス

ライセンスはまだ選定されていません。リポジトリにライセンスが追加されるまでは、オープンソースライセンスで再利用可能とは見なさないでください。
