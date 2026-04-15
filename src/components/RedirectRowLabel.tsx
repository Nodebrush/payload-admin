'use client'

import { useRowLabel } from '@payloadcms/ui'

export default function RedirectRowLabel() {
  const { data, rowNumber } = useRowLabel()

  const typedData = data as Record<string, any>
  const from = typedData?.from
  const to = typedData?.to

  if (from && to) {
    return <>{`${from} → ${to}`}</>
  }

  return <>Redirect {String(rowNumber).padStart(2, '0')}</>
}
