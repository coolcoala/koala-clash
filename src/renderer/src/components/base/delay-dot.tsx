import { cn } from '@renderer/lib/utils'
import React from 'react'

interface Props {
  // last measured delay in ms, 0 is a timeout
  delay: number
  // sets the colour through `text-*`, the dot is painted with currentColor
  className?: string
}

// Latency as a dot for the `indicator` view. A node that answered gets a filled dot and a timed out
// one a hollow ring, so the two differ by shape as well as colour. The caller puts the exact value
// in a tooltip, the dot itself is hidden from screen readers.
const DelayDot: React.FC<Props> = ({ delay, className }) => (
  <span
    aria-hidden
    className={cn(
      'inline-block size-2 shrink-0 rounded-full',
      delay === 0 ? 'border-[1.5px] border-current' : 'bg-current',
      className
    )}
  />
)

export default DelayDot
