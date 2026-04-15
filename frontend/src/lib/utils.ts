import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatConfidence(score: number): string {
  return `${Math.round(score * 100)}%`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`
  }
  return `${(ms / 1000).toFixed(2)}s`
}

export function getDocTypeColor(docType: string): string {
  const colors: Record<string, string> = {
    'CEA_GUIDELINE': 'bg-blue-100 text-blue-800',
    'TECHNICAL_MANUAL': 'bg-green-100 text-green-800',
    'IT_CIRCULAR': 'bg-purple-100 text-purple-800',
    'TEXT_DOCUMENT': 'bg-gray-100 text-gray-800',
  }
  return colors[docType] || 'bg-gray-100 text-gray-800'
}

export function getEquipmentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    'TRANSFORMER': 'Transformer',
    'CIRCUIT_BREAKER': 'Circuit Breaker',
    'TRANSMISSION_LINE': 'Transmission Line',
    'SUBSTATION_BAY': 'Substation Bay',
    'PROTECTION_SYSTEM': 'Protection System',
    'PROTECTION_RELAY': 'Protection Relay',
    'INSULATOR': 'Insulator',
    'BUSBAR': 'Busbar',
    'CURRENT_TRANSFORMER': 'Current Transformer',
    'POTENTIAL_TRANSFORMER': 'Potential Transformer',
    'VOLTAGE_TRANSFORMER': 'Voltage Transformer',
  }
  return labels[type] || type
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

export const EQUIPMENT_TYPES = [
  { value: 'TRANSFORMER', label: 'Transformer' },
  { value: 'CIRCUIT_BREAKER', label: 'Circuit Breaker' },
  { value: 'TRANSMISSION_LINE', label: 'Transmission Line' },
  { value: 'SUBSTATION_BAY', label: 'Substation Bay' },
  { value: 'PROTECTION_SYSTEM', label: 'Protection System' },
  { value: 'PROTECTION_RELAY', label: 'Protection Relay' },
  { value: 'INSULATOR', label: 'Insulator' },
  { value: 'BUSBAR', label: 'Busbar' },
  { value: 'CURRENT_TRANSFORMER', label: 'Current Transformer' },
  { value: 'POTENTIAL_TRANSFORMER', label: 'Potential Transformer' },
  { value: 'VOLTAGE_TRANSFORMER', label: 'Voltage Transformer' },
] as const

export const VOLTAGE_LEVELS = [
  { value: '66 kV', label: '66 kV' },
  { value: '132 kV', label: '132 kV' },
  { value: '220 kV', label: '220 kV' },
  { value: '400 kV', label: '400 kV' },
  { value: '765 kV', label: '765 kV' },
  { value: '1200 kV', label: '1200 kV' },
] as const

export const DOC_TYPES = [
  { value: 'CEA_GUIDELINE', label: 'CEA Guideline' },
  { value: 'TECHNICAL_MANUAL', label: 'Technical Manual' },
  { value: 'IT_CIRCULAR', label: 'IT Circular' },
] as const
