import type { ItemSelection } from './inventoryCatalog'

export interface CustomItemSelection extends ItemSelection {
  customLabel?: string
}

export interface AreaData {
  id: string
  templateKey: string
  title: string
  items: CustomItemSelection[]
}

export interface Inventory {
  id: string
  unit_id: string | null
  heading: string | null
  short_address?: string | null
  inventory_date: string
  areas: AreaData[]
  include_meter_reading: boolean
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}
