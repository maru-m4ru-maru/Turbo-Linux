# ⚡️Turbo-Linux⚡️
🚨注意🚨
Linux**風**であり、本物のLinuxではありません！

## TurboOS
`turbo-os-cms-v2.js` は現在、TurboWarp の**ステージを仮想ディスプレイ**として使う TurboOS のコア実装です。

### 現在の構成
- UIをScratchブロックから個別に作るCMS方式は廃止
- TurboWarpのステージへOS画面を直接描画
- OSの起動・再起動・終了
- OS内部の状態をフレーム単位で進行
- `OSを1f進める` ブロックでOSを正確に1フレーム進められる
- OSの状態と現在のフレーム数を取得

### 起動の流れ
`OSを起動` → `OSを1f進める` を繰り返すことで、Firmware → Kernel → Services → Desktop とOSが進みます。

TurboOS は Unsandboxed の TurboWarp カスタム拡張機能として動作します。
