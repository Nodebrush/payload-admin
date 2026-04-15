'use client'

import React from 'react'
import { useField, TextareaInput, FieldLabel } from '@payloadcms/ui'
import type { TextareaFieldClientProps } from 'payload'

const TextareaWithCounter: React.FC<TextareaFieldClientProps> = (props) => {
  const {
    field: { label, localized, maxLength = 155, required },
    readOnly,
  } = props

  const {
    errorMessage,
    path,
    setValue,
    showError,
    value,
  } = useField<string>({ path: props.path }) // ← Add path here

  const currentLength = value?.length || 0
  const remaining = maxLength - currentLength

  const getColor = () => {
    if (remaining < 0) return '#914a54' // red
    if (remaining < 20) return '#9f7e51' // orange
    return '#5c8f67' // green
  }

  return (
    <div style={{ marginBottom: '20px' }}>
      <FieldLabel
        label={label}
        localized={localized}
        path={path}
        required={required}
      />

      <TextareaInput
        Error={errorMessage}
        onChange={setValue}
        path={path}
        readOnly={readOnly}
        required={required}
        showError={showError}
        value={value || ''}
        style={{ marginBottom: '8px' }}
      />

      <div style={{
        fontSize: '14px',
        color: getColor(),
        fontWeight: '500'
      }}>
        {currentLength}/{maxLength} characters
        {remaining > 0 ? ` (${remaining} remaining)` : ' (over limit)'}
      </div>
    </div>
  )
}

// Make sure you have a default export
export default TextareaWithCounter