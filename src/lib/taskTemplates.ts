import type { RecordType, TaskCategory } from './types'

export interface TaskTemplate {
  category: TaskCategory
  title: string
  is_optional: boolean
  sort_order: number
}

export const DEFAULT_TASK_TEMPLATES: Record<RecordType, TaskTemplate[]> = {
  checkin: [
    { category: 'default', title: 'Deal Submission',           is_optional: false, sort_order: 1 },
    { category: 'default', title: 'Inspect the Unit',          is_optional: false, sort_order: 2 },
    { category: 'default', title: 'Inventory Photos',          is_optional: false, sort_order: 3 },
    { category: 'default', title: 'Inventory List',            is_optional: false, sort_order: 4 },
    { category: 'default', title: 'Request Meter Reading',     is_optional: false, sort_order: 5 },
    { category: 'default', title: 'Register Tenant',           is_optional: false, sort_order: 6 },
    { category: 'default', title: 'Compiled Stamped TA',       is_optional: false, sort_order: 7 },
    { category: 'default', title: 'Report Sent',               is_optional: false, sort_order: 8 },
  ],
  checkout: [
    { category: 'default', title: 'Inspect the Unit',             is_optional: false, sort_order: 1 },
    { category: 'default', title: 'Request Meter Reading & Bills', is_optional: false, sort_order: 2 },
    { category: 'default', title: 'Request Indah Water Bill',     is_optional: false, sort_order: 3 },
    { category: 'default', title: 'Report Sent',                  is_optional: false, sort_order: 4 },
  ],
  maintenance: [
    { category: 'default', title: 'Report to Management',                         is_optional: false, sort_order: 1 },
    { category: 'default', title: 'Schedule Appointment with Contractor/Tenant',   is_optional: false, sort_order: 2 },
  ],
}

export interface OptionalTaskList {
  category: TaskCategory
  label: string
  items: string[]
}

export const OPTIONAL_TASK_LISTS: Record<RecordType, OptionalTaskList[]> = {
  checkin: [
    {
      category: 'tenant_request',
      label: 'Tenant Requests',
      items: [
        'Cleaning',
        'Cleaning & Steam Cleaning',
        'Steam Clean Only',
        'Air-cond Service',
        'Pest Control',
        'Water Purifier',
        'Water Filter',
        'Microwave',
        'Vacuum',
        'Panasonic Washlet',
        'Gas Tank',
        'Install Floor Trap',
        'Others',
      ],
    },
    {
      category: 'repair',
      label: 'Repair Needed',
      items: [
        'Change Lightbulb',
        'Change Batteries',
        'Replace Ceiling Fan',
        'Repair Plug Point',
        'Fix Grouting at Bath Tub',
        'Others',
      ],
    },
  ],
  checkout: [
    {
      category: 'todo',
      label: 'To-Do',
      items: [
        'Cleaning',
        'Cleaning & Steam Cleaning',
        'Steam Clean Only',
        'Air-cond Service',
        'Purchase New Water Filter',
        'Others',
      ],
    },
    {
      category: 'repair',
      label: 'Repair Needed',
      items: [
        'Change Lightbulb',
        'Change Batteries',
        'Replace Ceiling Fan',
        'Repair Plug Point',
        'Fix Grouting at Bath Tub',
        'Wall Touch Up Painting',
        'Fix Flooring',
        'Others',
      ],
    },
  ],
  maintenance: [
    {
      category: 'type_of_repair',
      label: 'Type of Repair',
      items: [
        'Ceiling Leaking',
        'Change Lightbulb',
        'Replace Ceiling Fan',
        'Repair Plug Point',
        'Fix Grouting at Bath Tub',
        'Wall Touch Up Painting',
        'Fix Flooring',
        'Others',
      ],
    },
  ],
}
