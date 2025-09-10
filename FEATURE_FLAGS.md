# Feature Flags 運用メモ

ASOBLE では **状態(state.js) 経由**でフラグを持つ前提。例:

```js
// state.js など
export function getFeatureFlags(){
  const v = JSON.parse(localStorage.getItem('asoble:flags')||'{}');
  return { rotation: !!v.rotation, experimentalLayout: !!v.experimentalLayout };
}
export function setFeatureFlag(key, on){
  const v = JSON.parse(localStorage.getItem('asoble:flags')||'{}');
  v[key] = !!on;
  localStorage.setItem('asoble:flags', JSON.stringify(v));
  return getFeatureFlags();
}
```

呼び元では **既定 OFF** で分岐し、描画・入力への影響を最小化。

```js
import { getFeatureFlags } from './state.js';

const { rotation } = getFeatureFlags();
if (rotation) {
  // 新ロジック（旧ロジックには触れない）
} else {
  // 旧ロジック
}
```
