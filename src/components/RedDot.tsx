/**
 * RedDot — 通用紅點提示元件
 *
 * 用於任何需要提示使用者有未處理事項的位置。
 * 支援顯示數字（如未讀信件數量）或純紅點。
 *
 * @example
 *   <RedDot />                    // 純紅點
 *   <RedDot count={5} />          // 顯示數字 5
 *   <RedDot count={120} />        // 顯示 99+
 *   <RedDot size="sm" />          // 小尺寸（預設 md）
 */

interface RedDotProps {
  /** 顯示的數字（省略或 0 = 純紅點無數字） */
  count?: number
  /** 尺寸：sm=小(8px) md=中(16px) */
  size?: 'sm' | 'md'
  /** 額外 className */
  className?: string
  /** 額外 style */
  style?: React.CSSProperties
}

export function RedDot({ count, size = 'md', className = '', style }: RedDotProps) {
  const isSm = size === 'sm'
  const hasCount = count != null && count > 0
  const displayText = hasCount ? (count > 99 ? '99+' : String(count)) : ''

  return (
    <span
      className={`red-dot ${isSm ? 'red-dot-sm' : 'red-dot-md'} ${hasCount ? 'red-dot-numbered' : 'red-dot-plain'} ${className}`}
      style={style}
    >
      {displayText}
    </span>
  )
}
