/**
 * elementSystem 單元測試
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { getElementMultiplier, isWeakness, isResist, loadElementMatrix } from '../elementSystem'

describe('elementSystem', () => {
  describe('getElementMultiplier', () => {
    it('同屬性 → 0.9', () => {
      expect(getElementMultiplier('fire', 'fire')).toBe(0.9)
      expect(getElementMultiplier('dark', 'dark')).toBe(0.9)
    })

    it('克制關係 → 1.3', () => {
      expect(getElementMultiplier('fire', 'wind')).toBe(1.3)
      expect(getElementMultiplier('water', 'fire')).toBe(1.3)
      expect(getElementMultiplier('wind', 'earth')).toBe(1.3)
      expect(getElementMultiplier('thunder', 'water')).toBe(1.3)
      expect(getElementMultiplier('earth', 'thunder')).toBe(1.3)
      expect(getElementMultiplier('light', 'dark')).toBe(1.3)
      expect(getElementMultiplier('dark', 'light')).toBe(1.3)
    })

    it('被剋制 → 0.7', () => {
      expect(getElementMultiplier('fire', 'water')).toBe(0.7)
      expect(getElementMultiplier('water', 'thunder')).toBe(0.7)
      expect(getElementMultiplier('wind', 'fire')).toBe(0.7)
    })

    it('無關 → 1.0', () => {
      expect(getElementMultiplier('fire', 'thunder')).toBe(1.0)
      expect(getElementMultiplier('fire', 'earth')).toBe(1.0)
      expect(getElementMultiplier('light', 'fire')).toBe(1.0)
    })

    it('空屬性 → 1.0', () => {
      expect(getElementMultiplier('', 'fire')).toBe(1.0)
      expect(getElementMultiplier('fire', '')).toBe(1.0)
      expect(getElementMultiplier('', '')).toBe(1.0)
      expect(getElementMultiplier(undefined, 'fire')).toBe(1.0)
    })
  })

  describe('isWeakness', () => {
    it('克制 → true', () => {
      expect(isWeakness('fire', 'wind')).toBe(true)
    })
    it('非克制 → false', () => {
      expect(isWeakness('fire', 'water')).toBe(false)
      expect(isWeakness('fire', 'fire')).toBe(false)
    })
    it('空屬性 → false', () => {
      expect(isWeakness('', 'fire')).toBe(false)
    })
  })

  describe('isResist', () => {
    it('被剋制 → true', () => {
      expect(isResist('fire', 'water')).toBe(true)
    })
    it('同屬性（0.9）不算抵抗', () => {
      expect(isResist('fire', 'fire')).toBe(false)
    })
    it('空屬性 → false', () => {
      expect(isResist('', 'fire')).toBe(false)
    })
  })

  describe('loadElementMatrix', () => {
    it('覆蓋後查表正確', () => {
      loadElementMatrix([
        { attacker: 'fire', defender: 'fire', multiplier: 2.0 },
        { attacker: 'fire', defender: 'water', multiplier: 0.5 },
      ])
      expect(getElementMultiplier('fire', 'fire')).toBe(2.0)
      expect(getElementMultiplier('fire', 'water')).toBe(0.5)

      // 重新載入預設（避免影響其他測試）
      loadElementMatrix([
        { attacker: 'fire', defender: 'fire', multiplier: 0.9 },
        { attacker: 'fire', defender: 'water', multiplier: 0.7 },
        { attacker: 'fire', defender: 'wind', multiplier: 1.3 },
        { attacker: 'fire', defender: 'thunder', multiplier: 1.0 },
        { attacker: 'fire', defender: 'earth', multiplier: 1.0 },
        { attacker: 'fire', defender: 'light', multiplier: 1.0 },
        { attacker: 'fire', defender: 'dark', multiplier: 1.0 },
      ])
    })
  })
})
