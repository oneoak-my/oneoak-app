/**
 * One Oak - master inventory catalogue.
 * Compiled from 12 real inventory lists (Ooak Residence, Ooak Suites, Park Place, Astrea, TWY, Arcoris,
 * Solaris Parq, Inspirasi). Every item in every source list is reachable from this catalogue.
 *
 * How the app should use it
 *  - AREA_TEMPLATES: the "types of area" you can add to a unit (Entrance, Living, Bedroom...). A unit can have
 *    many bedrooms/bathrooms: add the Bedroom template several times and rename it (Master Bedroom, 2nd Bedroom).
 *  - Each template shows its STANDARD items first (found in 3+ lists); the rest sit under "More items".
 *  - "Add from another area" searches ALL_ITEMS, and "Type manually" adds a free-text row.
 *  - renderItemLabel() prints a row exactly the way the existing Word lists do.
 */

export type ItemKind =
  | 'qty'              // plain item with a quantity
  | 'breakdown_rooms'  // qty = sum of per-room counts, e.g. Bedroom keys (Master: 1 | Bedroom 2: 1)
  | 'breakdown_cards'  // qty = sum of per-type counts, e.g. Access card (M: 1 | R: 1)
  | 'location'         // qty plus free-text detail, e.g. Parking lot (Level 2F | Lot 105, 106)
  | 'notgiven'         // can be marked "Not given" (qty 0)
  | 'reading'          // meter reading row (value filled at check-in / check-out)

export interface CatalogItem {
  id: string
  label: string              // default wording
  defaultQty: string         // usually "1"; "1 set" is also used in the source lists
  brandGroup?: keyof typeof BRAND_OPTIONS | null   // adds a Brand dropdown (+ "Other...")
  hasSize?: boolean          // adds a Size dropdown (mattress)
  variants: string[]         // alternative wordings, e.g. the 4 curtain types. Empty = no choice
  kind: ItemKind
  seenIn: Record<string, number>   // how many of the 12 lists contain it, per area template
  standardIn: string[]       // area templates where it is a standard (shown-by-default) item
}

export interface AreaTemplate {
  key: string
  title: string
  aka: string[]              // other headings used in the source lists
  sourceLists: number        // how many of the 12 lists have this area
  itemIds: string[]          // every item for this area, standard ones first
  standardIds: string[]
}

/** Brand dropdown options. Only brands that appear in your lists; the app should let you add new ones
 *  ("Other..." -> type -> saved to the list for next time). */
export const BRAND_OPTIONS = {
  "aircon": [
    "Daikin",
    "Midea",
    "Mitsubishi",
    "Panasonic",
    "Trane"
  ],
  "fridge": [
    "Beko",
    "Bosch",
    "Electrolux",
    "LG",
    "Samsung",
    "Sharp"
  ],
  "tv": [
    "Hisense",
    "Philips",
    "Prism",
    "Samsung",
    "Sharp",
    "Toshiba"
  ],
  "laundry": [
    "Beko",
    "Electrolux",
    "Samsung",
    "Sharp",
    "Toshiba"
  ],
  "microwave": [
    "Bosch",
    "Electrolux",
    "Rubine",
    "Samsung",
    "Sharp",
    "Toshiba"
  ],
  "oven": [
    "Dessini",
    "Electrolux"
  ],
  "hood": [
    "Bosch",
    "Electrolux",
    "Firenzzi",
    "Haier",
    "Midea",
    "Signature",
    "Teka"
  ],
  "hob": [
    "Bosch",
    "Electrolux",
    "Firenzzi",
    "Haier",
    "Rubine",
    "Teka"
  ],
  "lock": [
    "Bosch",
    "Igloohome",
    "Samsung",
    "Sceiner"
  ],
  "fan": [
    "Alpha",
    "Cosa",
    "Mistral",
    "Panasonic"
  ],
  "purifier": [
    "Panasonic"
  ],
  "kettle": [
    "Faber",
    "Philips"
  ],
  "vacuum": [
    "Philips",
    "Xiaomi"
  ],
  "iron": [
    "Tefal"
  ],
  "cabinets": [
    "Signature"
  ]
} as const

export const SIZE_OPTIONS = ["Single", "Queen", "King"] as const

export const CURTAIN_TYPES = [
  "Curtains with sheers and back-ties",
  "Single layer curtains with back-ties only (no sheers)",
  "Curtains with sheers without back-ties",
  "Ceiling height curtains with sheers"
] as const

/** Quick-pick chips for the breakdown fields */
export const ACCESS_CARD_CHIPS = ['M', 'R', 'Carpark', 'Lift'] as const            // e.g. Access card (M: 1 | R: 1)
export const BEDROOM_KEY_CHIPS = ['Master', 'Bedroom 2', 'Bedroom 3', 'Bedroom 4', 'Study room'] as const

/** Suggested order of sections in the generated list (letters A, B, C... are assigned automatically). */
export const DEFAULT_AREA_ORDER = ['entrance', 'living', 'dining_kitchen', 'wet_kitchen', 'bathroom', 'bedroom', 'keys', 'meter'] as const

export const ALL_ITEMS: Record<string, CatalogItem> = {
  "door_bell": {"id": "door_bell", "label": "Door bell", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"entrance": 11}, "standardIn": ["entrance"]},
  "digital_lock": {"id": "digital_lock", "label": "Digital lock", "defaultQty": "1", "brandGroup": "lock", "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"entrance": 7}, "standardIn": ["entrance"]},
  "shoe_cabinet": {"id": "shoe_cabinet", "label": "Shoe cabinet", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Shoe cabinet", "Built-in shoe cabinet", "Built-in shoe cabinet with seat"], "kind": "qty", "seenIn": {"entrance": 5}, "standardIn": ["entrance"]},
  "intercom": {"id": "intercom", "label": "Intercom", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"entrance": 4}, "standardIn": ["entrance"]},
  "grille_gate": {"id": "grille_gate", "label": "Grille gate", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"entrance": 3}, "standardIn": ["entrance"]},
  "shoe_rack": {"id": "shoe_rack", "label": "Shoe rack", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"entrance": 2}, "standardIn": []},
  "wall_rack": {"id": "wall_rack", "label": "Wall rack", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"entrance": 1, "living": 4, "dining_kitchen": 2, "bedroom": 5}, "standardIn": ["living", "bedroom"]},
  "disposal_bin": {"id": "disposal_bin", "label": "Disposal bin", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Disposal bin", "Rubbish bin"], "kind": "qty", "seenIn": {"entrance": 1, "dining_kitchen": 3, "bathroom": 2}, "standardIn": ["dining_kitchen"]},
  "storage_cabinet": {"id": "storage_cabinet", "label": "Storage cabinet with drawer", "defaultQty": "1 set", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"entrance": 1}, "standardIn": []},
  "aircon": {"id": "aircon", "label": "Air conditioner", "defaultQty": "1", "brandGroup": "aircon", "hasSize": false, "variants": ["Air conditioner", "Cassette air conditioner", "Air-cond with remote control"], "kind": "qty", "seenIn": {"living": 12, "dining_kitchen": 4, "bedroom": 11}, "standardIn": ["living", "dining_kitchen", "bedroom"]},
  "tv": {"id": "tv", "label": "Smart TV", "defaultQty": "1", "brandGroup": "tv", "hasSize": false, "variants": ["Smart TV", "TV", "Wall mounted smart TV"], "kind": "qty", "seenIn": {"living": 12}, "standardIn": ["living"]},
  "tv_cabinet": {"id": "tv_cabinet", "label": "TV cabinet", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["TV cabinet", "TV console cabinet", "Built-in TV cabinet", "Built-in wall TV cabinet", "Built-in TV console cabinet with wardrobe"], "kind": "qty", "seenIn": {"living": 12}, "standardIn": ["living"]},
  "coffee_table": {"id": "coffee_table", "label": "Coffee table", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Coffee table", "Coffee table with decorative vase", "Coffee table with table runner", "Storage basket/Coffee table"], "kind": "qty", "seenIn": {"living": 12}, "standardIn": ["living"]},
  "curtains": {"id": "curtains", "label": "Curtains", "defaultQty": "2", "brandGroup": null, "hasSize": false, "variants": ["Curtains with sheers and back-ties", "Single layer curtains with back-ties only (no sheers)", "Curtains with sheers without back-ties", "Ceiling height curtains with sheers"], "kind": "qty", "seenIn": {"living": 11, "bedroom": 9}, "standardIn": ["living", "bedroom"]},
  "ceiling_fan": {"id": "ceiling_fan", "label": "Ceiling fan with remote control", "defaultQty": "1", "brandGroup": "fan", "hasSize": false, "variants": ["Ceiling fan with remote control", "Ceiling fan"], "kind": "qty", "seenIn": {"living": 10, "bedroom": 11}, "standardIn": ["living", "bedroom"]},
  "throw_cushion": {"id": "throw_cushion", "label": "Throw cushions with cover", "defaultQty": "4", "brandGroup": null, "hasSize": false, "variants": ["Throw cushions with cover", "Throw cushion with cover", "Throw cushion", "Throw pillow with cover", "Throw pillow"], "kind": "qty", "seenIn": {"living": 9, "bedroom": 5}, "standardIn": ["living", "bedroom"]},
  "carpet": {"id": "carpet", "label": "Carpet", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Carpet", "Floor carpet", "Floor rug"], "kind": "qty", "seenIn": {"living": 8, "bedroom": 1}, "standardIn": ["living"]},
  "sofa3": {"id": "sofa3", "label": "3 seater sofa", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"living": 7}, "standardIn": ["living"]},
  "floor_lamp": {"id": "floor_lamp", "label": "Standing lamp", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"living": 5}, "standardIn": ["living"]},
  "chair1": {"id": "chair1", "label": "Single seater chair", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Single seater chair", "Single seat lounge chair", "Lounge chair with small pillow", "Single seat armchair"], "kind": "qty", "seenIn": {"living": 4, "bedroom": 1}, "standardIn": ["living"]},
  "track_light": {"id": "track_light", "label": "LED track light", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"living": 4}, "standardIn": ["living"]},
  "sofa2": {"id": "sofa2", "label": "2 seater sofa", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["2 seater sofa", "2 seater fabric sofa"], "kind": "qty", "seenIn": {"living": 3}, "standardIn": ["living"]},
  "sofa_side": {"id": "sofa_side", "label": "Sofa side table", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Sofa side table", "Side table"], "kind": "qty", "seenIn": {"living": 3, "bedroom": 1}, "standardIn": ["living"]},
  "decor_vase": {"id": "decor_vase", "label": "Decorative vase", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Decorative vase", "Decorative mini vase", "Vase", "Decorative vase with artificial plant", "Decorative items"], "kind": "qty", "seenIn": {"living": 3, "dining_kitchen": 1, "bedroom": 1}, "standardIn": ["living"]},
  "sofa_l": {"id": "sofa_l", "label": "L-shape sofa", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["L-shape sofa", "3 seater L-shape sofa", "3 seater L-shape fabric sofa"], "kind": "qty", "seenIn": {"living": 2, "bedroom": 1}, "standardIn": []},
  "throw_blanket": {"id": "throw_blanket", "label": "Throw blanket", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"living": 2, "bedroom": 3}, "standardIn": ["bedroom"]},
  "wall_clock": {"id": "wall_clock", "label": "Wall clock", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Wall clock", "Clock"], "kind": "qty", "seenIn": {"living": 2, "dining_kitchen": 2}, "standardIn": []},
  "wall_artwork": {"id": "wall_artwork", "label": "Wall artwork", "defaultQty": "4", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"living": 2, "dining_kitchen": 2, "bedroom": 1}, "standardIn": []},
  "clothes_rack": {"id": "clothes_rack", "label": "Clothes drying rack", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"living": 2, "bedroom": 1}, "standardIn": []},
  "standing_fan": {"id": "standing_fan", "label": "Standing fan", "defaultQty": "1", "brandGroup": "fan", "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"living": 2}, "standardIn": []},
  "dining_table": {"id": "dining_table", "label": "Dining table", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Dining table", "6 seater dining table", "Island table", "Island dining table", "Built-in dining table", "Built-in island table with storage cabinet"], "kind": "qty", "seenIn": {"living": 2, "dining_kitchen": 12}, "standardIn": ["dining_kitchen"]},
  "table_lamp": {"id": "table_lamp", "label": "Table lamp", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"living": 1, "bedroom": 2}, "standardIn": []},
  "wall_shelves": {"id": "wall_shelves", "label": "Wall shelves", "defaultQty": "3", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"living": 1}, "standardIn": []},
  "plant": {"id": "plant", "label": "Artificial plant", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Artificial plant", "Decorative plant"], "kind": "qty", "seenIn": {"living": 1, "dining_kitchen": 1}, "standardIn": []},
  "photo_frame": {"id": "photo_frame", "label": "Photo frame", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"living": 1}, "standardIn": []},
  "vacuum": {"id": "vacuum", "label": "Vacuum", "defaultQty": "1", "brandGroup": "vacuum", "hasSize": false, "variants": ["Vacuum", "Cordless vacuum"], "kind": "qty", "seenIn": {"living": 1, "bedroom": 1}, "standardIn": []},
  "kettle": {"id": "kettle", "label": "Electric kettle", "defaultQty": "1", "brandGroup": "kettle", "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"living": 1, "dining_kitchen": 1}, "standardIn": []},
  "fridge": {"id": "fridge", "label": "Refrigerator", "defaultQty": "1", "brandGroup": "fridge", "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"dining_kitchen": 12}, "standardIn": ["dining_kitchen"]},
  "kitchen_cabinets": {"id": "kitchen_cabinets", "label": "Built-in top & bottom kitchen cabinets", "defaultQty": "1", "brandGroup": "cabinets", "hasSize": false, "variants": ["Built-in top & bottom kitchen cabinets", "Built-in top & bottom kitchen cabinets & racks", "Built-in top & bottom kitchen cabinets with lighting", "Built-in bottom kitchen cabinets"], "kind": "qty", "seenIn": {"dining_kitchen": 12, "wet_kitchen": 2}, "standardIn": ["dining_kitchen", "wet_kitchen"]},
  "kitchen_sink": {"id": "kitchen_sink", "label": "Kitchen faucet & water basin", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Kitchen faucet & water basin", "Kitchen faucet & double bowl wash basin", "Kitchen faucet & single bowl wash basin", "Kitchen faucet & single bowl sink", "Kitchen faucet with single bowl kitchen sink", "Water tap & water basin", "Water tap & basin", "Water tap & wash basin"], "kind": "qty", "seenIn": {"dining_kitchen": 12, "wet_kitchen": 2}, "standardIn": ["dining_kitchen", "wet_kitchen"]},
  "pendant_light": {"id": "pendant_light", "label": "Pendant light", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"dining_kitchen": 11, "bedroom": 1}, "standardIn": ["dining_kitchen"]},
  "hood": {"id": "hood", "label": "Cooker hood", "defaultQty": "1", "brandGroup": "hood", "hasSize": false, "variants": ["Cooker hood", "Kitchen hood"], "kind": "qty", "seenIn": {"dining_kitchen": 11, "wet_kitchen": 2}, "standardIn": ["dining_kitchen", "wet_kitchen"]},
  "hob": {"id": "hob", "label": "Induction hob with 2 zones", "defaultQty": "1", "brandGroup": "hob", "hasSize": false, "variants": ["Induction hob with 2 zones", "Induction hob with 3 zones", "Induction hob with 4 zones", "Electric hob with 1 zone", "Electric hob with 2 zones", "Gas hob", "Gas hob with 2 zones"], "kind": "qty", "seenIn": {"dining_kitchen": 11, "wet_kitchen": 2}, "standardIn": ["dining_kitchen", "wet_kitchen"]},
  "dining_chairs": {"id": "dining_chairs", "label": "Dining chairs", "defaultQty": "4", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"dining_kitchen": 10}, "standardIn": ["dining_kitchen"]},
  "microwave": {"id": "microwave", "label": "Microwave", "defaultQty": "1", "brandGroup": "microwave", "hasSize": false, "variants": ["Microwave", "Built-in microwave"], "kind": "qty", "seenIn": {"dining_kitchen": 8}, "standardIn": ["dining_kitchen"]},
  "washer_dryer": {"id": "washer_dryer", "label": "2-in-1 washer dryer", "defaultQty": "1", "brandGroup": "laundry", "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"dining_kitchen": 5, "wet_kitchen": 1, "bathroom": 1}, "standardIn": ["dining_kitchen"]},
  "washer": {"id": "washer", "label": "Washing machine", "defaultQty": "1", "brandGroup": "laundry", "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"dining_kitchen": 4, "wet_kitchen": 1}, "standardIn": ["dining_kitchen"]},
  "dryer": {"id": "dryer", "label": "Dryer", "defaultQty": "1", "brandGroup": "laundry", "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"dining_kitchen": 4}, "standardIn": ["dining_kitchen"]},
  "purifier": {"id": "purifier", "label": "Water purifier", "defaultQty": "1", "brandGroup": "purifier", "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"dining_kitchen": 4}, "standardIn": ["dining_kitchen"]},
  "oven": {"id": "oven", "label": "Oven", "defaultQty": "1", "brandGroup": "oven", "hasSize": false, "variants": ["Oven", "Built-in oven", "Mini oven"], "kind": "qty", "seenIn": {"dining_kitchen": 3, "wet_kitchen": 1}, "standardIn": ["dining_kitchen"]},
  "high_chairs": {"id": "high_chairs", "label": "High chairs", "defaultQty": "2", "brandGroup": null, "hasSize": false, "variants": ["High chairs", "Dining high chair"], "kind": "qty", "seenIn": {"dining_kitchen": 2}, "standardIn": []},
  "dish_rack": {"id": "dish_rack", "label": "Dish drying rack", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"dining_kitchen": 2}, "standardIn": []},
  "roller_blinds": {"id": "roller_blinds", "label": "Roller blinds", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Roller blinds", "Roller blind"], "kind": "qty", "seenIn": {"dining_kitchen": 2, "wet_kitchen": 1, "bedroom": 3, "bathroom": 1}, "standardIn": ["bedroom"]},
  "plates": {"id": "plates", "label": "Plates & bowls", "defaultQty": "8", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"dining_kitchen": 1}, "standardIn": []},
  "teapot": {"id": "teapot", "label": "Tea pot with cups", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"dining_kitchen": 1}, "standardIn": []},
  "sliding_door": {"id": "sliding_door", "label": "Sliding door", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"dining_kitchen": 1}, "standardIn": []},
  "ladder": {"id": "ladder", "label": "Foldable ladder", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Foldable ladder", "Step ladder"], "kind": "qty", "seenIn": {"dining_kitchen": 1, "bedroom": 1}, "standardIn": []},
  "bedframe": {"id": "bedframe", "label": "Bedframe", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Bedframe", "Bedframe with headboard", "Bed frame with bottom storage cabinet", "Bed frame with headboard & 2 built-in storage rack", "Built-in bedframe with headboard"], "kind": "qty", "seenIn": {"bedroom": 12}, "standardIn": ["bedroom"]},
  "mattress": {"id": "mattress", "label": "Mattress with bed sheet", "defaultQty": "1", "brandGroup": null, "hasSize": true, "variants": ["Mattress with bed sheet", "Mattress", "Mattress with mattress protector", "Mattress with mattress protector sheet"], "kind": "qty", "seenIn": {"bedroom": 12}, "standardIn": ["bedroom"]},
  "bedside_table": {"id": "bedside_table", "label": "Bedside table", "defaultQty": "2", "brandGroup": null, "hasSize": false, "variants": ["Bedside table", "Bedside table with drawers", "Built-in bedside table"], "kind": "qty", "seenIn": {"bedroom": 11}, "standardIn": ["bedroom"]},
  "wardrobe": {"id": "wardrobe", "label": "Built-in wardrobe", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Built-in wardrobe", "Wardrobe", "Built-in wardrobe with sliding door", "Built-in wardrobe with drawers", "Ceiling height built-in wardrobe with 1 glass door", "Wardrobe with built-in mirror"], "kind": "qty", "seenIn": {"bedroom": 11}, "standardIn": ["bedroom"]},
  "study_chair": {"id": "study_chair", "label": "Study chair", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Study chair", "Chair"], "kind": "qty", "seenIn": {"bedroom": 11}, "standardIn": ["bedroom"]},
  "study_table": {"id": "study_table", "label": "Study table", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Study table", "Study desk", "Study table with drawers", "L-shape study table with drawers", "Built-in table with drawer"], "kind": "qty", "seenIn": {"bedroom": 9}, "standardIn": ["bedroom"]},
  "pillow": {"id": "pillow", "label": "Pillow with cover", "defaultQty": "2", "brandGroup": null, "hasSize": false, "variants": ["Pillow with cover", "Pillow", "Pillow cover"], "kind": "qty", "seenIn": {"bedroom": 8}, "standardIn": ["bedroom"]},
  "bedside_pendant": {"id": "bedside_pendant", "label": "Bedside pendant light", "defaultQty": "2", "brandGroup": null, "hasSize": false, "variants": ["Bedside pendant light", "Bedside pendant lamp", "Bedside wall light"], "kind": "qty", "seenIn": {"bedroom": 6}, "standardIn": ["bedroom"]},
  "dressing_mirror": {"id": "dressing_mirror", "label": "Dressing mirror", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Dressing mirror", "Wall mirror", "Mirror"], "kind": "qty", "seenIn": {"bedroom": 5}, "standardIn": ["bedroom"]},
  "duvet": {"id": "duvet", "label": "Duvet cover", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Duvet cover", "Duvet", "Duvet with cover", "Blanket with cover"], "kind": "qty", "seenIn": {"bedroom": 4}, "standardIn": ["bedroom"]},
  "bedside_lamp": {"id": "bedside_lamp", "label": "Bedside table lamp", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"bedroom": 4}, "standardIn": ["bedroom"]},
  "dressing_table": {"id": "dressing_table", "label": "Dressing table", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Dressing table", "Built-in dressing table with mirror"], "kind": "qty", "seenIn": {"bedroom": 2}, "standardIn": []},
  "ironing_board": {"id": "ironing_board", "label": "Ironing board", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"bedroom": 2}, "standardIn": []},
  "headboard": {"id": "headboard", "label": "Built-in headboard with back light", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"bedroom": 1}, "standardIn": []},
  "dressing_stool": {"id": "dressing_stool", "label": "Dressing stool", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"bedroom": 1}, "standardIn": []},
  "iron": {"id": "iron", "label": "Iron", "defaultQty": "1", "brandGroup": "iron", "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"bedroom": 1}, "standardIn": []},
  "cushion_seat": {"id": "cushion_seat", "label": "Built-in cushion seat", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"bedroom": 1}, "standardIn": []},
  "toilet": {"id": "toilet", "label": "Toilet bowl", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Toilet bowl", "Toilet bowl with Panasonic washlet"], "kind": "qty", "seenIn": {"bathroom": 12}, "standardIn": ["bathroom"]},
  "tissue_holder": {"id": "tissue_holder", "label": "Toilet roll holder", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"bathroom": 12}, "standardIn": ["bathroom"]},
  "bidet": {"id": "bidet", "label": "Hand bidet", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"bathroom": 12}, "standardIn": ["bathroom"]},
  "shower_set": {"id": "shower_set", "label": "Hand shower set with storage heater", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Hand shower set with storage heater", "Head & hand shower set with storage heater", "Rain & hand shower set with storage heater", "Hand shower set with heater", "Hand shower set", "Head & hand shower set with storage heater / shower head with filter"], "kind": "qty", "seenIn": {"bathroom": 12}, "standardIn": ["bathroom"]},
  "vanity_mirror": {"id": "vanity_mirror", "label": "Vanity mirror", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Vanity mirror", "Vanity mirror with storage cabinet", "Mirror", "Wall mirror"], "kind": "qty", "seenIn": {"bathroom": 12}, "standardIn": ["bathroom"]},
  "shower_screen": {"id": "shower_screen", "label": "Shower screen", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"bathroom": 11}, "standardIn": ["bathroom"]},
  "vanity": {"id": "vanity", "label": "Vanity countertop with wash basin", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Vanity countertop with wash basin", "Vanity countertop with wash basin and cabinet", "Vanity countertop with 2 wash basin", "Vanity countertop with 2 wash basin and cabinet", "Vanity countertop with sink", "Vanity countertop with cabinets and sink"], "kind": "qty", "seenIn": {"bathroom": 10}, "standardIn": ["bathroom"]},
  "soap_rack": {"id": "soap_rack", "label": "Soap rack", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"bathroom": 5}, "standardIn": ["bathroom"]},
  "basin": {"id": "basin", "label": "Wash basin with tap", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Wash basin with tap", "Wash basin", "Water tap & wash basin"], "kind": "qty", "seenIn": {"bathroom": 4}, "standardIn": ["bathroom"]},
  "towel_rack": {"id": "towel_rack", "label": "Towel rack", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Towel rack", "Towel hook", "Towel hook & rack"], "kind": "qty", "seenIn": {"bathroom": 4}, "standardIn": ["bathroom"]},
  "clothes_hook": {"id": "clothes_hook", "label": "Clothes hook", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Clothes hook", "Clothes hook & rack", "Clothes rack"], "kind": "qty", "seenIn": {"bathroom": 3}, "standardIn": ["bathroom"]},
  "shower_curtain": {"id": "shower_curtain", "label": "Shower curtain", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"bathroom": 1}, "standardIn": []},
  "bathtub": {"id": "bathtub", "label": "Bath tub", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"bathroom": 1}, "standardIn": []},
  "storage_rack": {"id": "storage_rack", "label": "Storage rack", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"bathroom": 1}, "standardIn": []},
  "ac_remote": {"id": "ac_remote", "label": "Air-conditioner remote control", "defaultQty": "3", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"keys": 12}, "standardIn": ["keys"]},
  "tv_remote": {"id": "tv_remote", "label": "TV remote control", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"keys": 12}, "standardIn": ["keys"]},
  "access_card": {"id": "access_card", "label": "Access card", "defaultQty": "2", "brandGroup": null, "hasSize": false, "variants": [], "kind": "breakdown_cards", "seenIn": {"keys": 12}, "standardIn": ["keys"]},
  "fan_remote": {"id": "fan_remote", "label": "Ceiling fan remote control", "defaultQty": "2", "brandGroup": null, "hasSize": false, "variants": ["Ceiling fan remote control", "Wall mounted ceiling fan control"], "kind": "qty", "seenIn": {"keys": 11}, "standardIn": ["keys"]},
  "mailbox_key": {"id": "mailbox_key", "label": "Mailbox key", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"keys": 11}, "standardIn": ["keys"]},
  "parking_lot": {"id": "parking_lot", "label": "Parking lot", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "location", "seenIn": {"keys": 10}, "standardIn": ["keys"]},
  "bedroom_keys": {"id": "bedroom_keys", "label": "Bedroom keys", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "breakdown_rooms", "seenIn": {"keys": 9}, "standardIn": ["keys"]},
  "main_key": {"id": "main_key", "label": "Main door key", "defaultQty": "2", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"keys": 6}, "standardIn": ["keys"]},
  "lock_key": {"id": "lock_key", "label": "Digital lock key", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Digital lock key", "Digital key"], "kind": "qty", "seenIn": {"keys": 6}, "standardIn": ["keys"]},
  "grille_key": {"id": "grille_key", "label": "Grille door key", "defaultQty": "2", "brandGroup": null, "hasSize": false, "variants": ["Grille door key", "Grille door", "Grille gate key"], "kind": "qty", "seenIn": {"keys": 4}, "standardIn": ["keys"]},
  "lock_card": {"id": "lock_card", "label": "Digital lock card", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Digital lock card", "Digital lock access card", "Digital lock tag"], "kind": "qty", "seenIn": {"keys": 4}, "standardIn": ["keys"]},
  "yard_key": {"id": "yard_key", "label": "Yard door key", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": ["Yard door key", "Yard", "Yard door"], "kind": "qty", "seenIn": {"keys": 3}, "standardIn": ["keys"]},
  "parking_card": {"id": "parking_card", "label": "Parking access card", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "location", "seenIn": {"keys": 1}, "standardIn": []},
  "mailbox_lock": {"id": "mailbox_lock", "label": "Mailbox number lock", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "location", "seenIn": {"keys": 1}, "standardIn": []},
  "rfid": {"id": "rfid", "label": "RFID sticker", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "qty", "seenIn": {"keys": 1}, "standardIn": []},
  "study_key": {"id": "study_key", "label": "Study room key", "defaultQty": "0", "brandGroup": null, "hasSize": false, "variants": [], "kind": "notgiven", "seenIn": {"keys": 1}, "standardIn": []},
  "meter_water": {"id": "meter_water", "label": "Water", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "reading", "seenIn": {"meter": 1}, "standardIn": ["meter"]},
  "meter_elec": {"id": "meter_elec", "label": "Electricity", "defaultQty": "1", "brandGroup": null, "hasSize": false, "variants": [], "kind": "reading", "seenIn": {"meter": 1}, "standardIn": ["meter"]},
}

export const AREA_TEMPLATES: AreaTemplate[] = [
  {"key": "entrance", "title": "Entrance", "aka": ["ENTRANCE"], "sourceLists": 12, "itemIds": ["door_bell", "digital_lock", "shoe_cabinet", "intercom", "grille_gate", "shoe_rack", "wall_rack", "disposal_bin", "storage_cabinet"], "standardIds": ["door_bell", "digital_lock", "shoe_cabinet", "intercom", "grille_gate"]},
  {"key": "living", "title": "Living Area", "aka": ["LIVING AREA", "LIVING HALL", "LIVING HALL & BALCONY", "LIVING AREA & BED AREA (studio)"], "sourceLists": 12, "itemIds": ["aircon", "tv", "tv_cabinet", "coffee_table", "curtains", "ceiling_fan", "throw_cushion", "carpet", "sofa3", "floor_lamp", "chair1", "track_light", "wall_rack", "sofa2", "sofa_side", "decor_vase", "sofa_l", "throw_blanket", "wall_clock", "wall_artwork", "clothes_rack", "standing_fan", "dining_table", "table_lamp", "wall_shelves", "plant", "photo_frame", "vacuum", "kettle"], "standardIds": ["aircon", "tv", "tv_cabinet", "coffee_table", "curtains", "ceiling_fan", "throw_cushion", "carpet", "sofa3", "floor_lamp", "chair1", "track_light", "wall_rack", "sofa2", "sofa_side", "decor_vase"]},
  {"key": "dining_kitchen", "title": "Dining Area & Dry Kitchen", "aka": ["DINING AREA & DRY KITCHEN", "DRY KITCHEN & DINING AREA", "DRY KITCHEN", "DINING AREA"], "sourceLists": 12, "itemIds": ["dining_table", "fridge", "kitchen_cabinets", "kitchen_sink", "pendant_light", "hood", "hob", "dining_chairs", "microwave", "washer_dryer", "washer", "dryer", "purifier", "aircon", "oven", "disposal_bin", "high_chairs", "dish_rack", "wall_rack", "wall_artwork", "wall_clock", "roller_blinds", "kettle", "plates", "teapot", "sliding_door", "ladder", "decor_vase", "plant"], "standardIds": ["dining_table", "fridge", "kitchen_cabinets", "kitchen_sink", "pendant_light", "hood", "hob", "dining_chairs", "microwave", "washer_dryer", "washer", "dryer", "purifier", "aircon", "oven", "disposal_bin"]},
  {"key": "wet_kitchen", "title": "Wet Kitchen & Yard", "aka": ["WET KITCHEN", "WET KITCHEN & YARD"], "sourceLists": 2, "itemIds": ["kitchen_cabinets", "kitchen_sink", "hood", "hob", "oven", "washer", "washer_dryer", "roller_blinds"], "standardIds": ["kitchen_cabinets", "kitchen_sink", "hood", "hob"]},
  {"key": "bedroom", "title": "Bedroom", "aka": ["MASTER BEDROOM", "2ND BEDROOM", "BEDROOM 3", "BEDROOM 4", "THIRD ROOM", "STUDY ROOM", "HELPER ROOM"], "sourceLists": 12, "itemIds": ["bedframe", "mattress", "bedside_table", "wardrobe", "aircon", "ceiling_fan", "study_chair", "curtains", "study_table", "pillow", "bedside_pendant", "throw_cushion", "wall_rack", "dressing_mirror", "duvet", "bedside_lamp", "throw_blanket", "roller_blinds", "dressing_table", "table_lamp", "ironing_board", "headboard", "dressing_stool", "clothes_rack", "iron", "vacuum", "wall_artwork", "decor_vase", "cushion_seat", "ladder", "pendant_light", "carpet", "chair1", "sofa_l", "sofa_side"], "standardIds": ["bedframe", "mattress", "bedside_table", "wardrobe", "aircon", "ceiling_fan", "study_chair", "curtains", "study_table", "pillow", "bedside_pendant", "throw_cushion", "wall_rack", "dressing_mirror", "duvet", "bedside_lamp", "throw_blanket", "roller_blinds"]},
  {"key": "bathroom", "title": "Bathroom", "aka": ["MASTER BATHROOM", "SHARED BATHROOM", "BATHROOM 2/3/4", "HELPER BATHROOM"], "sourceLists": 12, "itemIds": ["toilet", "tissue_holder", "bidet", "shower_set", "vanity_mirror", "shower_screen", "vanity", "soap_rack", "basin", "towel_rack", "clothes_hook", "disposal_bin", "roller_blinds", "shower_curtain", "bathtub", "storage_rack", "washer_dryer"], "standardIds": ["toilet", "tissue_holder", "bidet", "shower_set", "vanity_mirror", "shower_screen", "vanity", "soap_rack", "basin", "towel_rack", "clothes_hook"]},
  {"key": "keys", "title": "Controls / Keys / Access Cards", "aka": ["CONTROLS/KEY/ACCESS CARD"], "sourceLists": 12, "itemIds": ["ac_remote", "tv_remote", "access_card", "fan_remote", "mailbox_key", "parking_lot", "bedroom_keys", "main_key", "lock_key", "grille_key", "lock_card", "yard_key", "parking_card", "mailbox_lock", "rfid", "study_key"], "standardIds": ["ac_remote", "tv_remote", "access_card", "fan_remote", "mailbox_key", "parking_lot", "bedroom_keys", "main_key", "lock_key", "grille_key", "lock_card", "yard_key"]},
  {"key": "meter", "title": "Meter Reading", "aka": ["METER READING (optional)"], "sourceLists": 1, "itemIds": ["meter_water", "meter_elec"], "standardIds": ["meter_water", "meter_elec"]},
]

// ---------------------------------------------------------------------------------------------
// Rendering: prints an item the way the existing Word lists do
// ---------------------------------------------------------------------------------------------

export interface ItemSelection {
  itemId: string
  variant?: string                       // chosen wording (one of item.variants) or custom text
  brand?: string                         // "Sharp"
  size?: string                          // "King"
  qty: number | string
  remarks?: string                       // "the stand is loose", "Spare"
  parts?: { label: string; qty: number }[]   // breakdown_rooms / breakdown_cards
  detail?: string                        // location text: "Level 2F | Lot 105, 106"
  notGiven?: boolean
}

export function breakdownTotal(parts: { qty: number }[] = []): number {
  return parts.reduce((sum, p) => sum + (Number(p.qty) || 0), 0)
}

/** e.g. "Refrigerator (Brand: Sharp)", "Mattress with bed sheet (Size: King)", "Access card (M: 1 | R: 1)" */
export function renderItemLabel(item: CatalogItem, sel: ItemSelection): string {
  const base = (sel.variant || item.label).trim()
  const bracket: string[] = []
  const attrs: string[] = []
  if (sel.brand) attrs.push(`Brand: ${sel.brand}`)
  if (sel.size) attrs.push(`Size: ${sel.size}`)
  if (attrs.length) bracket.push(attrs.join(' | '))
  const parts = (sel.parts ?? []).filter((p) => Number(p.qty) > 0)
  if (parts.length) bracket.push(parts.map((p) => `${p.label}: ${p.qty}`).join(' | '))
  if (sel.remarks && sel.remarks.trim()) bracket.push(sel.remarks.trim())
  return bracket.length ? `${base} (${bracket.join(' | ')})` : base
}

/** Quantity column. Breakdown items total their parts; "Not given" prints 0. */
export function renderItemQty(item: CatalogItem, sel: ItemSelection): string {
  if (sel.notGiven) return '0'
  if ((item.kind === 'breakdown_rooms' || item.kind === 'breakdown_cards') && sel.parts?.length) {
    return String(breakdownTotal(sel.parts))
  }
  return String(sel.qty)
}

/** Text for the "Check In" column (the source lists put parking level/lot and "Not given" here). */
export function renderItemCheckInNote(item: CatalogItem, sel: ItemSelection): string {
  if (sel.notGiven) return 'Not given'
  return item.kind === 'location' ? (sel.detail ?? '') : ''
}
