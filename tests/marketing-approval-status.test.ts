import { describe, expect, it } from 'vitest'

import {
  approvalStatusAccentClass,
  approvalStatusIcon,
  approvalStatusLabel,
  approvalStatusToneClass,
} from '~/utils/marketing-approval-status'

describe('marketing-approval-status', () => {
  it('labels overdue pending distinctly', () => {
    expect(approvalStatusLabel('pending', true)).toBe('Atrasado')
    expect(approvalStatusLabel('pending', false)).toBe('Pendente')
    expect(approvalStatusLabel('changes_requested')).toBe('Alterações solicitadas')
  })

  it('maps tones for hierarchy in inbox and sheet', () => {
    expect(approvalStatusToneClass('approved')).toContain('emerald')
    expect(approvalStatusToneClass('rejected')).toContain('destructive')
    expect(approvalStatusToneClass('pending', true)).toContain('destructive')
    expect(approvalStatusAccentClass('changes_requested')).toContain('orange')
  })

  it('picks icons for status badges', () => {
    expect(approvalStatusIcon('approved')).toContain('check')
    expect(approvalStatusIcon('rejected')).toContain('x-circle')
    expect(approvalStatusIcon('pending', true)).toContain('alarm')
  })
})
