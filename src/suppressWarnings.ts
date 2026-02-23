/**
 * console.warn 攔截 — 抑制 Three.js 內部噪音警告
 *
 * 此檔案必須是整個應用最先被 import 的模組，
 * 確保在 three.js 任何程式碼執行前即完成 patch。
 */

const SUPPRESSED_WARNINGS = [
  'THREE.Clock: This module has been deprecated',
  'PCFSoftShadowMap has been deprecated',
  "'skinning' is not a property of THREE",
]

const _origWarn = console.warn.bind(console)
console.warn = (...args: unknown[]) => {
  if (
    typeof args[0] === 'string' &&
    SUPPRESSED_WARNINGS.some((s) => (args[0] as string).includes(s))
  ) {
    return
  }
  _origWarn(...args)
}
