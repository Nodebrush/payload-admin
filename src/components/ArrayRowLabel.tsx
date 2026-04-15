'use client';

import { useRowLabel } from '@payloadcms/ui';

interface ArrayRowLabelProps {
  fieldName?: string;
  fallback?: string;
}

export default function ArrayRowLabel({ fieldName = 'label', fallback = 'Item' }: ArrayRowLabelProps) {
  const { data, rowNumber } = useRowLabel();

  const typedData = data as Record<string, any>;
  const fieldValue = typedData?.[fieldName];

  return <>{fieldValue || `${fallback} ${String(rowNumber).padStart(2, '0')}`}</>;
}