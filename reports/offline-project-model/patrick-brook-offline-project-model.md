# Patrick Brook / Chat Test Offline HBXL Project Model

Offline report only. No database, API, UI, assignment, buying, payment, commit, push, or deploy action is performed by this model.

## Summary

- DXF-detected physical work areas: 10
- Derived project/package zones: 6
- Trades/packages detected: 10
- Measurable items created: 80
- Drawing objects linked: 67
- HBXL resources linked: 402
- Exact matches: 14
- Review-required items: 66

## DXF-Detected Physical Work Areas

- Bathroom (room, DXF_ROOM_LABEL)
- Bedroom 2 (room, DXF_ROOM_LABEL)
- Bedroom 3 (room, DXF_ROOM_LABEL)
- Exterior (non-room, DXF_OBJECT_ALLOCATION)
- Kitchen (room, DXF_ROOM_LABEL)
- Laundry (room, DXF_ROOM_LABEL)
- Lounge (room, DXF_ROOM_LABEL)
- Main Bedroom (room, DXF_ROOM_LABEL)
- Passage (room, DXF_ROOM_LABEL)
- TV Room (room, DXF_ROOM_LABEL)

## Derived Project / Package Zones

- Elevation (SUPPORTED_PLACEHOLDER)
- External Works (SUPPORTED_PLACEHOLDER)
- Foundation (SUPPORTED_PLACEHOLDER)
- Other (SUPPORTED_PLACEHOLDER)
- Roof (SUPPORTED_PLACEHOLDER)
- Structural Zone (SUPPORTED_PLACEHOLDER)

## Wall Decoration Proof

Official PlansXpress treatment: Wall Decoration

Treatment source: C:\ProgramData\HBXL\PlansXpress5\Symbols\Treatment Labels\Wall Decoration.pxd

- Official PlansXpress treatment label file exists in the treatment-label library.
- The decompressed PXD contains a text entity with Text="Wall Decoration".

DXF room labels: Main Bedroom, Lounge, Kitchen, Laundry, Passage, Bedroom 2, Bedroom 3, Bathroom, TV Room

Room polygons detected: no

Wall geometry detected: yes

Wall Decoration treatment detected in project DXF: no

Wall height detected: no

Decoration openings detected: no

Conclusion: Wall Decoration cannot be quantity-matched safely from the current DXF alone: the official treatment is known, but the project DXF does not expose all required treatment, room polygon, wall height, and opening data needed for a deterministic per-room wall-decoration area.

## Trades / Packages

- Decoration
- Electrical
- Flooring / Tiling
- Groundworks
- Joinery
- Masonry / Structure
- Other
- Plastering
- Roofing
- Structural

## Reconciliation Table

| Work Area | Trade / Package | Measurable Item | Drawing Qty | HBXL Related Qty / Resources | Match / Review |
| --- | --- | --- | ---: | --- | --- |
| Bathroom | Decoration | Wall Decoration | - | -; 11 resource rows | REVIEW REQUIRED |
| Bathroom | Electrical | Review Required: Block14472 | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Bathroom | Electrical | Review Required: ELECTRIC SHOWER | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Bathroom | Electrical | Shaver Socket | 1 | 1; 18 resource rows | MATCH |
| Bedroom 2 | Decoration | Wall Decoration | - | -; 11 resource rows | REVIEW REQUIRED |
| Bedroom 2 | Electrical | Ceiling Rose and Pendant | 1 | 6; 14 resource rows | MATCH |
| Bedroom 3 | Decoration | Wall Decoration | - | -; 11 resource rows | REVIEW REQUIRED |
| Bedroom 3 | Electrical | Ceiling Rose and Pendant | 1 | 6; 14 resource rows | MATCH |
| Exterior | Electrical | Weatherproof Outdoor Socket 1G | 6 | 6; 10 resource rows | MATCH |
| External Works | Decoration | HBXL Baseline: External Decoration | - | 2; 11 resource rows | REVIEW REQUIRED |
| Foundation | Groundworks | HBXL Baseline: Footings | - | 9; 10 resource rows | REVIEW REQUIRED |
| Foundation | Groundworks | HBXL Baseline: Foundations | - | 3; 3 resource rows | REVIEW REQUIRED |
| Foundation | Groundworks | HBXL Baseline: Oversite and Slabbing | - | 7; 16 resource rows | REVIEW REQUIRED |
| Kitchen | Decoration | Wall Decoration | - | -; 11 resource rows | REVIEW REQUIRED |
| Kitchen | Electrical | Double Socket 13A | 1 | 5; 10 resource rows | MATCH |
| Kitchen | Electrical | Double Socket 13A with Twin USB | 1 | 11; 10 resource rows | MATCH |
| Kitchen | Electrical | Mains Downlight Standard | 4 | 6; 14 resource rows | MATCH |
| Kitchen | Electrical | Review Required: Block21282 | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Kitchen | Electrical | Review Required: ELECTRIC HOB | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Kitchen | Electrical | Review Required: OVEN | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Laundry | Decoration | Wall Decoration | - | -; 11 resource rows | REVIEW REQUIRED |
| Laundry | Electrical | Mains Downlight Fire Rated | 1 | 11; 14 resource rows | MATCH |
| Laundry | Electrical | Mains Downlight Standard | 1 | 6; 14 resource rows | MATCH |
| Laundry | Electrical | Single Light Switch - One Way | 1 | -; 20 resource rows | REVIEW REQUIRED |
| Laundry | Electrical | WC Light Fitting | 1 | -; 13 resource rows | REVIEW REQUIRED |
| Lounge | Decoration | Wall Decoration | - | -; 11 resource rows | REVIEW REQUIRED |
| Lounge | Electrical | Mains Downlight Fire Rated | 6 | 11; 14 resource rows | MATCH |
| Main Bedroom | Decoration | Wall Decoration | - | -; 11 resource rows | REVIEW REQUIRED |
| Main Bedroom | Electrical | Ceiling Rose and Pendant | 1 | 6; 14 resource rows | MATCH |
| Main Bedroom | Electrical | Review Required: Block88816 | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Decoration | HBXL Baseline: Internal Decoration | - | 5; 11 resource rows | REVIEW REQUIRED |
| Other | Decoration | HBXL Baseline: Internal Preparation | - | 0; 8 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Block14327 | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Block91259 | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Ceiling Rose and Pendant | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Double Light Switch - One Way | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Double Socket 13A | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Double Socket 13A | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Double Socket 13A with Twin USB | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Double Socket 13A with Twin USB | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Double Socket 13A with Twin USB | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Double Socket 13A with Twin USB | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Double Socket 13A with Twin USB | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Double Socket 13A with Twin USB | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Double Socket 13A with Twin USB | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Double Socket 13A with Twin USB | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Double Socket 13A with Twin USB | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Double Socket 13A with Twin USB | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Fluorescent Light 1500mm | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Mains Downlight Fire Rated | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Mains Downlight Fire Rated | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Mains Downlight Fire Rated | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Mains Downlight Fire Rated | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Mains Downlight Standard | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Pull Light Switch | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Single Light Switch | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Single Light Switch | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Single Light Switch - One Way | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Single Light Switch - One Way | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Electrical | Review Required: Single Light Switch - Two Way | 1 | -; 0 resource rows | REVIEW REQUIRED |
| Other | Flooring / Tiling | HBXL Baseline: Internal Fitting Out | - | 27; 33 resource rows | REVIEW REQUIRED |
| Other | Joinery | HBXL Baseline: Joinery 1st Fix | - | 26; 37 resource rows | REVIEW REQUIRED |
| Other | Joinery | HBXL Baseline: Joinery 2nd Fix | - | 13; 19 resource rows | REVIEW REQUIRED |
| Other | Other | HBXL Baseline: Internal Parge Coat | - | 4; 6 resource rows | REVIEW REQUIRED |
| Other | Plastering | HBXL Baseline: Plastering | - | 16; 49 resource rows | REVIEW REQUIRED |
| Passage | Decoration | Wall Decoration | - | -; 11 resource rows | REVIEW REQUIRED |
| Passage | Electrical | Ceiling Rose and Pendant | 2 | 6; 14 resource rows | MATCH |
| Roof | Roofing | HBXL Baseline: Flat Roof Structure | - | 14; 20 resource rows | REVIEW REQUIRED |
| Roof | Roofing | HBXL Baseline: Flat Roof Waterproofing | - | 10; 18 resource rows | REVIEW REQUIRED |
| Roof | Roofing | HBXL Baseline: Roof Structure | - | 22; 37 resource rows | REVIEW REQUIRED |
| Roof | Roofing | HBXL Baseline: Roof Tiling | - | 17; 22 resource rows | REVIEW REQUIRED |
| Structural Zone | Masonry / Structure | HBXL Baseline: ICF Shell | - | 3; 3 resource rows | REVIEW REQUIRED |
| Structural Zone | Masonry / Structure | HBXL Baseline: Masonry Shell | - | 27; 40 resource rows | REVIEW REQUIRED |
| Structural Zone | Masonry / Structure | HBXL Baseline: SIPS Frame | - | 2; 3 resource rows | REVIEW REQUIRED |
| Structural Zone | Masonry / Structure | HBXL Baseline: Timber Frame | - | 2; 11 resource rows | REVIEW REQUIRED |
| Structural Zone | Structural | HBXL Baseline: Structural Openings | - | 11; 15 resource rows | REVIEW REQUIRED |
| TV Room | Decoration | Wall Decoration | - | -; 11 resource rows | REVIEW REQUIRED |
| TV Room | Electrical | Double Socket 13A | 2 | 5; 10 resource rows | MATCH |
| TV Room | Electrical | Fluorescent Light 1500mm | 2 | 3; 14 resource rows | MATCH |
| TV Room | Electrical | Review Required: Block87595 | 1 | -; 0 resource rows | REVIEW REQUIRED |

## Resource Detail

### Bathroom / Decoration / Wall Decoration

Status: REVIEW REQUIRED. Official PlansXpress Wall Decoration treatment is known, but this project DXF does not expose a Wall Decoration treatment marker; room labels exist but room polygons, wall height, and decoration openings are not all available for deterministic quantity calculation.

Drawing references: none

Material:
- Row 161: HB00528 - Dado Paper 5m Roll (Allowance £5 Each) (Each) | Qty 0 Each @ £5/Each | Phase Internal Decoration
- Row 162: HB00118 - Quick Drying Floor Varnish Clear Gloss 2.5 Litre (Each) | Qty 0 Each @ £21.4/Each | Phase Internal Decoration
- Row 163: HB00114 - Trade Emulsion Paint Brilliant White 5 Litre (Each) | Qty 9 Each @ £23.3/Each | Phase Internal Decoration
- Row 164: HB00115 - Trade Emulsion Paint Magnolia 5 Litre (Each) | Qty 16 Each @ £38/Each | Phase Internal Decoration
- Row 165: HB00116 - Trade Gloss Paint Brilliant White 5 Litre (Each) | Qty 2 Each @ £42/Each | Phase Internal Decoration
- Row 166: HB00113 - Undercoat White 5 Litre (Each) | Qty 4 Each @ £38/Each | Phase Internal Decoration
- Row 167: HB00527 - Wallpaper 5.3m² Roll (Allowance £10 Each) (Each) | Qty 0 Each @ £10/Each | Phase Internal Decoration
- Row 168: HB00529 - Wallpaper Paste (16 Roll) (Each) | Qty 0 Each @ £6.3/Each | Phase Internal Decoration
- Row 169: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Decoration

Labour:
- Row 159: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Decoration
- Row 160: Decorator (Hours) | Qty 181 Hours @ £29/Hours | Phase Internal Decoration

### Bathroom / Electrical / Review Required: Block14472

Status: REVIEW REQUIRED. unknown electrical symbol

Drawing references: drawing-0005

No HBXL resource rows safely linked.

### Bathroom / Electrical / Review Required: ELECTRIC SHOWER

Status: REVIEW REQUIRED. explicit drawing label has no safe HBXL measurable item mapping

Drawing references: drawing-0002

No HBXL resource rows safely linked.

### Bathroom / Electrical / Shaver Socket

Status: MATCH. Project-wide DXF quantity equals exact HBXL Smart Schedule resource quantity. HBXL is not room-split, so area quantities remain drawing-derived.

Drawing references: drawing-0003

Material:
- Row 355: HB00221 - Shaver Socket (Each) | Qty 1 Each @ £20.5/Each | Phase Electrical 2nd Fix
- Row 317: HB00212 - Back Box Metal 1G 16mm (Each) | Qty 7 Each @ £0.46/Each | Phase Electrical 1st Fix
- Row 318: HB00213 - Back Box Metal 1G 25mm (Each) | Qty 2 Each @ £0.46/Each | Phase Electrical 1st Fix
- Row 319: HB3709441 - Back Box Metal 1G 47mm (Each) | Qty 2 Each @ £0.91/Each | Phase Electrical 1st Fix
- Row 320: HB00214 - Back Box Metal 2G 25mm (Each) | Qty 18 Each @ £0.62/Each | Phase Electrical 1st Fix
- Row 321: HB3709440 - Back Box Metal 2G 47mm (Each) | Qty 2 Each @ £1.21/Each | Phase Electrical 1st Fix
- Row 322: HB00173 - Cable Clips 1mm (Pack of 100) (Each) | Qty 1 Each @ £1.13/Each | Phase Electrical 1st Fix
- Row 323: HB00176 - Cable Clips 2.5mm (Pack of 100) (Each) | Qty 1 Each @ £1.16/Each | Phase Electrical 1st Fix
- Row 324: HB00180 - Cable Clips 6mm (Pack of 100) (Each) | Qty 0 Each @ £2.15/Each | Phase Electrical 1st Fix
- Row 330: HB04174 - Twin & Earth Cable 1.5mm (50m) (Each) | Qty 2 Each @ £30/Each | Phase Electrical 1st Fix
- Row 331: HB00174 - Twin & Earth Cable 1mm (50m) (Each) | Qty 0 Each @ £27.5/Each | Phase Electrical 1st Fix
- Row 332: HB00177 - Twin & Earth Cable 2.5mm (50m) (Each) | Qty 3 Each @ £46/Each | Phase Electrical 1st Fix
- Row 333: HB00181 - Twin & Earth Cable 6mm (per m) (m) | Qty 52 m @ £2.35/m | Phase Electrical 1st Fix
- Row 336: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 1st Fix
- Row 358: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 2nd Fix

Labour:
- Row 314: Electrician & Mate (Hours) | Qty 33 Hours @ £63/Hours | Phase Electrical 1st Fix
- Row 315: Electrician's Mate (Hours) | Qty 0 Hours @ £25/Hours | Phase Electrical 1st Fix
- Row 337: Electrician (Hours) | Qty 18 Hours @ £38/Hours | Phase Electrical 2nd Fix

### Bedroom 2 / Decoration / Wall Decoration

Status: REVIEW REQUIRED. Official PlansXpress Wall Decoration treatment is known, but this project DXF does not expose a Wall Decoration treatment marker; room labels exist but room polygons, wall height, and decoration openings are not all available for deterministic quantity calculation.

Drawing references: none

Material:
- Row 161: HB00528 - Dado Paper 5m Roll (Allowance £5 Each) (Each) | Qty 0 Each @ £5/Each | Phase Internal Decoration
- Row 162: HB00118 - Quick Drying Floor Varnish Clear Gloss 2.5 Litre (Each) | Qty 0 Each @ £21.4/Each | Phase Internal Decoration
- Row 163: HB00114 - Trade Emulsion Paint Brilliant White 5 Litre (Each) | Qty 9 Each @ £23.3/Each | Phase Internal Decoration
- Row 164: HB00115 - Trade Emulsion Paint Magnolia 5 Litre (Each) | Qty 16 Each @ £38/Each | Phase Internal Decoration
- Row 165: HB00116 - Trade Gloss Paint Brilliant White 5 Litre (Each) | Qty 2 Each @ £42/Each | Phase Internal Decoration
- Row 166: HB00113 - Undercoat White 5 Litre (Each) | Qty 4 Each @ £38/Each | Phase Internal Decoration
- Row 167: HB00527 - Wallpaper 5.3m² Roll (Allowance £10 Each) (Each) | Qty 0 Each @ £10/Each | Phase Internal Decoration
- Row 168: HB00529 - Wallpaper Paste (16 Roll) (Each) | Qty 0 Each @ £6.3/Each | Phase Internal Decoration
- Row 169: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Decoration

Labour:
- Row 159: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Decoration
- Row 160: Decorator (Hours) | Qty 181 Hours @ £29/Hours | Phase Internal Decoration

### Bedroom 2 / Electrical / Ceiling Rose and Pendant

Status: MATCH. Project-wide DXF quantity equals exact HBXL Smart Schedule resource quantity. HBXL is not room-split, so area quantities remain drawing-derived.

Drawing references: drawing-0034

Material:
- Row 339: HB00189 - Ceiling Rose and Pendant (Each) | Qty 6 Each @ £3.75/Each | Phase Electrical 2nd Fix
- Row 316: HB00172 - 3 Core & Earth Cable 1mm (100m) (Each) | Qty 1 Each @ £67/Each | Phase Electrical 1st Fix
- Row 322: HB00173 - Cable Clips 1mm (Pack of 100) (Each) | Qty 1 Each @ £1.13/Each | Phase Electrical 1st Fix
- Row 325: HB03632 - Fire Hood For Downlight (Each) | Qty 0 Each @ £6.2/Each | Phase Electrical 1st Fix
- Row 327: HB03633 - Insulation Guard for Downlight (Each) | Qty 0 Each @ £7.35/Each | Phase Electrical 1st Fix
- Row 328: HB00222 - Sheathing Metal 12.5mm x 2m (Each) | Qty 11 Each @ £1.67/Each | Phase Electrical 1st Fix
- Row 329: HB00223 - Sheathing Metal 25mm x 2m (Each) | Qty 24 Each @ £2.1/Each | Phase Electrical 1st Fix
- Row 330: HB04174 - Twin & Earth Cable 1.5mm (50m) (Each) | Qty 2 Each @ £30/Each | Phase Electrical 1st Fix
- Row 331: HB00174 - Twin & Earth Cable 1mm (50m) (Each) | Qty 0 Each @ £27.5/Each | Phase Electrical 1st Fix
- Row 336: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 1st Fix
- Row 358: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 2nd Fix

Labour:
- Row 314: Electrician & Mate (Hours) | Qty 33 Hours @ £63/Hours | Phase Electrical 1st Fix
- Row 315: Electrician's Mate (Hours) | Qty 0 Hours @ £25/Hours | Phase Electrical 1st Fix
- Row 337: Electrician (Hours) | Qty 18 Hours @ £38/Hours | Phase Electrical 2nd Fix

### Bedroom 3 / Decoration / Wall Decoration

Status: REVIEW REQUIRED. Official PlansXpress Wall Decoration treatment is known, but this project DXF does not expose a Wall Decoration treatment marker; room labels exist but room polygons, wall height, and decoration openings are not all available for deterministic quantity calculation.

Drawing references: none

Material:
- Row 161: HB00528 - Dado Paper 5m Roll (Allowance £5 Each) (Each) | Qty 0 Each @ £5/Each | Phase Internal Decoration
- Row 162: HB00118 - Quick Drying Floor Varnish Clear Gloss 2.5 Litre (Each) | Qty 0 Each @ £21.4/Each | Phase Internal Decoration
- Row 163: HB00114 - Trade Emulsion Paint Brilliant White 5 Litre (Each) | Qty 9 Each @ £23.3/Each | Phase Internal Decoration
- Row 164: HB00115 - Trade Emulsion Paint Magnolia 5 Litre (Each) | Qty 16 Each @ £38/Each | Phase Internal Decoration
- Row 165: HB00116 - Trade Gloss Paint Brilliant White 5 Litre (Each) | Qty 2 Each @ £42/Each | Phase Internal Decoration
- Row 166: HB00113 - Undercoat White 5 Litre (Each) | Qty 4 Each @ £38/Each | Phase Internal Decoration
- Row 167: HB00527 - Wallpaper 5.3m² Roll (Allowance £10 Each) (Each) | Qty 0 Each @ £10/Each | Phase Internal Decoration
- Row 168: HB00529 - Wallpaper Paste (16 Roll) (Each) | Qty 0 Each @ £6.3/Each | Phase Internal Decoration
- Row 169: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Decoration

Labour:
- Row 159: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Decoration
- Row 160: Decorator (Hours) | Qty 181 Hours @ £29/Hours | Phase Internal Decoration

### Bedroom 3 / Electrical / Ceiling Rose and Pendant

Status: MATCH. Project-wide DXF quantity equals exact HBXL Smart Schedule resource quantity. HBXL is not room-split, so area quantities remain drawing-derived.

Drawing references: drawing-0038

Material:
- Row 339: HB00189 - Ceiling Rose and Pendant (Each) | Qty 6 Each @ £3.75/Each | Phase Electrical 2nd Fix
- Row 316: HB00172 - 3 Core & Earth Cable 1mm (100m) (Each) | Qty 1 Each @ £67/Each | Phase Electrical 1st Fix
- Row 322: HB00173 - Cable Clips 1mm (Pack of 100) (Each) | Qty 1 Each @ £1.13/Each | Phase Electrical 1st Fix
- Row 325: HB03632 - Fire Hood For Downlight (Each) | Qty 0 Each @ £6.2/Each | Phase Electrical 1st Fix
- Row 327: HB03633 - Insulation Guard for Downlight (Each) | Qty 0 Each @ £7.35/Each | Phase Electrical 1st Fix
- Row 328: HB00222 - Sheathing Metal 12.5mm x 2m (Each) | Qty 11 Each @ £1.67/Each | Phase Electrical 1st Fix
- Row 329: HB00223 - Sheathing Metal 25mm x 2m (Each) | Qty 24 Each @ £2.1/Each | Phase Electrical 1st Fix
- Row 330: HB04174 - Twin & Earth Cable 1.5mm (50m) (Each) | Qty 2 Each @ £30/Each | Phase Electrical 1st Fix
- Row 331: HB00174 - Twin & Earth Cable 1mm (50m) (Each) | Qty 0 Each @ £27.5/Each | Phase Electrical 1st Fix
- Row 336: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 1st Fix
- Row 358: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 2nd Fix

Labour:
- Row 314: Electrician & Mate (Hours) | Qty 33 Hours @ £63/Hours | Phase Electrical 1st Fix
- Row 315: Electrician's Mate (Hours) | Qty 0 Hours @ £25/Hours | Phase Electrical 1st Fix
- Row 337: Electrician (Hours) | Qty 18 Hours @ £38/Hours | Phase Electrical 2nd Fix

### Exterior / Electrical / Weatherproof Outdoor Socket 1G

Status: MATCH. Project-wide DXF quantity equals exact HBXL Smart Schedule resource quantity. HBXL is not room-split, so area quantities remain drawing-derived.

Drawing references: drawing-0048, drawing-0049, drawing-0050, drawing-0051, drawing-0052, drawing-0053

Material:
- Row 357: HB3709445 - Weatherproof Outdoor Socket 1G (Each) | Qty 6 Each @ £5.3/Each | Phase Electrical 2nd Fix
- Row 320: HB00214 - Back Box Metal 2G 25mm (Each) | Qty 18 Each @ £0.62/Each | Phase Electrical 1st Fix
- Row 321: HB3709440 - Back Box Metal 2G 47mm (Each) | Qty 2 Each @ £1.21/Each | Phase Electrical 1st Fix
- Row 323: HB00176 - Cable Clips 2.5mm (Pack of 100) (Each) | Qty 1 Each @ £1.16/Each | Phase Electrical 1st Fix
- Row 332: HB00177 - Twin & Earth Cable 2.5mm (50m) (Each) | Qty 3 Each @ £46/Each | Phase Electrical 1st Fix
- Row 336: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 1st Fix
- Row 358: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 2nd Fix

Labour:
- Row 314: Electrician & Mate (Hours) | Qty 33 Hours @ £63/Hours | Phase Electrical 1st Fix
- Row 315: Electrician's Mate (Hours) | Qty 0 Hours @ £25/Hours | Phase Electrical 1st Fix
- Row 337: Electrician (Hours) | Qty 18 Hours @ £38/Hours | Phase Electrical 2nd Fix

### External Works / Decoration / HBXL Baseline: External Decoration

Status: REVIEW REQUIRED. HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.

Drawing references: none

Material:
- Row 108: HB00117 - Outdoor Varnish Clear Gloss 750ml (Each) | Qty 0 Each @ £11.9/Each | Phase External Decoration
- Row 109: HB00111 - Smooth Masonry Paint Brilliant White 10 Litre (Each) | Qty 0 Each @ £32/Each | Phase External Decoration
- Row 110: HB00576 - Stabilising Masonry Primer 5 Litre (Each) | Qty 0 Each @ £42.5/Each | Phase External Decoration
- Row 111: HB00116 - Trade Gloss Paint Brilliant White 5 Litre (Each) | Qty 0 Each @ £42/Each | Phase External Decoration
- Row 112: HB00113 - Undercoat White 5 Litre (Each) | Qty 0 Each @ £38/Each | Phase External Decoration
- Row 113: HB00567 - Sundry Materials (£) (Each) | Qty 0 Each @ £1/Each | Phase External Decoration
- Row 114: Not Required (Unit) | Qty 1361 Unit @ £0/Unit | Phase External Decoration

Labour:
- Row 104: Not Required (Unit) | Qty 1701 Unit @ £0/Unit | Phase External Decoration
- Row 107: Decorator (Hours) | Qty 0 Hours @ £29/Hours | Phase External Decoration

Plant:
- Row 105: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase External Decoration
- Row 106: To be Defined (Unit) | Qty 0 Unit @ £0/Unit | Phase External Decoration

### Foundation / Groundworks / HBXL Baseline: Footings

Status: REVIEW REQUIRED. HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.

Drawing references: none

Material:
- Row 2: HB00038 - Engineering Brick - Class A Blue 65mm (Each) | Qty 852 Each @ £1.68/Each | Phase Footings
- Row 3: HB04200 - Facing Bricks - Provisional (Allowance £1.20 Each) (Each) | Qty 426 Each @ £1.2/Each | Phase Footings
- Row 4: HB00481 - Solid Dense Concrete Coursing Brick 7N 215 x 65 x 100mm (Each) | Qty 0 Each @ £1.15/Each | Phase Footings
- Row 8: HB00109 - Blue Circle Mastercrete Original Cement 25kg Bag (Each) | Qty 15 Each @ £6.6/Each | Phase Footings
- Row 9: HB00002 - Building Sand Bulk Bag (Each) | Qty 2 Each @ £58/Each | Phase Footings
- Row 10: HB00028 - Solid Dense Concrete Block 7N 440 x 215 x 100mm (m²) | Qty 21 m² @ £17.1/m² | Phase Footings
- Row 11: Not Required (Unit) | Qty 814 Unit @ £0/Unit | Phase Footings

Labour:
- Row 5: Not Required (Unit) | Qty 148 Unit @ £0/Unit | Phase Footings
- Row 7: 2 Bricklayers & Mate (Hours) | Qty 17 Hours @ £88/Hours | Phase Footings

Plant:
- Row 6: Not Required (Unit) | Qty 3 Unit @ £0/Unit | Phase Footings

### Foundation / Groundworks / HBXL Baseline: Foundations

Status: REVIEW REQUIRED. HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.

Drawing references: none

Material:
- Row 155: Not Required (Unit) | Qty 34 Unit @ £0/Unit | Phase Foundations

Labour:
- Row 153: Not Required (Unit) | Qty 367 Unit @ £0/Unit | Phase Foundations

Plant:
- Row 154: Not Required (Unit) | Qty 313 Unit @ £0/Unit | Phase Foundations

### Foundation / Groundworks / HBXL Baseline: Oversite and Slabbing

Status: REVIEW REQUIRED. HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.

Drawing references: none

Material:
- Row 213: HB00108 - Readymix Concrete RC 30, 50mm slump 6m³ (Allowance £135 per m³) (m³) | Qty 46 m³ @ £135/m³ | Phase Oversite and Slabbing
- Row 215: HB00002 - Building Sand Bulk Bag (Each) | Qty 17 Each @ £58/Each | Phase Oversite and Slabbing
- Row 216: HB00005 - Sub Base MOT Type 1 Bulk Bag (Each) | Qty 101 Each @ £60/Each | Phase Oversite and Slabbing
- Row 217: HB00171 - Polythene DPM Blue 300mu 4 x 25m PIFA (27.6kg) (Each) | Qty 3 Each @ £52.5/Each | Phase Oversite and Slabbing
- Row 219: HB00241 - Flooring Grade Polystyrene Insulation Sheet 2400 x 1200 x 25mm (Each) | Qty 0 Each @ £7.05/Each | Phase Oversite and Slabbing
- Row 220: HB04095 - PIR Insulation Board 2400 x 1200 x 120mm (Each) | Qty 94 Each @ £51/Each | Phase Oversite and Slabbing
- Row 221: HB04197 - Steel Fabric Reinforcement Mesh 4.8m x 2.4m A393 (Each) | Qty 46 Each @ £97/Each | Phase Oversite and Slabbing

Labour:
- Row 214: Groundworker & Mate (Hours) | Qty 131 Hours @ £51/Hours | Phase Oversite and Slabbing

Plant:
- Row 218: Mini Digger & Driver (8hr. Day) (Day) | Qty 0 Day @ £295/Day | Phase Oversite and Slabbing
- Row 222: Bolt Croppers (Week) | Qty 0 Week @ £10/Week | Phase Oversite and Slabbing
- Row 223: Plate Compactor (Week) | Qty 0 Week @ £45/Week | Phase Oversite and Slabbing
- Row 224: 0 | Qty 0 Week @ £170/Week | Phase Oversite and Slabbing
- Row 225: Shovel (Week) | Qty 0 Week @ £12/Week | Phase Oversite and Slabbing
- Row 226: Vibrating Poker (Week) | Qty 0 Week @ £85/Week | Phase Oversite and Slabbing
- Row 227: Wheelbarrow (Week) | Qty 0 Week @ £10/Week | Phase Oversite and Slabbing
- Row 228: Delivery (10 to 15 Miles) (Each) | Qty 0 Each @ £40/Each | Phase Oversite and Slabbing

### Kitchen / Decoration / Wall Decoration

Status: REVIEW REQUIRED. Official PlansXpress Wall Decoration treatment is known, but this project DXF does not expose a Wall Decoration treatment marker; room labels exist but room polygons, wall height, and decoration openings are not all available for deterministic quantity calculation.

Drawing references: none

Material:
- Row 161: HB00528 - Dado Paper 5m Roll (Allowance £5 Each) (Each) | Qty 0 Each @ £5/Each | Phase Internal Decoration
- Row 162: HB00118 - Quick Drying Floor Varnish Clear Gloss 2.5 Litre (Each) | Qty 0 Each @ £21.4/Each | Phase Internal Decoration
- Row 163: HB00114 - Trade Emulsion Paint Brilliant White 5 Litre (Each) | Qty 9 Each @ £23.3/Each | Phase Internal Decoration
- Row 164: HB00115 - Trade Emulsion Paint Magnolia 5 Litre (Each) | Qty 16 Each @ £38/Each | Phase Internal Decoration
- Row 165: HB00116 - Trade Gloss Paint Brilliant White 5 Litre (Each) | Qty 2 Each @ £42/Each | Phase Internal Decoration
- Row 166: HB00113 - Undercoat White 5 Litre (Each) | Qty 4 Each @ £38/Each | Phase Internal Decoration
- Row 167: HB00527 - Wallpaper 5.3m² Roll (Allowance £10 Each) (Each) | Qty 0 Each @ £10/Each | Phase Internal Decoration
- Row 168: HB00529 - Wallpaper Paste (16 Roll) (Each) | Qty 0 Each @ £6.3/Each | Phase Internal Decoration
- Row 169: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Decoration

Labour:
- Row 159: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Decoration
- Row 160: Decorator (Hours) | Qty 181 Hours @ £29/Hours | Phase Internal Decoration

### Kitchen / Electrical / Double Socket 13A

Status: MATCH. Project-wide DXF quantity equals exact HBXL Smart Schedule resource quantity. HBXL is not room-split, so area quantities remain drawing-derived.

Drawing references: drawing-0012

Material:
- Row 343: HB00175 - Double Socket 13A (Each) | Qty 5 Each @ £2.35/Each | Phase Electrical 2nd Fix
- Row 320: HB00214 - Back Box Metal 2G 25mm (Each) | Qty 18 Each @ £0.62/Each | Phase Electrical 1st Fix
- Row 321: HB3709440 - Back Box Metal 2G 47mm (Each) | Qty 2 Each @ £1.21/Each | Phase Electrical 1st Fix
- Row 323: HB00176 - Cable Clips 2.5mm (Pack of 100) (Each) | Qty 1 Each @ £1.16/Each | Phase Electrical 1st Fix
- Row 332: HB00177 - Twin & Earth Cable 2.5mm (50m) (Each) | Qty 3 Each @ £46/Each | Phase Electrical 1st Fix
- Row 336: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 1st Fix
- Row 358: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 2nd Fix

Labour:
- Row 314: Electrician & Mate (Hours) | Qty 33 Hours @ £63/Hours | Phase Electrical 1st Fix
- Row 315: Electrician's Mate (Hours) | Qty 0 Hours @ £25/Hours | Phase Electrical 1st Fix
- Row 337: Electrician (Hours) | Qty 18 Hours @ £38/Hours | Phase Electrical 2nd Fix

### Kitchen / Electrical / Double Socket 13A with Twin USB

Status: MATCH. Project-wide DXF quantity equals exact HBXL Smart Schedule resource quantity. HBXL is not room-split, so area quantities remain drawing-derived.

Drawing references: drawing-0010

Material:
- Row 344: HB04196 - Double Socket 13A with Twin USB (Each) | Qty 11 Each @ £9.9/Each | Phase Electrical 2nd Fix
- Row 320: HB00214 - Back Box Metal 2G 25mm (Each) | Qty 18 Each @ £0.62/Each | Phase Electrical 1st Fix
- Row 321: HB3709440 - Back Box Metal 2G 47mm (Each) | Qty 2 Each @ £1.21/Each | Phase Electrical 1st Fix
- Row 323: HB00176 - Cable Clips 2.5mm (Pack of 100) (Each) | Qty 1 Each @ £1.16/Each | Phase Electrical 1st Fix
- Row 332: HB00177 - Twin & Earth Cable 2.5mm (50m) (Each) | Qty 3 Each @ £46/Each | Phase Electrical 1st Fix
- Row 336: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 1st Fix
- Row 358: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 2nd Fix

Labour:
- Row 314: Electrician & Mate (Hours) | Qty 33 Hours @ £63/Hours | Phase Electrical 1st Fix
- Row 315: Electrician's Mate (Hours) | Qty 0 Hours @ £25/Hours | Phase Electrical 1st Fix
- Row 337: Electrician (Hours) | Qty 18 Hours @ £38/Hours | Phase Electrical 2nd Fix

### Kitchen / Electrical / Mains Downlight Standard

Status: MATCH. Project-wide DXF quantity equals exact HBXL Smart Schedule resource quantity. HBXL is not room-split, so area quantities remain drawing-derived.

Drawing references: drawing-0015, drawing-0016, drawing-0017, drawing-0020

Material:
- Row 352: HB03625 - Mains Downlight Standard (Each) | Qty 6 Each @ £5.25/Each | Phase Electrical 2nd Fix
- Row 316: HB00172 - 3 Core & Earth Cable 1mm (100m) (Each) | Qty 1 Each @ £67/Each | Phase Electrical 1st Fix
- Row 322: HB00173 - Cable Clips 1mm (Pack of 100) (Each) | Qty 1 Each @ £1.13/Each | Phase Electrical 1st Fix
- Row 325: HB03632 - Fire Hood For Downlight (Each) | Qty 0 Each @ £6.2/Each | Phase Electrical 1st Fix
- Row 327: HB03633 - Insulation Guard for Downlight (Each) | Qty 0 Each @ £7.35/Each | Phase Electrical 1st Fix
- Row 328: HB00222 - Sheathing Metal 12.5mm x 2m (Each) | Qty 11 Each @ £1.67/Each | Phase Electrical 1st Fix
- Row 329: HB00223 - Sheathing Metal 25mm x 2m (Each) | Qty 24 Each @ £2.1/Each | Phase Electrical 1st Fix
- Row 330: HB04174 - Twin & Earth Cable 1.5mm (50m) (Each) | Qty 2 Each @ £30/Each | Phase Electrical 1st Fix
- Row 331: HB00174 - Twin & Earth Cable 1mm (50m) (Each) | Qty 0 Each @ £27.5/Each | Phase Electrical 1st Fix
- Row 336: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 1st Fix
- Row 358: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 2nd Fix

Labour:
- Row 314: Electrician & Mate (Hours) | Qty 33 Hours @ £63/Hours | Phase Electrical 1st Fix
- Row 315: Electrician's Mate (Hours) | Qty 0 Hours @ £25/Hours | Phase Electrical 1st Fix
- Row 337: Electrician (Hours) | Qty 18 Hours @ £38/Hours | Phase Electrical 2nd Fix

### Kitchen / Electrical / Review Required: Block21282

Status: REVIEW REQUIRED. unknown electrical symbol

Drawing references: drawing-0006

No HBXL resource rows safely linked.

### Kitchen / Electrical / Review Required: ELECTRIC HOB

Status: REVIEW REQUIRED. explicit drawing label has no safe HBXL measurable item mapping

Drawing references: drawing-0007

No HBXL resource rows safely linked.

### Kitchen / Electrical / Review Required: OVEN

Status: REVIEW REQUIRED. explicit drawing label has no safe HBXL measurable item mapping

Drawing references: drawing-0008

No HBXL resource rows safely linked.

### Laundry / Decoration / Wall Decoration

Status: REVIEW REQUIRED. Official PlansXpress Wall Decoration treatment is known, but this project DXF does not expose a Wall Decoration treatment marker; room labels exist but room polygons, wall height, and decoration openings are not all available for deterministic quantity calculation.

Drawing references: none

Material:
- Row 161: HB00528 - Dado Paper 5m Roll (Allowance £5 Each) (Each) | Qty 0 Each @ £5/Each | Phase Internal Decoration
- Row 162: HB00118 - Quick Drying Floor Varnish Clear Gloss 2.5 Litre (Each) | Qty 0 Each @ £21.4/Each | Phase Internal Decoration
- Row 163: HB00114 - Trade Emulsion Paint Brilliant White 5 Litre (Each) | Qty 9 Each @ £23.3/Each | Phase Internal Decoration
- Row 164: HB00115 - Trade Emulsion Paint Magnolia 5 Litre (Each) | Qty 16 Each @ £38/Each | Phase Internal Decoration
- Row 165: HB00116 - Trade Gloss Paint Brilliant White 5 Litre (Each) | Qty 2 Each @ £42/Each | Phase Internal Decoration
- Row 166: HB00113 - Undercoat White 5 Litre (Each) | Qty 4 Each @ £38/Each | Phase Internal Decoration
- Row 167: HB00527 - Wallpaper 5.3m² Roll (Allowance £10 Each) (Each) | Qty 0 Each @ £10/Each | Phase Internal Decoration
- Row 168: HB00529 - Wallpaper Paste (16 Roll) (Each) | Qty 0 Each @ £6.3/Each | Phase Internal Decoration
- Row 169: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Decoration

Labour:
- Row 159: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Decoration
- Row 160: Decorator (Hours) | Qty 181 Hours @ £29/Hours | Phase Internal Decoration

### Laundry / Electrical / Mains Downlight Fire Rated

Status: MATCH. Project-wide DXF quantity equals exact HBXL Smart Schedule resource quantity. HBXL is not room-split, so area quantities remain drawing-derived.

Drawing references: drawing-0024

Material:
- Row 351: HB03626 - Mains Downlight Fire Rated (Each) | Qty 11 Each @ £9.2/Each | Phase Electrical 2nd Fix
- Row 316: HB00172 - 3 Core & Earth Cable 1mm (100m) (Each) | Qty 1 Each @ £67/Each | Phase Electrical 1st Fix
- Row 322: HB00173 - Cable Clips 1mm (Pack of 100) (Each) | Qty 1 Each @ £1.13/Each | Phase Electrical 1st Fix
- Row 325: HB03632 - Fire Hood For Downlight (Each) | Qty 0 Each @ £6.2/Each | Phase Electrical 1st Fix
- Row 327: HB03633 - Insulation Guard for Downlight (Each) | Qty 0 Each @ £7.35/Each | Phase Electrical 1st Fix
- Row 328: HB00222 - Sheathing Metal 12.5mm x 2m (Each) | Qty 11 Each @ £1.67/Each | Phase Electrical 1st Fix
- Row 329: HB00223 - Sheathing Metal 25mm x 2m (Each) | Qty 24 Each @ £2.1/Each | Phase Electrical 1st Fix
- Row 330: HB04174 - Twin & Earth Cable 1.5mm (50m) (Each) | Qty 2 Each @ £30/Each | Phase Electrical 1st Fix
- Row 331: HB00174 - Twin & Earth Cable 1mm (50m) (Each) | Qty 0 Each @ £27.5/Each | Phase Electrical 1st Fix
- Row 336: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 1st Fix
- Row 358: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 2nd Fix

Labour:
- Row 314: Electrician & Mate (Hours) | Qty 33 Hours @ £63/Hours | Phase Electrical 1st Fix
- Row 315: Electrician's Mate (Hours) | Qty 0 Hours @ £25/Hours | Phase Electrical 1st Fix
- Row 337: Electrician (Hours) | Qty 18 Hours @ £38/Hours | Phase Electrical 2nd Fix

### Laundry / Electrical / Mains Downlight Standard

Status: MATCH. Project-wide DXF quantity equals exact HBXL Smart Schedule resource quantity. HBXL is not room-split, so area quantities remain drawing-derived.

Drawing references: drawing-0019

Material:
- Row 352: HB03625 - Mains Downlight Standard (Each) | Qty 6 Each @ £5.25/Each | Phase Electrical 2nd Fix
- Row 316: HB00172 - 3 Core & Earth Cable 1mm (100m) (Each) | Qty 1 Each @ £67/Each | Phase Electrical 1st Fix
- Row 322: HB00173 - Cable Clips 1mm (Pack of 100) (Each) | Qty 1 Each @ £1.13/Each | Phase Electrical 1st Fix
- Row 325: HB03632 - Fire Hood For Downlight (Each) | Qty 0 Each @ £6.2/Each | Phase Electrical 1st Fix
- Row 327: HB03633 - Insulation Guard for Downlight (Each) | Qty 0 Each @ £7.35/Each | Phase Electrical 1st Fix
- Row 328: HB00222 - Sheathing Metal 12.5mm x 2m (Each) | Qty 11 Each @ £1.67/Each | Phase Electrical 1st Fix
- Row 329: HB00223 - Sheathing Metal 25mm x 2m (Each) | Qty 24 Each @ £2.1/Each | Phase Electrical 1st Fix
- Row 330: HB04174 - Twin & Earth Cable 1.5mm (50m) (Each) | Qty 2 Each @ £30/Each | Phase Electrical 1st Fix
- Row 331: HB00174 - Twin & Earth Cable 1mm (50m) (Each) | Qty 0 Each @ £27.5/Each | Phase Electrical 1st Fix
- Row 336: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 1st Fix
- Row 358: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 2nd Fix

Labour:
- Row 314: Electrician & Mate (Hours) | Qty 33 Hours @ £63/Hours | Phase Electrical 1st Fix
- Row 315: Electrician's Mate (Hours) | Qty 0 Hours @ £25/Hours | Phase Electrical 1st Fix
- Row 337: Electrician (Hours) | Qty 18 Hours @ £38/Hours | Phase Electrical 2nd Fix

### Laundry / Electrical / Single Light Switch - One Way

Status: REVIEW REQUIRED. Project-wide DXF quantity does not equal exact HBXL Smart Schedule resource quantity.

Drawing references: drawing-0062

Material:
- Row 316: HB00172 - 3 Core & Earth Cable 1mm (100m) (Each) | Qty 1 Each @ £67/Each | Phase Electrical 1st Fix
- Row 317: HB00212 - Back Box Metal 1G 16mm (Each) | Qty 7 Each @ £0.46/Each | Phase Electrical 1st Fix
- Row 318: HB00213 - Back Box Metal 1G 25mm (Each) | Qty 2 Each @ £0.46/Each | Phase Electrical 1st Fix
- Row 319: HB3709441 - Back Box Metal 1G 47mm (Each) | Qty 2 Each @ £0.91/Each | Phase Electrical 1st Fix
- Row 322: HB00173 - Cable Clips 1mm (Pack of 100) (Each) | Qty 1 Each @ £1.13/Each | Phase Electrical 1st Fix
- Row 323: HB00176 - Cable Clips 2.5mm (Pack of 100) (Each) | Qty 1 Each @ £1.16/Each | Phase Electrical 1st Fix
- Row 324: HB00180 - Cable Clips 6mm (Pack of 100) (Each) | Qty 0 Each @ £2.15/Each | Phase Electrical 1st Fix
- Row 325: HB03632 - Fire Hood For Downlight (Each) | Qty 0 Each @ £6.2/Each | Phase Electrical 1st Fix
- Row 327: HB03633 - Insulation Guard for Downlight (Each) | Qty 0 Each @ £7.35/Each | Phase Electrical 1st Fix
- Row 328: HB00222 - Sheathing Metal 12.5mm x 2m (Each) | Qty 11 Each @ £1.67/Each | Phase Electrical 1st Fix
- Row 329: HB00223 - Sheathing Metal 25mm x 2m (Each) | Qty 24 Each @ £2.1/Each | Phase Electrical 1st Fix
- Row 330: HB04174 - Twin & Earth Cable 1.5mm (50m) (Each) | Qty 2 Each @ £30/Each | Phase Electrical 1st Fix
- Row 331: HB00174 - Twin & Earth Cable 1mm (50m) (Each) | Qty 0 Each @ £27.5/Each | Phase Electrical 1st Fix
- Row 332: HB00177 - Twin & Earth Cable 2.5mm (50m) (Each) | Qty 3 Each @ £46/Each | Phase Electrical 1st Fix
- Row 333: HB00181 - Twin & Earth Cable 6mm (per m) (m) | Qty 52 m @ £2.35/m | Phase Electrical 1st Fix
- Row 336: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 1st Fix
- Row 358: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 2nd Fix

Labour:
- Row 314: Electrician & Mate (Hours) | Qty 33 Hours @ £63/Hours | Phase Electrical 1st Fix
- Row 315: Electrician's Mate (Hours) | Qty 0 Hours @ £25/Hours | Phase Electrical 1st Fix
- Row 337: Electrician (Hours) | Qty 18 Hours @ £38/Hours | Phase Electrical 2nd Fix

### Laundry / Electrical / WC Light Fitting

Status: REVIEW REQUIRED. Project-wide DXF quantity does not equal exact HBXL Smart Schedule resource quantity.

Drawing references: drawing-0021

Material:
- Row 316: HB00172 - 3 Core & Earth Cable 1mm (100m) (Each) | Qty 1 Each @ £67/Each | Phase Electrical 1st Fix
- Row 322: HB00173 - Cable Clips 1mm (Pack of 100) (Each) | Qty 1 Each @ £1.13/Each | Phase Electrical 1st Fix
- Row 325: HB03632 - Fire Hood For Downlight (Each) | Qty 0 Each @ £6.2/Each | Phase Electrical 1st Fix
- Row 327: HB03633 - Insulation Guard for Downlight (Each) | Qty 0 Each @ £7.35/Each | Phase Electrical 1st Fix
- Row 328: HB00222 - Sheathing Metal 12.5mm x 2m (Each) | Qty 11 Each @ £1.67/Each | Phase Electrical 1st Fix
- Row 329: HB00223 - Sheathing Metal 25mm x 2m (Each) | Qty 24 Each @ £2.1/Each | Phase Electrical 1st Fix
- Row 330: HB04174 - Twin & Earth Cable 1.5mm (50m) (Each) | Qty 2 Each @ £30/Each | Phase Electrical 1st Fix
- Row 331: HB00174 - Twin & Earth Cable 1mm (50m) (Each) | Qty 0 Each @ £27.5/Each | Phase Electrical 1st Fix
- Row 336: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 1st Fix
- Row 358: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 2nd Fix

Labour:
- Row 314: Electrician & Mate (Hours) | Qty 33 Hours @ £63/Hours | Phase Electrical 1st Fix
- Row 315: Electrician's Mate (Hours) | Qty 0 Hours @ £25/Hours | Phase Electrical 1st Fix
- Row 337: Electrician (Hours) | Qty 18 Hours @ £38/Hours | Phase Electrical 2nd Fix

### Lounge / Decoration / Wall Decoration

Status: REVIEW REQUIRED. Official PlansXpress Wall Decoration treatment is known, but this project DXF does not expose a Wall Decoration treatment marker; room labels exist but room polygons, wall height, and decoration openings are not all available for deterministic quantity calculation.

Drawing references: none

Material:
- Row 161: HB00528 - Dado Paper 5m Roll (Allowance £5 Each) (Each) | Qty 0 Each @ £5/Each | Phase Internal Decoration
- Row 162: HB00118 - Quick Drying Floor Varnish Clear Gloss 2.5 Litre (Each) | Qty 0 Each @ £21.4/Each | Phase Internal Decoration
- Row 163: HB00114 - Trade Emulsion Paint Brilliant White 5 Litre (Each) | Qty 9 Each @ £23.3/Each | Phase Internal Decoration
- Row 164: HB00115 - Trade Emulsion Paint Magnolia 5 Litre (Each) | Qty 16 Each @ £38/Each | Phase Internal Decoration
- Row 165: HB00116 - Trade Gloss Paint Brilliant White 5 Litre (Each) | Qty 2 Each @ £42/Each | Phase Internal Decoration
- Row 166: HB00113 - Undercoat White 5 Litre (Each) | Qty 4 Each @ £38/Each | Phase Internal Decoration
- Row 167: HB00527 - Wallpaper 5.3m² Roll (Allowance £10 Each) (Each) | Qty 0 Each @ £10/Each | Phase Internal Decoration
- Row 168: HB00529 - Wallpaper Paste (16 Roll) (Each) | Qty 0 Each @ £6.3/Each | Phase Internal Decoration
- Row 169: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Decoration

Labour:
- Row 159: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Decoration
- Row 160: Decorator (Hours) | Qty 181 Hours @ £29/Hours | Phase Internal Decoration

### Lounge / Electrical / Mains Downlight Fire Rated

Status: MATCH. Project-wide DXF quantity equals exact HBXL Smart Schedule resource quantity. HBXL is not room-split, so area quantities remain drawing-derived.

Drawing references: drawing-0023, drawing-0027, drawing-0028, drawing-0030, drawing-0031, drawing-0032

Material:
- Row 351: HB03626 - Mains Downlight Fire Rated (Each) | Qty 11 Each @ £9.2/Each | Phase Electrical 2nd Fix
- Row 316: HB00172 - 3 Core & Earth Cable 1mm (100m) (Each) | Qty 1 Each @ £67/Each | Phase Electrical 1st Fix
- Row 322: HB00173 - Cable Clips 1mm (Pack of 100) (Each) | Qty 1 Each @ £1.13/Each | Phase Electrical 1st Fix
- Row 325: HB03632 - Fire Hood For Downlight (Each) | Qty 0 Each @ £6.2/Each | Phase Electrical 1st Fix
- Row 327: HB03633 - Insulation Guard for Downlight (Each) | Qty 0 Each @ £7.35/Each | Phase Electrical 1st Fix
- Row 328: HB00222 - Sheathing Metal 12.5mm x 2m (Each) | Qty 11 Each @ £1.67/Each | Phase Electrical 1st Fix
- Row 329: HB00223 - Sheathing Metal 25mm x 2m (Each) | Qty 24 Each @ £2.1/Each | Phase Electrical 1st Fix
- Row 330: HB04174 - Twin & Earth Cable 1.5mm (50m) (Each) | Qty 2 Each @ £30/Each | Phase Electrical 1st Fix
- Row 331: HB00174 - Twin & Earth Cable 1mm (50m) (Each) | Qty 0 Each @ £27.5/Each | Phase Electrical 1st Fix
- Row 336: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 1st Fix
- Row 358: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 2nd Fix

Labour:
- Row 314: Electrician & Mate (Hours) | Qty 33 Hours @ £63/Hours | Phase Electrical 1st Fix
- Row 315: Electrician's Mate (Hours) | Qty 0 Hours @ £25/Hours | Phase Electrical 1st Fix
- Row 337: Electrician (Hours) | Qty 18 Hours @ £38/Hours | Phase Electrical 2nd Fix

### Main Bedroom / Decoration / Wall Decoration

Status: REVIEW REQUIRED. Official PlansXpress Wall Decoration treatment is known, but this project DXF does not expose a Wall Decoration treatment marker; room labels exist but room polygons, wall height, and decoration openings are not all available for deterministic quantity calculation.

Drawing references: none

Material:
- Row 161: HB00528 - Dado Paper 5m Roll (Allowance £5 Each) (Each) | Qty 0 Each @ £5/Each | Phase Internal Decoration
- Row 162: HB00118 - Quick Drying Floor Varnish Clear Gloss 2.5 Litre (Each) | Qty 0 Each @ £21.4/Each | Phase Internal Decoration
- Row 163: HB00114 - Trade Emulsion Paint Brilliant White 5 Litre (Each) | Qty 9 Each @ £23.3/Each | Phase Internal Decoration
- Row 164: HB00115 - Trade Emulsion Paint Magnolia 5 Litre (Each) | Qty 16 Each @ £38/Each | Phase Internal Decoration
- Row 165: HB00116 - Trade Gloss Paint Brilliant White 5 Litre (Each) | Qty 2 Each @ £42/Each | Phase Internal Decoration
- Row 166: HB00113 - Undercoat White 5 Litre (Each) | Qty 4 Each @ £38/Each | Phase Internal Decoration
- Row 167: HB00527 - Wallpaper 5.3m² Roll (Allowance £10 Each) (Each) | Qty 0 Each @ £10/Each | Phase Internal Decoration
- Row 168: HB00529 - Wallpaper Paste (16 Roll) (Each) | Qty 0 Each @ £6.3/Each | Phase Internal Decoration
- Row 169: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Decoration

Labour:
- Row 159: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Decoration
- Row 160: Decorator (Hours) | Qty 181 Hours @ £29/Hours | Phase Internal Decoration

### Main Bedroom / Electrical / Ceiling Rose and Pendant

Status: MATCH. Project-wide DXF quantity equals exact HBXL Smart Schedule resource quantity. HBXL is not room-split, so area quantities remain drawing-derived.

Drawing references: drawing-0033

Material:
- Row 339: HB00189 - Ceiling Rose and Pendant (Each) | Qty 6 Each @ £3.75/Each | Phase Electrical 2nd Fix
- Row 316: HB00172 - 3 Core & Earth Cable 1mm (100m) (Each) | Qty 1 Each @ £67/Each | Phase Electrical 1st Fix
- Row 322: HB00173 - Cable Clips 1mm (Pack of 100) (Each) | Qty 1 Each @ £1.13/Each | Phase Electrical 1st Fix
- Row 325: HB03632 - Fire Hood For Downlight (Each) | Qty 0 Each @ £6.2/Each | Phase Electrical 1st Fix
- Row 327: HB03633 - Insulation Guard for Downlight (Each) | Qty 0 Each @ £7.35/Each | Phase Electrical 1st Fix
- Row 328: HB00222 - Sheathing Metal 12.5mm x 2m (Each) | Qty 11 Each @ £1.67/Each | Phase Electrical 1st Fix
- Row 329: HB00223 - Sheathing Metal 25mm x 2m (Each) | Qty 24 Each @ £2.1/Each | Phase Electrical 1st Fix
- Row 330: HB04174 - Twin & Earth Cable 1.5mm (50m) (Each) | Qty 2 Each @ £30/Each | Phase Electrical 1st Fix
- Row 331: HB00174 - Twin & Earth Cable 1mm (50m) (Each) | Qty 0 Each @ £27.5/Each | Phase Electrical 1st Fix
- Row 336: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 1st Fix
- Row 358: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 2nd Fix

Labour:
- Row 314: Electrician & Mate (Hours) | Qty 33 Hours @ £63/Hours | Phase Electrical 1st Fix
- Row 315: Electrician's Mate (Hours) | Qty 0 Hours @ £25/Hours | Phase Electrical 1st Fix
- Row 337: Electrician (Hours) | Qty 18 Hours @ £38/Hours | Phase Electrical 2nd Fix

### Main Bedroom / Electrical / Review Required: Block88816

Status: REVIEW REQUIRED. unknown electrical symbol

Drawing references: drawing-0064

No HBXL resource rows safely linked.

### Other / Decoration / HBXL Baseline: Internal Decoration

Status: REVIEW REQUIRED. HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.

Drawing references: none

Material:
- Row 161: HB00528 - Dado Paper 5m Roll (Allowance £5 Each) (Each) | Qty 0 Each @ £5/Each | Phase Internal Decoration
- Row 162: HB00118 - Quick Drying Floor Varnish Clear Gloss 2.5 Litre (Each) | Qty 0 Each @ £21.4/Each | Phase Internal Decoration
- Row 163: HB00114 - Trade Emulsion Paint Brilliant White 5 Litre (Each) | Qty 9 Each @ £23.3/Each | Phase Internal Decoration
- Row 164: HB00115 - Trade Emulsion Paint Magnolia 5 Litre (Each) | Qty 16 Each @ £38/Each | Phase Internal Decoration
- Row 165: HB00116 - Trade Gloss Paint Brilliant White 5 Litre (Each) | Qty 2 Each @ £42/Each | Phase Internal Decoration
- Row 166: HB00113 - Undercoat White 5 Litre (Each) | Qty 4 Each @ £38/Each | Phase Internal Decoration
- Row 167: HB00527 - Wallpaper 5.3m² Roll (Allowance £10 Each) (Each) | Qty 0 Each @ £10/Each | Phase Internal Decoration
- Row 168: HB00529 - Wallpaper Paste (16 Roll) (Each) | Qty 0 Each @ £6.3/Each | Phase Internal Decoration
- Row 169: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Decoration

Labour:
- Row 159: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Decoration
- Row 160: Decorator (Hours) | Qty 181 Hours @ £29/Hours | Phase Internal Decoration

### Other / Decoration / HBXL Baseline: Internal Preparation

Status: REVIEW REQUIRED. HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.

Drawing references: none

Material:
- Row 394: HB00567 - Sundry Materials (£) (Each) | Qty 0 Each @ £1/Each | Phase Internal Preparation

Labour:
- Row 392: Decorator (Hours) | Qty 0 Hours @ £29/Hours | Phase Internal Preparation
- Row 393: General Labourer (Hours) | Qty 0 Hours @ £21/Hours | Phase Internal Preparation

Plant:
- Row 395: Shovel (Week) | Qty 0 Week @ £12/Week | Phase Internal Preparation
- Row 396: Wheelbarrow (Week) | Qty 0 Week @ £10/Week | Phase Internal Preparation
- Row 397: Breaker - Bosch 11208/Kango 637 (Week) | Qty 0 Week @ £50/Week | Phase Internal Preparation
- Row 398: Skip - 6 Yard (4.6m³) inc. Disposal (Each) | Qty 0 Each @ £265/Each | Phase Internal Preparation
- Row 399: Delivery (10 to 15 Miles) (Each) | Qty 0 Each @ £40/Each | Phase Internal Preparation

### Other / Electrical / Review Required: Block14327

Status: REVIEW REQUIRED. unknown electrical symbol

Drawing references: drawing-0001

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Block91259

Status: REVIEW REQUIRED. unknown electrical symbol

Drawing references: drawing-0066

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Ceiling Rose and Pendant

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0037

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Double Light Switch - One Way

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0067

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Double Socket 13A

Status: REVIEW REQUIRED. ambiguous nearest room label

Drawing references: drawing-0011

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Double Socket 13A

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0013

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Double Socket 13A with Twin USB

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0009

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Double Socket 13A with Twin USB

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0039

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Double Socket 13A with Twin USB

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0040

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Double Socket 13A with Twin USB

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0041

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Double Socket 13A with Twin USB

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0042

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Double Socket 13A with Twin USB

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0043

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Double Socket 13A with Twin USB

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0044

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Double Socket 13A with Twin USB

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0045

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Double Socket 13A with Twin USB

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0046

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Double Socket 13A with Twin USB

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0047

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Fluorescent Light 1500mm

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0058

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Mains Downlight Fire Rated

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0022

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Mains Downlight Fire Rated

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0025

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Mains Downlight Fire Rated

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0026

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Mains Downlight Fire Rated

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0029

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Mains Downlight Standard

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0018

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Pull Light Switch

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0004

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Single Light Switch

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0061

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Single Light Switch

Status: REVIEW REQUIRED. ambiguous nearest room label

Drawing references: drawing-0065

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Single Light Switch - One Way

Status: REVIEW REQUIRED. ambiguous nearest room label

Drawing references: drawing-0059

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Single Light Switch - One Way

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0060

No HBXL resource rows safely linked.

### Other / Electrical / Review Required: Single Light Switch - Two Way

Status: REVIEW REQUIRED. wall blocks direct association to nearest room label

Drawing references: drawing-0014

No HBXL resource rows safely linked.

### Other / Flooring / Tiling / HBXL Baseline: Internal Fitting Out

Status: REVIEW REQUIRED. HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.

Drawing references: none

Material:
- Row 362: HB01761 - Floor Tiles (Allowance £30 per m²) (m²) | Qty 6 m² @ £30/m² | Phase Internal Fitting Out
- Row 363: HB04142 - 2mm Foam Underlay 15m² (Each) | Qty 5 Each @ £23/Each | Phase Internal Fitting Out
- Row 364: HB04143 - 3mm Combi Underlay 15m² (Each) | Qty 2 Each @ £20.2/Each | Phase Internal Fitting Out
- Row 365: HB04194 - Allowance for Carpeting (Each) | Qty 798 Each @ £1/Each | Phase Internal Fitting Out
- Row 366: HB04160 - Allowance for Porcelain Floor Tiles (Each) | Qty 540 Each @ £1/Each | Phase Internal Fitting Out
- Row 367: HB04155 - Allowance for Solid Wood Flooring (Each) | Qty 1372 Each @ £1/Each | Phase Internal Fitting Out
- Row 368: HB04170 - Allowance for Vinyl Flooring (Each) | Qty 1333 Each @ £1/Each | Phase Internal Fitting Out
- Row 369: HB5002 - Allowance for Wood Laminate Flooring (£) | Qty 1394 £ @ £1/£ | Phase Internal Fitting Out
- Row 370: HB01766 - Carpet Gripper Rod (m) | Qty 0 m @ £0.61/m | Phase Internal Fitting Out
- Row 371: HB01767 - Carpet Underlay (m²) | Qty 80 m² @ £4.2/m² | Phase Internal Fitting Out
- Row 372: HB04158 - De-coupling Waterproof Membrane (Allowance £8 per m²) (m²) | Qty 27 m² @ £8/m² | Phase Internal Fitting Out
- Row 373: HB01768 - Double Sided Carpet Tape 25m (Each) | Qty 8 Each @ £4.25/Each | Phase Internal Fitting Out
- Row 374: HB04159 - Large Format Tile Adhesive 20kg (Each) | Qty 11 Each @ £21.4/Each | Phase Internal Fitting Out
- Row 375: HB04157 - Porcelain and Stone Tile Sealer 5ltr (Each) | Qty 2 Each @ £70/Each | Phase Internal Fitting Out
- Row 376: HB04148 - Premium Scotia Beading 2.4m (Each) | Qty 0 Each @ £13.9/Each | Phase Internal Fitting Out
- Row 377: HB04145 - Self Levelling Compound 25kg (Each) | Qty 89 Each @ £15.1/Each | Phase Internal Fitting Out
- Row 378: HB04146 - Standard Scotia Beading 2.4m (Each) | Qty 0 Each @ £3.6/Each | Phase Internal Fitting Out
- Row 379: HB04152 - Threshold Door Bar 0.9m (Each) | Qty 8 Each @ £8.35/Each | Phase Internal Fitting Out
- Row 380: HB04153 - Threshold Door Bar 2.15m (Allowance £20) (Each) | Qty 8 Each @ £20/Each | Phase Internal Fitting Out
- Row 381: HB04171 - Vinyl Floor Adhesive (Each) | Qty 4 Each @ £22.3/Each | Phase Internal Fitting Out
- Row 382: HB00361 - Cut Clasp Nails 65mm x 25kg (Each) | Qty 0 Each @ £98/Each | Phase Internal Fitting Out
- Row 383: HB00530 - Panel Adhesive (Each) | Qty 0 Each @ £4.8/Each | Phase Internal Fitting Out
- Row 384: HB00409 - Silicone Sealant White 310ml (Each) | Qty 1 Each @ £3.4/Each | Phase Internal Fitting Out
- Row 385: HB00402 - Waterproof Tile Adhesive 10 Litre (Each) | Qty 1 Each @ £15/Each | Phase Internal Fitting Out
- Row 386: HB00401 - Waterproof Tile Adhesive and Grout 7.5 Litre (Each) | Qty 1 Each @ £25.5/Each | Phase Internal Fitting Out
- Row 387: HB00386 - Hardwood Exterior Ply 2440 x 1220 x 5.5mm (Each) | Qty 24 Each @ £13.2/Each | Phase Internal Fitting Out
- Row 388: HB00567 - Sundry Materials (£) (Each) | Qty 140 Each @ £1/Each | Phase Internal Fitting Out
- Row 391: To be Defined (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Fitting Out

Labour:
- Row 359: Joiner (Hours) | Qty 97 Hours @ £33/Hours | Phase Internal Fitting Out
- Row 360: Ceramic Tiler (Hours) | Qty 57 Hours @ £32/Hours | Phase Internal Fitting Out
- Row 361: Specialist Floor Fitter (Hours) | Qty 58 Hours @ £30/Hours | Phase Internal Fitting Out

Plant:
- Row 389: Tile Cutter (Week) | Qty 1 Week @ £10/Week | Phase Internal Fitting Out
- Row 390: Tile Cutter Electric (Week) | Qty 1 Week @ £115/Week | Phase Internal Fitting Out

### Other / Joinery / HBXL Baseline: Joinery 1st Fix

Status: REVIEW REQUIRED. HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.

Drawing references: none

Material:
- Row 176: Aluminium Double Glazed (1.4 U-value) Bi-fold Door, RAL 7016: Anthracite Grey Style 330 2690 x 2090mm (Each) | Qty 1 Each @ £3660/Each | Phase Joinery 1st Fix
- Row 177: Composite External Door, Red 4 Panel Type 3 - 2 Glass 920 x 2090mm (Each) | Qty 1 Each @ £1100/Each | Phase Joinery 1st Fix
- Row 178: Aluminium Double Glazed (1.4 U-value) French Door, RAL 7016: Anthracite Grey French door with midrail 1790 x 2090mm (Each) | Qty 1 Each @ £1880/Each | Phase Joinery 1st Fix
- Row 180: HB00437 - 110C PVC-U Window Clear Low E Glass 600 x 1050mm (Each) | Qty 1 Each @ £140/Each | Phase Joinery 1st Fix
- Row 181: HB00438 - 112C PVC-U Window Clear Low E Glass 600 x 1200mm (Each) | Qty 1 Each @ £147/Each | Phase Joinery 1st Fix
- Row 182: HB00440 - 212C PVC-U Window Clear Low E Glass 1200 x 1200mm (Each) | Qty 8 Each @ £275/Each | Phase Joinery 1st Fix
- Row 186: HB00135 - Hardwood Weatherboard (Each) | Qty 0 Each @ £8.35/Each | Phase Joinery 1st Fix
- Row 190: HB00065 - Sawn Softwood Kiln Dried 47 x 75mm (m) | Qty 46 m @ £2.45/m | Phase Joinery 1st Fix
- Row 191: HB00066 - Sawn Softwood Kiln Dried Treated 47 x 50mm (m) | Qty 0 m @ £1.79/m | Phase Joinery 1st Fix
- Row 192: HB00123 - Butt Hinge Brassed 102mm (Pair) | Qty 0 Pair @ £9.35/Pair | Phase Joinery 1st Fix
- Row 193: HB00119 - Georgian Brass 5 Lever BS Exterior Door Pack (Each) | Qty 0 Each @ £55/Each | Phase Joinery 1st Fix
- Row 194: HB00120 - Georgian Brass Letter Plate 254 x 75mm (Each) | Qty 1 Each @ £14/Each | Phase Joinery 1st Fix
- Row 195: HB03350 - Acoustic Rockwool Insulation (7.20m²) (Each) | Qty 17 Each @ £49.5/Each | Phase Joinery 1st Fix
- Row 196: HB00234 - GP Fibreglass Insulation Roll 200mm 4.5m² (Each) | Qty 59 Each @ £22.7/Each | Phase Joinery 1st Fix
- Row 197: HB00477 - PIR Insulation Board 2400 x 1200 x 20mm (Each) | Qty 0 Each @ £17.5/Each | Phase Joinery 1st Fix
- Row 198: HB00561 - PIR Insulation Board 2400 x 1200 x 50mm (Each) | Qty 0 Each @ £24.4/Each | Phase Joinery 1st Fix
- Row 199: HB01751 - Metal C Stud 2400mm (Each) | Qty 94 Each @ £2.5/Each | Phase Joinery 1st Fix
- Row 200: HB01757 - Metal Fixing Channel 1197mm (Each) | Qty 0 Each @ £11.6/Each | Phase Joinery 1st Fix
- Row 201: HB01752 - Metal Partition Channel 3600mm (Each) | Qty 30 Each @ £8.95/Each | Phase Joinery 1st Fix
- Row 202: HB01755 - Service Support Plate 130mm (Pack of 100) (Each) | Qty 0 Each @ £120/Each | Phase Joinery 1st Fix
- Row 203: HB00362 - Cut Clasp Nails 75mm x 25kg (Each) | Qty 0 Each @ £98/Each | Phase Joinery 1st Fix
- Row 204: HB00371 - Hammer-in Fixing 8mm x 100mm (Pack of 12) (Each) | Qty 9 Each @ £2.65/Each | Phase Joinery 1st Fix
- Row 205: HB01747 - Screws and Fixings Allowance (Each) | Qty 125 Each @ £1/Each | Phase Joinery 1st Fix
- Row 206: HB00372 - Wood Screws Steel CSK Twin Thread 10 x 2.5 inch (Pack of 100) (Each) | Qty 0 Each @ £3.85/Each | Phase Joinery 1st Fix
- Row 207: HB00373 - Wood Screws Steel CSK Twin Thread 10 x 3 inch (Pack of 100) (Each) | Qty 1 Each @ £7.2/Each | Phase Joinery 1st Fix
- Row 208: HB00616 - BBA OSB3 2440 x 1220 x 18mm (Each) | Qty 0 Each @ £17.8/Each | Phase Joinery 1st Fix
- Row 209: HB00384 - Hardwood Exterior Ply 2440 x 1220 x 12mm (Each) | Qty 1 Each @ £19.5/Each | Phase Joinery 1st Fix
- Row 210: HB01703 - PSE Softwood Door Casing Material 32 x 138mm (m) | Qty 44 m @ £9.95/m | Phase Joinery 1st Fix
- Row 211: HB00388 - Window Board 25 x 219mm (m) | Qty 13 m @ £14.2/m | Phase Joinery 1st Fix
- Row 212: Not Required (Unit) | Qty 20123 Unit @ £0/Unit | Phase Joinery 1st Fix

Labour:
- Row 179: Not Required (Unit) | Qty 9175 Unit @ £0/Unit | Phase Joinery 1st Fix
- Row 183: Joiner (Hours) | Qty 42 Hours @ £33/Hours | Phase Joinery 1st Fix
- Row 184: Joiner & Mate (Hours) | Qty 28 Hours @ £55/Hours | Phase Joinery 1st Fix
- Row 185: Joiner's Mate (Hours) | Qty 10 Hours @ £22/Hours | Phase Joinery 1st Fix
- Row 187: Insulation Specialist (Hours) | Qty 20 Hours @ £26/Hours | Phase Joinery 1st Fix
- Row 188: Partition Installer (Hours) | Qty 21 Hours @ £24/Hours | Phase Joinery 1st Fix
- Row 189: Plasterer's Mate (Hours) | Qty 11 Hours @ £21/Hours | Phase Joinery 1st Fix

### Other / Joinery / HBXL Baseline: Joinery 2nd Fix

Status: REVIEW REQUIRED. HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.

Drawing references: none

Material:
- Row 403: HB00789 - Internal Door 6 Panel Textured Undercoated 686 x 1981mm (Each) | Qty 1 Each @ £42.5/Each | Phase Joinery 2nd Fix
- Row 404: HB00138 - Internal Door 6 Panel Textured Undercoated 864 x 1981mm (Each) | Qty 7 Each @ £52/Each | Phase Joinery 2nd Fix
- Row 405: HB00123 - Butt Hinge Brassed 102mm (Pair) | Qty 16 Pair @ £9.35/Pair | Phase Joinery 2nd Fix
- Row 406: HB00122 - Georgian Brass Internal Latch Pack (Each) | Qty 8 Each @ £19/Each | Phase Joinery 2nd Fix
- Row 407: HB00361 - Cut Clasp Nails 65mm x 25kg (Each) | Qty 0 Each @ £98/Each | Phase Joinery 2nd Fix
- Row 408: HB00368 - Panel Pins Bright 40mm x 0.25kg (Each) | Qty 3 Each @ £4.2/Each | Phase Joinery 2nd Fix
- Row 409: HB00372 - Wood Screws Steel CSK Twin Thread 10 x 2.5 inch (Pack of 100) (Each) | Qty 0 Each @ £3.85/Each | Phase Joinery 2nd Fix
- Row 410: HB3709362 - Grab Adhesive 310ml (Each) | Qty 44 Each @ £2.5/Each | Phase Joinery 2nd Fix
- Row 411: HB00530 - Panel Adhesive (Each) | Qty 0 Each @ £4.8/Each | Phase Joinery 2nd Fix
- Row 412: HB00409 - Silicone Sealant White 310ml (Each) | Qty 3 Each @ £3.4/Each | Phase Joinery 2nd Fix
- Row 413: HB00384 - Hardwood Exterior Ply 2440 x 1220 x 12mm (Each) | Qty 0 Each @ £19.5/Each | Phase Joinery 2nd Fix
- Row 414: HB00533 - Dado Rail 2.4m (Allowance £7.50 Each) (Each) | Qty 0 Each @ £7.5/Each | Phase Joinery 2nd Fix
- Row 415: HB00534 - Picture Rail 2.4m (Allowance £7.65 Each) (Each) | Qty 0 Each @ £7.65/Each | Phase Joinery 2nd Fix
- Row 416: HB00418 - Skirting Torus/Ovolo 25 x 125mm (m) | Qty 192 m @ £6.45/m | Phase Joinery 2nd Fix
- Row 417: HB00419 - Torus Architrave 25 x 75mm (Redwood) (m) | Qty 89 m @ £4.05/m | Phase Joinery 2nd Fix
- Row 418: Not Required (Unit) | Qty 185 Unit @ £0/Unit | Phase Joinery 2nd Fix

Labour:
- Row 400: Joiner (Hours) | Qty 20 Hours @ £33/Hours | Phase Joinery 2nd Fix
- Row 401: Joiner & Mate (Hours) | Qty 4 Hours @ £55/Hours | Phase Joinery 2nd Fix
- Row 402: Joiner's Mate (Hours) | Qty 48 Hours @ £22/Hours | Phase Joinery 2nd Fix

### Other / Other / HBXL Baseline: Internal Parge Coat

Status: REVIEW REQUIRED. HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.

Drawing references: none

Material:
- Row 172: HB00002 - Building Sand Bulk Bag (Each) | Qty 3 Each @ £58/Each | Phase Internal Parge Coat
- Row 173: HB00547 - Natural Hydraulic Lime 25kg (Each) | Qty 14 Each @ £36/Each | Phase Internal Parge Coat
- Row 174: HB00008 - Sharp Sand Bulk Bag (Each) | Qty 1 Each @ £58.5/Each | Phase Internal Parge Coat
- Row 175: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Parge Coat

Labour:
- Row 170: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Parge Coat
- Row 171: 2 Plasterers & Mate (Hours) | Qty 10 Hours @ £83/Hours | Phase Internal Parge Coat

### Other / Plastering / HBXL Baseline: Plastering

Status: REVIEW REQUIRED. HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.

Drawing references: none

Material:
- Row 229: HB00104 - Readymix Floor Screed with Fibres (Allowance £165 per m³) (m³) | Qty 13 m³ @ £165/m³ | Phase Plastering
- Row 236: HB00109 - Blue Circle Mastercrete Original Cement 25kg Bag (Each) | Qty 0 Each @ £6.6/Each | Phase Plastering
- Row 237: HB04181 - Mortar Admix Plasticiser 25ltr (Each) | Qty 0 Each @ £26.4/Each | Phase Plastering
- Row 238: HB00110 - Ordinary Cement 25kg (Each) | Qty 0 Each @ £5.25/Each | Phase Plastering
- Row 239: HB00007 - Plastering Sand Bulk Bag (Each) | Qty 0 Each @ £57/Each | Phase Plastering
- Row 240: HB00008 - Sharp Sand Bulk Bag (Each) | Qty 0 Each @ £58.5/Each | Phase Plastering
- Row 241: HB00166 - Polythene Vapour Barrier Green 125mu 4 x 50m (Each) | Qty 1 Each @ £85.5/Each | Phase Plastering
- Row 242: HB00241 - Flooring Grade Polystyrene Insulation Sheet 2400 x 1200 x 25mm (Each) | Qty 0 Each @ £7.05/Each | Phase Plastering
- Row 243: HB00235 - GP Fibreglass Insulation Roll 150mm 6.99m² (Each) | Qty 0 Each @ £25.6/Each | Phase Plastering
- Row 244: HB00237 - GP Fibreglass Insulation Roll 150mm 6.99m² (Each) | Qty 0 Each @ £25.6/Each | Phase Plastering
- Row 245: HB03559 - Phenolic Floor Insulation Board 2400 x 1200 x 150mm (Each) | Qty 95 Each @ £166/Each | Phase Plastering
- Row 246: HB03547 - PIR Insulation Board 2400 x 1200 x 100mm (Each) | Qty 0 Each @ £41.5/Each | Phase Plastering
- Row 247: HB00231 - PIR Insulation Board 2400 x 1200 x 60mm (Each) | Qty 0 Each @ £29.7/Each | Phase Plastering
- Row 248: HB3709280 - Bellcast Render Bead 2.5m (Each) | Qty 0 Each @ £6/Each | Phase Plastering
- Row 249: HB00318 - Board Finish Plaster 25kg (Each) | Qty 62 Each @ £10.7/Each | Phase Plastering
- Row 250: HB3711380 - Cement Board Jointing Tape Mesh 50m (Each) | Qty 0 Each @ £36.5/Each | Phase Plastering
- Row 251: HB01723 - Fire Protective Plasterboard Square Edge 1200 x 2400 x 12.5mm (Each) | Qty 1 Each @ £15.2/Each | Phase Plastering
- Row 252: HB3709934 - Galvanised Thin Coat Plastering Bead 2.4m (m) | Qty 60 m @ £1.44/m | Phase Plastering
- Row 253: HB3709267 - Monocouche Render Exterior Cement Board 2400 x 900 x 12.5mm (Each) | Qty 0 Each @ £32/Each | Phase Plastering
- Row 254: HB3709270 - Monocouche Render Primer 15kg (Each) | Qty 0 Each @ £83.5/Each | Phase Plastering
- Row 255: HB3709266 - Monocouche Render Reinforcing Mesh 1m x 50m (Each) | Qty 0 Each @ £69/Each | Phase Plastering
- Row 256: HB3709272 - Monocouche Render Standard Base Coat 25kg (Each) | Qty 0 Each @ £12.3/Each | Phase Plastering
- Row 257: HB3709277 - Monocouche Render Textured Coat Finish 25kg (Each) | Qty 0 Each @ £15/Each | Phase Plastering
- Row 258: HB00320 - Multi Finish Plaster 25kg (Each) | Qty 0 Each @ £8.55/Each | Phase Plastering
- Row 259: HB00531 - Plaster 100mm Cove 3m (Allowance £6.50 Each) (Each) | Qty 0 Each @ £6.5/Each | Phase Plastering
- Row 260: HB00532 - Plaster 135mm Cornice 3m (Allowance £6.50 Each) (Each) | Qty 0 Each @ £6.5/Each | Phase Plastering
- Row 261: HB00313 - Plasterboard Adhesive 25kg (Each) | Qty 25 Each @ £10.3/Each | Phase Plastering
- Row 262: HB00315 - Plasterboard Square Edge 1200 x 2400 x 12.5mm (Each) | Qty 243 Each @ £9.6/Each | Phase Plastering
- Row 263: HB00314 - Plasterboard Tape 50mm x 90m (Each) | Qty 15 Each @ £6.25/Each | Phase Plastering
- Row 264: HB00312 - PVC Plastering Corner Bead 2.44m (Each) | Qty 29 Each @ £4.2/Each | Phase Plastering
- Row 265: HB3709283 - Render Angle Bead 3m (Each) | Qty 0 Each @ £7.25/Each | Phase Plastering
- Row 266: HB3709281 - Render Stop Bead 2.5m (Each) | Qty 0 Each @ £4.35/Each | Phase Plastering
- Row 267: HB00629 - Drywall Timber Screws 41mm (Pack of 1000) (Each) | Qty 0 Each @ £11.7/Each | Phase Plastering
- Row 268: HB00518 - Gyproc Drywall Screws 42mm (Pack of 1000) (Each) | Qty 3 Each @ £11.7/Each | Phase Plastering
- Row 269: HB3709261 - Insulated Plasterboard Fixing 105mm (Each) | Qty 0 Each @ £0.96/Each | Phase Plastering
- Row 270: HB3711389 - Stainless Steel Multipurpose Screws 5 x 50mm (Box of 200) (Each) | Qty 0 Each @ £17.5/Each | Phase Plastering
- Row 271: HB00530 - Panel Adhesive (Each) | Qty 0 Each @ £4.8/Each | Phase Plastering
- Row 272: HB00524 - PVA 5 Litre (Each) | Qty 5 Each @ £12.3/Each | Phase Plastering
- Row 273: HB00167 - Steel Reinforcement Mesh 4.8 x 2.4m A142 (Each) | Qty 0 Each @ £46/Each | Phase Plastering
- Row 277: Not Required (Unit) | Qty 4016 Unit @ £0/Unit | Phase Plastering

Labour:
- Row 230: Not Required (Unit) | Qty 2803 Unit @ £0/Unit | Phase Plastering
- Row 232: Insulation Specialist (Hours) | Qty 0 Hours @ £26/Hours | Phase Plastering
- Row 233: 2 Plasterers & Mate (Hours) | Qty 193 Hours @ £83/Hours | Phase Plastering
- Row 234: Plasterer (Hours) | Qty 24 Hours @ £31/Hours | Phase Plastering
- Row 235: Plasterer's Mate (Hours) | Qty 0 Hours @ £21/Hours | Phase Plastering

Plant:
- Row 231: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Plastering
- Row 274: Pan Mixer - Diesel (Week) | Qty 0 Week @ £110/Week | Phase Plastering
- Row 275: Screed Pump (Week) | Qty 0 Week @ £550/Week | Phase Plastering
- Row 276: Wheelbarrow (Week) | Qty 0 Week @ £10/Week | Phase Plastering

### Passage / Decoration / Wall Decoration

Status: REVIEW REQUIRED. Official PlansXpress Wall Decoration treatment is known, but this project DXF does not expose a Wall Decoration treatment marker; room labels exist but room polygons, wall height, and decoration openings are not all available for deterministic quantity calculation.

Drawing references: none

Material:
- Row 161: HB00528 - Dado Paper 5m Roll (Allowance £5 Each) (Each) | Qty 0 Each @ £5/Each | Phase Internal Decoration
- Row 162: HB00118 - Quick Drying Floor Varnish Clear Gloss 2.5 Litre (Each) | Qty 0 Each @ £21.4/Each | Phase Internal Decoration
- Row 163: HB00114 - Trade Emulsion Paint Brilliant White 5 Litre (Each) | Qty 9 Each @ £23.3/Each | Phase Internal Decoration
- Row 164: HB00115 - Trade Emulsion Paint Magnolia 5 Litre (Each) | Qty 16 Each @ £38/Each | Phase Internal Decoration
- Row 165: HB00116 - Trade Gloss Paint Brilliant White 5 Litre (Each) | Qty 2 Each @ £42/Each | Phase Internal Decoration
- Row 166: HB00113 - Undercoat White 5 Litre (Each) | Qty 4 Each @ £38/Each | Phase Internal Decoration
- Row 167: HB00527 - Wallpaper 5.3m² Roll (Allowance £10 Each) (Each) | Qty 0 Each @ £10/Each | Phase Internal Decoration
- Row 168: HB00529 - Wallpaper Paste (16 Roll) (Each) | Qty 0 Each @ £6.3/Each | Phase Internal Decoration
- Row 169: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Decoration

Labour:
- Row 159: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Decoration
- Row 160: Decorator (Hours) | Qty 181 Hours @ £29/Hours | Phase Internal Decoration

### Passage / Electrical / Ceiling Rose and Pendant

Status: MATCH. Project-wide DXF quantity equals exact HBXL Smart Schedule resource quantity. HBXL is not room-split, so area quantities remain drawing-derived.

Drawing references: drawing-0035, drawing-0036

Material:
- Row 339: HB00189 - Ceiling Rose and Pendant (Each) | Qty 6 Each @ £3.75/Each | Phase Electrical 2nd Fix
- Row 316: HB00172 - 3 Core & Earth Cable 1mm (100m) (Each) | Qty 1 Each @ £67/Each | Phase Electrical 1st Fix
- Row 322: HB00173 - Cable Clips 1mm (Pack of 100) (Each) | Qty 1 Each @ £1.13/Each | Phase Electrical 1st Fix
- Row 325: HB03632 - Fire Hood For Downlight (Each) | Qty 0 Each @ £6.2/Each | Phase Electrical 1st Fix
- Row 327: HB03633 - Insulation Guard for Downlight (Each) | Qty 0 Each @ £7.35/Each | Phase Electrical 1st Fix
- Row 328: HB00222 - Sheathing Metal 12.5mm x 2m (Each) | Qty 11 Each @ £1.67/Each | Phase Electrical 1st Fix
- Row 329: HB00223 - Sheathing Metal 25mm x 2m (Each) | Qty 24 Each @ £2.1/Each | Phase Electrical 1st Fix
- Row 330: HB04174 - Twin & Earth Cable 1.5mm (50m) (Each) | Qty 2 Each @ £30/Each | Phase Electrical 1st Fix
- Row 331: HB00174 - Twin & Earth Cable 1mm (50m) (Each) | Qty 0 Each @ £27.5/Each | Phase Electrical 1st Fix
- Row 336: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 1st Fix
- Row 358: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 2nd Fix

Labour:
- Row 314: Electrician & Mate (Hours) | Qty 33 Hours @ £63/Hours | Phase Electrical 1st Fix
- Row 315: Electrician's Mate (Hours) | Qty 0 Hours @ £25/Hours | Phase Electrical 1st Fix
- Row 337: Electrician (Hours) | Qty 18 Hours @ £38/Hours | Phase Electrical 2nd Fix

### Roof / Roofing / HBXL Baseline: Flat Roof Structure

Status: REVIEW REQUIRED. HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.

Drawing references: none

Material:
- Row 120: HB00310 - Lateral Restraint Strap 30 x 5 x 1200mm bent at 150mmm (Each) | Qty 36 Each @ £5.95/Each | Phase Flat Roof Structure
- Row 121: HB00050 - Sawn Dry Graded Structural Softwood 47 x 100mm (m) | Qty 0 m @ £3.3/m | Phase Flat Roof Structure
- Row 122: HB00056 - Sawn Dry Graded Structural Softwood 75 x 100mm (m) | Qty 0 m @ £5.25/m | Phase Flat Roof Structure
- Row 123: HB00058 - Sawn Dry Graded Structural Softwood Treated 47 x 100mm (m) | Qty 0 m @ £3.6/m | Phase Flat Roof Structure
- Row 124: HB00060 - Sawn Dry Graded Structural Softwood Treated 47 x 200mm (m) | Qty 85 m @ £7.2/m | Phase Flat Roof Structure
- Row 125: HB00574 - Sawn Firring Treated 47 x 50mm (m) | Qty 43 m @ £1.79/m | Phase Flat Roof Structure
- Row 126: HB00066 - Sawn Softwood Kiln Dried Treated 47 x 50mm (m) | Qty 110 m @ £1.79/m | Phase Flat Roof Structure
- Row 127: HB00171 - Polythene DPM Blue 300mu 4 x 25m PIFA (27.6kg) (Each) | Qty 0 Each @ £52.5/Each | Phase Flat Roof Structure
- Row 128: HB03590 - PIR Flat Roof Insulation Board 2400 x 1200 x 140mm (Each) | Qty 11 Each @ £61.5/Each | Phase Flat Roof Structure
- Row 129: HB00554 - White 400mm PVC Board x 9mm x 5m (Each) | Qty 6 Each @ £39.5/Each | Phase Flat Roof Structure
- Row 130: HB00371 - Hammer-in Fixing 8mm x 100mm (Pack of 12) (Each) | Qty 0 Each @ £2.65/Each | Phase Flat Roof Structure
- Row 131: HB00358 - Round Wire Nails Bright 100mm x 5kg (Each) | Qty 6 Each @ £26.7/Each | Phase Flat Roof Structure
- Row 132: HB00558 - White Plastic Top Nail 40mm - 10G (Pack of 100) (Each) | Qty 3 Each @ £4.65/Each | Phase Flat Roof Structure
- Row 133: HB00385 - Hardwood Exterior Ply 2440 x 1220 x 18mm (Each) | Qty 11 Each @ £23.1/Each | Phase Flat Roof Structure
- Row 134: Not Required (Unit) | Qty 40 Unit @ £0/Unit | Phase Flat Roof Structure

Labour:
- Row 115: Not Required (Unit) | Qty 32 Unit @ £0/Unit | Phase Flat Roof Structure
- Row 116: Joiner (Hours) | Qty 17 Hours @ £33/Hours | Phase Flat Roof Structure
- Row 117: Joiner & Mate (Hours) | Qty 9 Hours @ £55/Hours | Phase Flat Roof Structure
- Row 118: Flat Roofer & Mate (Hours) | Qty 0 Hours @ £52/Hours | Phase Flat Roof Structure
- Row 119: Insulation Specialist (Hours) | Qty 5 Hours @ £26/Hours | Phase Flat Roof Structure

### Roof / Roofing / HBXL Baseline: Flat Roof Waterproofing

Status: REVIEW REQUIRED. HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.

Drawing references: none

Material:
- Row 139: HB00326 - Lead Flashing Code 4 - 3m x 300mm (Each) | Qty 0 Each @ £51/Each | Phase Flat Roof Waterproofing
- Row 140: HB3708538 - GRP Fibreglass 75mm Detail Bandage 50m Roll (Roll) | Qty 0 Roll @ £19.4/Roll | Phase Flat Roof Waterproofing
- Row 141: HB3708529 - GRP Fibreglass Angle Fillet Trim 3m (Each) | Qty 0 Each @ £13.2/Each | Phase Flat Roof Waterproofing
- Row 142: HB3708534 - GRP Fibreglass Catalyst 1kg (Each) | Qty 2 Each @ £8.15/Each | Phase Flat Roof Waterproofing
- Row 143: HB3708531 - GRP Fibreglass Drip Trim 3m (Each) | Qty 0 Each @ £18.8/Each | Phase Flat Roof Waterproofing
- Row 144: HB3708532 - GRP Fibreglass External Corner Fillet (Each) | Qty 4 Each @ £11/Each | Phase Flat Roof Waterproofing
- Row 145: HB3708539 - GRP Fibreglass Fabric 450g Chopped Strand Mat 44.44m² Pack (Pack) | Qty 8 Pack @ £50.5/Pack | Phase Flat Roof Waterproofing
- Row 146: HB3708533 - GRP Fibreglass Resin 20kg (Each) | Qty 2 Each @ £43.5/Each | Phase Flat Roof Waterproofing
- Row 147: HB3708535 - GRP Fibreglass Topcoat 20kg (Each) | Qty 1 Each @ £78.5/Each | Phase Flat Roof Waterproofing
- Row 148: HB3708536 - GRP Fibreglass Trim Adhesive 310ml (Each) | Qty 0 Each @ £8.05/Each | Phase Flat Roof Waterproofing
- Row 149: HB3708537 - GRP Fibreglass Upstand Trim 3m (Each) | Qty 0 Each @ £13.2/Each | Phase Flat Roof Waterproofing
- Row 150: HB00359 - Clout Nails Galvanised 50mm x 25kg (slating) (Each) | Qty 0 Each @ £133/Each | Phase Flat Roof Waterproofing
- Row 151: HB00567 - Sundry Materials (£) (Each) | Qty 50 Each @ £1/Each | Phase Flat Roof Waterproofing
- Row 152: Not Required (Unit) | Qty 30 Unit @ £0/Unit | Phase Flat Roof Waterproofing

Labour:
- Row 135: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Flat Roof Waterproofing
- Row 138: Flat Roofer & Mate (Hours) | Qty 11 Hours @ £52/Hours | Phase Flat Roof Waterproofing

Plant:
- Row 136: Not Required (Unit) | Qty 8 Unit @ £0/Unit | Phase Flat Roof Waterproofing

Subcontractor:
- Row 137: Not Required (Unit) | Qty 30 Unit @ £0/Unit | Phase Flat Roof Waterproofing

### Roof / Roofing / HBXL Baseline: Roof Structure

Status: REVIEW REQUIRED. HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.

Drawing references: none

Material:
- Row 67: HB00568 - Truss Roof Assembly (Each) | Qty 26643 Each @ £1/Each | Phase Roof Structure
- Row 72: HB00310 - Lateral Restraint Strap 30 x 5 x 1200mm bent at 150mmm (Each) | Qty 46 Each @ £5.95/Each | Phase Roof Structure
- Row 73: HB00311 - Lateral Restraint Strap 30 x 5 x 1600mm bent at 100mmm (Each) | Qty 29 Each @ £8.45/Each | Phase Roof Structure
- Row 74: HB00047 - Sawn Batten Treated 25 x 38mm (m) | Qty 69 m @ £0.72/m | Phase Roof Structure
- Row 75: HB00572 - Sawn Dry Graded Structural Softwood Treated 25 x 100mm (m) | Qty 125 m @ £1.9/m | Phase Roof Structure
- Row 76: HB00571 - Sawn Dry Graded Structural Softwood Treated 25 x 150mm (m) | Qty 25 m @ £2.9/m | Phase Roof Structure
- Row 77: HB00058 - Sawn Dry Graded Structural Softwood Treated 47 x 100mm (m) | Qty 0 m @ £3.6/m | Phase Roof Structure
- Row 78: HB00059 - Sawn Dry Graded Structural Softwood Treated 47 x 150mm (m) | Qty 131 m @ £5.4/m | Phase Roof Structure
- Row 79: HB00608 - Sawn Dry Graded Structural Softwood Treated 75 x 100mm (m) | Qty 30 m @ £5.75/m | Phase Roof Structure
- Row 80: HB00574 - Sawn Firring Treated 47 x 50mm (m) | Qty 30 m @ £1.79/m | Phase Roof Structure
- Row 81: HB00066 - Sawn Softwood Kiln Dried Treated 47 x 50mm (m) | Qty 57 m @ £1.79/m | Phase Roof Structure
- Row 82: HB00353 - Breather Membrane Heavy Weight 1.5 x 50m (Each) | Qty 0 Each @ £139/Each | Phase Roof Structure
- Row 83: HB00324 - Lead Flashing Code 4 - 3m x 180mm (Each) | Qty 0 Each @ £30.5/Each | Phase Roof Structure
- Row 84: HB00326 - Lead Flashing Code 4 - 3m x 300mm (Each) | Qty 0 Each @ £51/Each | Phase Roof Structure
- Row 85: HB04041 - Plastic Half Round Gutter 4m x 112mm (Each) | Qty 7 Each @ £11.3/Each | Phase Roof Structure
- Row 86: HB04045 - Plastic Half Round Gutter Support Bracket 112mm (Each) | Qty 30 Each @ £0.89/Each | Phase Roof Structure
- Row 87: HB04046 - Plastic Half Round Gutter Union Bracket 112mm (Each) | Qty 6 Each @ £2.85/Each | Phase Roof Structure
- Row 88: HB00389 - Cement Soffit Strip 2400 x 150 x 4.5mm (Each) | Qty 11 Each @ £1.14/Each | Phase Roof Structure
- Row 89: HB00406 - Cladding White Universal Starter Trim 5m (Each) | Qty 0 Each @ £13.8/Each | Phase Roof Structure
- Row 90: HB00407 - Shiplap Cladding 150mm x 5m (Each) | Qty 0 Each @ £29.2/Each | Phase Roof Structure
- Row 91: HB00347 - Soffit Vent 2440mm (For 6-10mm Soffit Board) (Each) | Qty 12 Each @ £3.05/Each | Phase Roof Structure
- Row 92: HB00557 - White 175mm Square Fascia x 16mm x 5m (Each) | Qty 21 Each @ £39.5/Each | Phase Roof Structure
- Row 93: HB00554 - White 400mm PVC Board x 9mm x 5m (Each) | Qty 20 Each @ £39.5/Each | Phase Roof Structure
- Row 94: HB00360 - Clout Nails Galvanised 65mm x 25kg (slating) (Each) | Qty 0 Each @ £46.5/Each | Phase Roof Structure
- Row 95: HB00637 - Rawlbolt M12 (Each) | Qty 0 Each @ £2.2/Each | Phase Roof Structure
- Row 96: HB00358 - Round Wire Nails Bright 100mm x 5kg (Each) | Qty 18 Each @ £26.7/Each | Phase Roof Structure
- Row 97: HB00369 - Round Wire Nails Bright 50mm x 2.5kg (Each) | Qty 0 Each @ £15.4/Each | Phase Roof Structure
- Row 98: HB00357 - Round Wire Nails Bright 75mm x 5kg (Each) | Qty 0 Each @ £28.9/Each | Phase Roof Structure
- Row 99: HB00408 - White 40mm Plastic Top Nails (Pack of 250) (Each) | Qty 0 Each @ £11.6/Each | Phase Roof Structure
- Row 100: HB00558 - White Plastic Top Nail 40mm - 10G (Pack of 100) (Each) | Qty 14 Each @ £4.65/Each | Phase Roof Structure
- Row 101: HB00374 - Wood Screws Steel CSK Twin Thread 6 x 0.75 inch (Pack of 200) (Each) | Qty 1 Each @ £2.1/Each | Phase Roof Structure
- Row 102: HB00616 - BBA OSB3 2440 x 1220 x 18mm (Each) | Qty 0 Each @ £17.8/Each | Phase Roof Structure
- Row 103: HB00384 - Hardwood Exterior Ply 2440 x 1220 x 12mm (Each) | Qty 0 Each @ £19.5/Each | Phase Roof Structure

Labour:
- Row 68: Joiner (Hours) | Qty 59 Hours @ £33/Hours | Phase Roof Structure
- Row 69: Joiner & Mate (Hours) | Qty 194 Hours @ £55/Hours | Phase Roof Structure
- Row 70: Joiner's Mate (Hours) | Qty 0 Hours @ £22/Hours | Phase Roof Structure
- Row 71: Roof Tiler & Mate (Hours) | Qty 0 Hours @ £53/Hours | Phase Roof Structure

### Roof / Roofing / HBXL Baseline: Roof Tiling

Status: REVIEW REQUIRED. HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.

Drawing references: none

Material:
- Row 282: HB00109 - Blue Circle Mastercrete Original Cement 25kg Bag (Each) | Qty 2 Each @ £6.6/Each | Phase Roof Tiling
- Row 283: HB00002 - Building Sand Bulk Bag (Each) | Qty 0 Each @ £58/Each | Phase Roof Tiling
- Row 284: HB00047 - Sawn Batten Treated 25 x 38mm (m) | Qty 3848 m @ £0.72/m | Phase Roof Tiling
- Row 285: HB00353 - Breather Membrane Heavy Weight 1.5 x 50m (Each) | Qty 5 Each @ £139/Each | Phase Roof Tiling
- Row 286: HB00326 - Lead Flashing Code 4 - 3m x 300mm (Each) | Qty 0 Each @ £51/Each | Phase Roof Tiling
- Row 287: HB00327 - Lead Flashing Code 4 - 3m x 450mm (Each) | Qty 5 Each @ £76/Each | Phase Roof Tiling
- Row 288: HB00341 - Clay Eaves Tile (Allowance £0.90 Each) (Each) | Qty 497 Each @ £0.9/Each | Phase Roof Tiling
- Row 289: HB3711369 - Clay Mono Ridge Tile 300mm (Allowance £10.20) (Each) | Qty 0 Each @ £10.2/Each | Phase Roof Tiling
- Row 290: HB00345 - Clay Tile & Half (Allowance £0.85 Each) (Each) | Qty 398 Each @ £0.85/Each | Phase Roof Tiling
- Row 291: HB00343 - Half Round Clay Ridge (300mm) (Allowance £19.10 Each) (Each) | Qty 78 Each @ £19.1/Each | Phase Roof Tiling
- Row 292: HB00344 - Plain Clay Tile (60 per m²) (Allowance £0.85 each) (Each) | Qty 20494 Each @ £0.85/Each | Phase Roof Tiling
- Row 293: HB00389 - Cement Soffit Strip 2400 x 150 x 4.5mm (Each) | Qty 23 Each @ £1.14/Each | Phase Roof Tiling
- Row 294: HB00354 - PVC Dry Ridge Vent System (m) | Qty 23 m @ £14.6/m | Phase Roof Tiling
- Row 295: HB00355 - PVC Dry Verge System (m) | Qty 57 m @ £9.15/m | Phase Roof Tiling
- Row 296: HB00379 - Scrolled Hip Iron 12 x 6 x 1inch (Each) | Qty 0 Each @ £2.1/Each | Phase Roof Tiling
- Row 297: HB00359 - Clout Nails Galvanised 50mm x 25kg (slating) (Each) | Qty 0 Each @ £133/Each | Phase Roof Tiling
- Row 298: HB00378 - Round Wire Nails Galvanised 65mm x 25kg (Each) | Qty 4 Each @ £141/Each | Phase Roof Tiling
- Row 299: Not Required (Unit) | Qty 3743 Unit @ £0/Unit | Phase Roof Tiling

Labour:
- Row 278: Not Required (Unit) | Qty 524 Unit @ £0/Unit | Phase Roof Tiling
- Row 279: 3 Roof Tilers & Mate (Hours) | Qty 129 Hours @ £115/Hours | Phase Roof Tiling
- Row 280: Roof Tiler (Hours) | Qty 37 Hours @ £31/Hours | Phase Roof Tiling
- Row 281: Roof Tiler & Mate (Hours) | Qty 12 Hours @ £53/Hours | Phase Roof Tiling

### Structural Zone / Masonry / Structure / HBXL Baseline: ICF Shell

Status: REVIEW REQUIRED. HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.

Drawing references: none

Material:
- Row 158: Not Required (Unit) | Qty 36643 Unit @ £0/Unit | Phase ICF Shell

Labour:
- Row 156: Not Required (Unit) | Qty 539 Unit @ £0/Unit | Phase ICF Shell

Plant:
- Row 157: Not Required (Unit) | Qty 3426 Unit @ £0/Unit | Phase ICF Shell

### Structural Zone / Masonry / Structure / HBXL Baseline: Masonry Shell

Status: REVIEW REQUIRED. HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.

Drawing references: none

Material:
- Row 12: HB00038 - Engineering Brick - Class A Blue 65mm (Each) | Qty 0 Each @ £1.68/Each | Phase Masonry Shell
- Row 13: HB04200 - Facing Bricks - Provisional (Allowance £1.20 Each) (Each) | Qty 19828 Each @ £1.2/Each | Phase Masonry Shell
- Row 14: HB00351 - Cavity Tray Gable Abutment (Each) | Qty 0 Each @ £11.1/Each | Phase Masonry Shell
- Row 15: HB00474 - Cavity Trays Standard (Allowance £6.50 Each) (Each) | Qty 4 Each @ £6.5/Each | Phase Masonry Shell
- Row 16: HB00356 - Horizontal Cavity Tray 440mm (Each) | Qty 0 Each @ £6.6/Each | Phase Masonry Shell
- Row 17: HB00164 - Pitch Polymer DPC 100mm x 20m (Each) | Qty 5 Each @ £13.9/Each | Phase Masonry Shell
- Row 18: HB00165 - Pitch Polymer DPC 150mm x 20m (Each) | Qty 1 Each @ £22.6/Each | Phase Masonry Shell
- Row 19: HB03638 - Visqueen Polythene Damp Proof Course 300mm x 20m (Allowance £18 Each) (Each) | Qty 0 Each @ £18/Each | Phase Masonry Shell
- Row 24: HB3708210 - Flat Plate 100 x 25mm (m) | Qty 1 m @ £55/m | Phase Masonry Shell
- Row 25: HB03650 - Concrete Once Weathered Coping Stone 600 x 420mm (Allowance £12.50 Each) (Each) | Qty 0 Each @ £12.5/Each | Phase Masonry Shell
- Row 26: HB03651 - Concrete Once Weathered Corner Coping Stone 420 x 420mm (Allowance £12.50 Each) (Each) | Qty 0 Each @ £12.5/Each | Phase Masonry Shell
- Row 27: HB03670 - Concrete Once Weathered End Coping Stone 600 x 420mm (Allowance £12.50 Each) (Each) | Qty 0 Each @ £12.5/Each | Phase Masonry Shell
- Row 28: HB3708420 - Universal Beam 610 x 305 x 238kg per m (m) | Qty 6 m @ £670/m | Phase Masonry Shell
- Row 29: HB01698 - Universal Column 152 x 152 x 37kg per m (m) | Qty 1 m @ £104/m | Phase Masonry Shell
- Row 30: HB00109 - Blue Circle Mastercrete Original Cement 25kg Bag (Each) | Qty 134 Each @ £6.6/Each | Phase Masonry Shell
- Row 31: HB00002 - Building Sand Bulk Bag (Each) | Qty 23 Each @ £58/Each | Phase Masonry Shell
- Row 32: HB00027 - Insulation Block Standard 440 x 215 x 100mm (m²) | Qty 316 m² @ £21.3/m² | Phase Masonry Shell
- Row 33: HB3710047 - Insulation Coursing Block 3.5N 100mm (Each) (Each) | Qty 852 Each @ £0.83/Each | Phase Masonry Shell
- Row 34: HB03552 - Brickwork Tie DD140 Type 4 275mm (Each) | Qty 1118 Each @ £0.23/Each | Phase Masonry Shell
- Row 35: HB03560 - Insulation Retaining Clip (Each) | Qty 862 Each @ £0.07/Each | Phase Masonry Shell
- Row 36: HB00065 - Sawn Softwood Kiln Dried 47 x 75mm (m) | Qty 52 m @ £2.45/m | Phase Masonry Shell
- Row 37: HB00067 - Sawn Softwood Kiln Dried Treated 47 x 75mm (m) | Qty 82 m @ £2.7/m | Phase Masonry Shell
- Row 38: HB3709450 - Concrete Padstone 440 x 140 x 100mm (Each) | Qty 0 Each @ £25.5/Each | Phase Masonry Shell
- Row 39: HB00169 - Cavity Closer 100mm x 3m (Each) | Qty 11 Each @ £17.1/Each | Phase Masonry Shell
- Row 40: HB03587 - Cavity Closer 140mm x 3m (m) | Qty 0 m @ £8.3/m | Phase Masonry Shell
- Row 41: HB03584 - Cavity Closer 50mm x 3m (Each) | Qty 6 Each @ £12.9/Each | Phase Masonry Shell
- Row 42: HB03561 - Jointing Tape 50mm x 55m (Each) | Qty 22 Each @ £16/Each | Phase Masonry Shell
- Row 43: HB03551 - Phenolic Insulated Cavity Wall Board 450 x 1200 x 90mm (Each) | Qty 669 Each @ £23.7/Each | Phase Masonry Shell
- Row 44: HB00293 - Cavity Wall Lintel 90-105mm cavity 1500mm (Each) | Qty 8 Each @ £86.5/Each | Phase Masonry Shell
- Row 45: HB00297 - Cavity Wall Lintel 90-105mm cavity 900mm (Each) | Qty 2 Each @ £52/Each | Phase Masonry Shell
- Row 46: HB3709285 - Aluminium Coping 3m (Each) | Qty 0 Each @ £158/Each | Phase Masonry Shell
- Row 47: HB3709287 - Aluminium Coping 90 Degree Bend (Each) | Qty 0 Each @ £119/Each | Phase Masonry Shell
- Row 48: HB3709289 - Aluminium Coping Closed Stop End (Each) | Qty 0 Each @ £91.5/Each | Phase Masonry Shell
- Row 49: HB3709286 - Aluminium Coping Union (Each) | Qty 0 Each @ £11.7/Each | Phase Masonry Shell
- Row 50: HB00567 - Sundry Materials (£) (Each) | Qty 25 Each @ £1/Each | Phase Masonry Shell
- Row 51: Not Required (Unit) | Qty 5055 Unit @ £0/Unit | Phase Masonry Shell

Labour:
- Row 20: Not Required (Unit) | Qty 1015 Unit @ £0/Unit | Phase Masonry Shell
- Row 21: 2 Bricklayers & Mate (Hours) | Qty 284 Hours @ £88/Hours | Phase Masonry Shell
- Row 22: Bricklayer (Hours) | Qty 37 Hours @ £33/Hours | Phase Masonry Shell
- Row 23: Joiner (Hours) | Qty 5 Hours @ £33/Hours | Phase Masonry Shell

### Structural Zone / Masonry / Structure / HBXL Baseline: SIPS Frame

Status: REVIEW REQUIRED. HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.

Drawing references: none

Material:
- Row 302: Not Required (Unit) | Qty 49256 Unit @ £0/Unit | Phase SIPS Frame

Labour:
- Row 300: Not Required (Unit) | Qty 8566 Unit @ £0/Unit | Phase SIPS Frame

Plant:
- Row 301: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase SIPS Frame

### Structural Zone / Masonry / Structure / HBXL Baseline: Timber Frame

Status: REVIEW REQUIRED. HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.

Drawing references: none

Material:
- Row 306: HB00041 - Regularised Joist Kiln Dried C16 Graded 47 x 100mm (m) | Qty 0 m @ £3.3/m | Phase Timber Frame
- Row 307: HB00044 - Regularised Joist Kiln Dried C16 Graded 47 x 225mm (m) | Qty 0 m @ £7.35/m | Phase Timber Frame
- Row 308: HB00560 - Breather Membrane Medium Weight 1.5 x 50m (Each) | Qty 0 Each @ £96/Each | Phase Timber Frame
- Row 309: HB00377 - Round Wire Nails Bright 100mm x 25kg (Each) | Qty 0 Each @ £134/Each | Phase Timber Frame
- Row 310: HB00378 - Round Wire Nails Galvanised 65mm x 25kg (Each) | Qty 0 Each @ £141/Each | Phase Timber Frame
- Row 311: HB00381 - BBA OSB3 2440 x 1220 x 9mm (Each) | Qty 0 Each @ £15.7/Each | Phase Timber Frame
- Row 312: HB00424 - Staples 10 x 12mm (Pack of 1000) (Each) | Qty 0 Each @ £1.83/Each | Phase Timber Frame
- Row 313: Not Required (Unit) | Qty 21073 Unit @ £0/Unit | Phase Timber Frame

Labour:
- Row 303: Not Required (Unit) | Qty 4965 Unit @ £0/Unit | Phase Timber Frame
- Row 305: Joiner & Mate (Hours) | Qty 0 Hours @ £55/Hours | Phase Timber Frame

Plant:
- Row 304: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Timber Frame

### Structural Zone / Structural / HBXL Baseline: Structural Openings

Status: REVIEW REQUIRED. HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.

Drawing references: none

Material:
- Row 52: HB00038 - Engineering Brick - Class A Blue 65mm (Each) | Qty 13 Each @ £1.68/Each | Phase Structural Openings
- Row 57: HB00301 - Joist 178 x 102 x 19kg per m (m) | Qty 6 m @ £53.5/m | Phase Structural Openings
- Row 58: HB00066 - Sawn Softwood Kiln Dried Treated 47 x 50mm (m) | Qty 3 m @ £1.79/m | Phase Structural Openings
- Row 59: HB00478 - Concrete Padstone 440 x 140 x 215mm (Each) | Qty 2 Each @ £32/Each | Phase Structural Openings
- Row 60: HB00479 - Natural Slate 400 x 250mm (Allowance £1.60 Each) (Each) | Qty 4 Each @ £1.6/Each | Phase Structural Openings

Labour:
- Row 54: 2 Bricklayers & Mate (Hours) | Qty 0 Hours @ £88/Hours | Phase Structural Openings
- Row 55: Bricklayer (Hours) | Qty 14 Hours @ £33/Hours | Phase Structural Openings
- Row 56: Bricklayer's Mate (Hours) | Qty 14 Hours @ £22/Hours | Phase Structural Openings

Plant:
- Row 53: Not Required (Unit) | Qty 20 Unit @ £0/Unit | Phase Structural Openings
- Row 61: Acrow Props 1, 2 & 3 (Week) | Qty 6 Week @ £6/Week | Phase Structural Openings
- Row 62: Shovel (Week) | Qty 1 Week @ £12/Week | Phase Structural Openings
- Row 63: Strongboy Masonry Support  (Week) | Qty 6 Week @ £15/Week | Phase Structural Openings
- Row 64: Wheelbarrow (Week) | Qty 0 Week @ £10/Week | Phase Structural Openings
- Row 65: 0 | Qty 0 Week @ £80/Week | Phase Structural Openings
- Row 66: Skip - 6 Yard (4.6m³) inc. Disposal (Each) | Qty 0 Each @ £265/Each | Phase Structural Openings

### TV Room / Decoration / Wall Decoration

Status: REVIEW REQUIRED. Official PlansXpress Wall Decoration treatment is known, but this project DXF does not expose a Wall Decoration treatment marker; room labels exist but room polygons, wall height, and decoration openings are not all available for deterministic quantity calculation.

Drawing references: none

Material:
- Row 161: HB00528 - Dado Paper 5m Roll (Allowance £5 Each) (Each) | Qty 0 Each @ £5/Each | Phase Internal Decoration
- Row 162: HB00118 - Quick Drying Floor Varnish Clear Gloss 2.5 Litre (Each) | Qty 0 Each @ £21.4/Each | Phase Internal Decoration
- Row 163: HB00114 - Trade Emulsion Paint Brilliant White 5 Litre (Each) | Qty 9 Each @ £23.3/Each | Phase Internal Decoration
- Row 164: HB00115 - Trade Emulsion Paint Magnolia 5 Litre (Each) | Qty 16 Each @ £38/Each | Phase Internal Decoration
- Row 165: HB00116 - Trade Gloss Paint Brilliant White 5 Litre (Each) | Qty 2 Each @ £42/Each | Phase Internal Decoration
- Row 166: HB00113 - Undercoat White 5 Litre (Each) | Qty 4 Each @ £38/Each | Phase Internal Decoration
- Row 167: HB00527 - Wallpaper 5.3m² Roll (Allowance £10 Each) (Each) | Qty 0 Each @ £10/Each | Phase Internal Decoration
- Row 168: HB00529 - Wallpaper Paste (16 Roll) (Each) | Qty 0 Each @ £6.3/Each | Phase Internal Decoration
- Row 169: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Decoration

Labour:
- Row 159: Not Required (Unit) | Qty 0 Unit @ £0/Unit | Phase Internal Decoration
- Row 160: Decorator (Hours) | Qty 181 Hours @ £29/Hours | Phase Internal Decoration

### TV Room / Electrical / Double Socket 13A

Status: MATCH. Project-wide DXF quantity equals exact HBXL Smart Schedule resource quantity. HBXL is not room-split, so area quantities remain drawing-derived.

Drawing references: drawing-0054, drawing-0055

Material:
- Row 343: HB00175 - Double Socket 13A (Each) | Qty 5 Each @ £2.35/Each | Phase Electrical 2nd Fix
- Row 320: HB00214 - Back Box Metal 2G 25mm (Each) | Qty 18 Each @ £0.62/Each | Phase Electrical 1st Fix
- Row 321: HB3709440 - Back Box Metal 2G 47mm (Each) | Qty 2 Each @ £1.21/Each | Phase Electrical 1st Fix
- Row 323: HB00176 - Cable Clips 2.5mm (Pack of 100) (Each) | Qty 1 Each @ £1.16/Each | Phase Electrical 1st Fix
- Row 332: HB00177 - Twin & Earth Cable 2.5mm (50m) (Each) | Qty 3 Each @ £46/Each | Phase Electrical 1st Fix
- Row 336: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 1st Fix
- Row 358: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 2nd Fix

Labour:
- Row 314: Electrician & Mate (Hours) | Qty 33 Hours @ £63/Hours | Phase Electrical 1st Fix
- Row 315: Electrician's Mate (Hours) | Qty 0 Hours @ £25/Hours | Phase Electrical 1st Fix
- Row 337: Electrician (Hours) | Qty 18 Hours @ £38/Hours | Phase Electrical 2nd Fix

### TV Room / Electrical / Fluorescent Light 1500mm

Status: MATCH. Project-wide DXF quantity equals exact HBXL Smart Schedule resource quantity. HBXL is not room-split, so area quantities remain drawing-derived.

Drawing references: drawing-0056, drawing-0057

Material:
- Row 345: HB00203 - Fluorescent Light 1500mm (Each) | Qty 3 Each @ £29.2/Each | Phase Electrical 2nd Fix
- Row 316: HB00172 - 3 Core & Earth Cable 1mm (100m) (Each) | Qty 1 Each @ £67/Each | Phase Electrical 1st Fix
- Row 322: HB00173 - Cable Clips 1mm (Pack of 100) (Each) | Qty 1 Each @ £1.13/Each | Phase Electrical 1st Fix
- Row 325: HB03632 - Fire Hood For Downlight (Each) | Qty 0 Each @ £6.2/Each | Phase Electrical 1st Fix
- Row 327: HB03633 - Insulation Guard for Downlight (Each) | Qty 0 Each @ £7.35/Each | Phase Electrical 1st Fix
- Row 328: HB00222 - Sheathing Metal 12.5mm x 2m (Each) | Qty 11 Each @ £1.67/Each | Phase Electrical 1st Fix
- Row 329: HB00223 - Sheathing Metal 25mm x 2m (Each) | Qty 24 Each @ £2.1/Each | Phase Electrical 1st Fix
- Row 330: HB04174 - Twin & Earth Cable 1.5mm (50m) (Each) | Qty 2 Each @ £30/Each | Phase Electrical 1st Fix
- Row 331: HB00174 - Twin & Earth Cable 1mm (50m) (Each) | Qty 0 Each @ £27.5/Each | Phase Electrical 1st Fix
- Row 336: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 1st Fix
- Row 358: HB00182 - Wood Screws Steel CSK Twin Thread 8 x 1.5 inch (Pack of 200) (Each) | Qty 0 Each @ £3.35/Each | Phase Electrical 2nd Fix

Labour:
- Row 314: Electrician & Mate (Hours) | Qty 33 Hours @ £63/Hours | Phase Electrical 1st Fix
- Row 315: Electrician's Mate (Hours) | Qty 0 Hours @ £25/Hours | Phase Electrical 1st Fix
- Row 337: Electrician (Hours) | Qty 18 Hours @ £38/Hours | Phase Electrical 2nd Fix

### TV Room / Electrical / Review Required: Block87595

Status: REVIEW REQUIRED. unknown electrical symbol

Drawing references: drawing-0063

No HBXL resource rows safely linked.

## Review Required

- Bathroom / Decoration / Wall Decoration: Official PlansXpress Wall Decoration treatment is known, but this project DXF does not expose a Wall Decoration treatment marker; room labels exist but room polygons, wall height, and decoration openings are not all available for deterministic quantity calculation.
- Bathroom / Electrical / Review Required: Block14472: unknown electrical symbol
- Bathroom / Electrical / Review Required: ELECTRIC SHOWER: explicit drawing label has no safe HBXL measurable item mapping
- Bedroom 2 / Decoration / Wall Decoration: Official PlansXpress Wall Decoration treatment is known, but this project DXF does not expose a Wall Decoration treatment marker; room labels exist but room polygons, wall height, and decoration openings are not all available for deterministic quantity calculation.
- Bedroom 3 / Decoration / Wall Decoration: Official PlansXpress Wall Decoration treatment is known, but this project DXF does not expose a Wall Decoration treatment marker; room labels exist but room polygons, wall height, and decoration openings are not all available for deterministic quantity calculation.
- External Works / Decoration / HBXL Baseline: External Decoration: HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.
- Foundation / Groundworks / HBXL Baseline: Footings: HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.
- Foundation / Groundworks / HBXL Baseline: Foundations: HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.
- Foundation / Groundworks / HBXL Baseline: Oversite and Slabbing: HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.
- Kitchen / Decoration / Wall Decoration: Official PlansXpress Wall Decoration treatment is known, but this project DXF does not expose a Wall Decoration treatment marker; room labels exist but room polygons, wall height, and decoration openings are not all available for deterministic quantity calculation.
- Kitchen / Electrical / Review Required: Block21282: unknown electrical symbol
- Kitchen / Electrical / Review Required: ELECTRIC HOB: explicit drawing label has no safe HBXL measurable item mapping
- Kitchen / Electrical / Review Required: OVEN: explicit drawing label has no safe HBXL measurable item mapping
- Laundry / Decoration / Wall Decoration: Official PlansXpress Wall Decoration treatment is known, but this project DXF does not expose a Wall Decoration treatment marker; room labels exist but room polygons, wall height, and decoration openings are not all available for deterministic quantity calculation.
- Laundry / Electrical / Single Light Switch - One Way: Project-wide DXF quantity does not equal exact HBXL Smart Schedule resource quantity.
- Laundry / Electrical / WC Light Fitting: Project-wide DXF quantity does not equal exact HBXL Smart Schedule resource quantity.
- Lounge / Decoration / Wall Decoration: Official PlansXpress Wall Decoration treatment is known, but this project DXF does not expose a Wall Decoration treatment marker; room labels exist but room polygons, wall height, and decoration openings are not all available for deterministic quantity calculation.
- Main Bedroom / Decoration / Wall Decoration: Official PlansXpress Wall Decoration treatment is known, but this project DXF does not expose a Wall Decoration treatment marker; room labels exist but room polygons, wall height, and decoration openings are not all available for deterministic quantity calculation.
- Main Bedroom / Electrical / Review Required: Block88816: unknown electrical symbol
- Other / Decoration / HBXL Baseline: Internal Decoration: HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.
- Other / Decoration / HBXL Baseline: Internal Preparation: HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.
- Other / Electrical / Review Required: Block14327: unknown electrical symbol
- Other / Electrical / Review Required: Block91259: unknown electrical symbol
- Other / Electrical / Review Required: Ceiling Rose and Pendant: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Double Light Switch - One Way: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Double Socket 13A: ambiguous nearest room label
- Other / Electrical / Review Required: Double Socket 13A: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Double Socket 13A with Twin USB: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Double Socket 13A with Twin USB: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Double Socket 13A with Twin USB: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Double Socket 13A with Twin USB: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Double Socket 13A with Twin USB: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Double Socket 13A with Twin USB: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Double Socket 13A with Twin USB: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Double Socket 13A with Twin USB: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Double Socket 13A with Twin USB: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Double Socket 13A with Twin USB: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Fluorescent Light 1500mm: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Mains Downlight Fire Rated: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Mains Downlight Fire Rated: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Mains Downlight Fire Rated: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Mains Downlight Fire Rated: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Mains Downlight Standard: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Pull Light Switch: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Single Light Switch: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Single Light Switch: ambiguous nearest room label
- Other / Electrical / Review Required: Single Light Switch - One Way: ambiguous nearest room label
- Other / Electrical / Review Required: Single Light Switch - One Way: wall blocks direct association to nearest room label
- Other / Electrical / Review Required: Single Light Switch - Two Way: wall blocks direct association to nearest room label
- Other / Flooring / Tiling / HBXL Baseline: Internal Fitting Out: HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.
- Other / Joinery / HBXL Baseline: Joinery 1st Fix: HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.
- Other / Joinery / HBXL Baseline: Joinery 2nd Fix: HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.
- Other / Other / HBXL Baseline: Internal Parge Coat: HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.
- Other / Plastering / HBXL Baseline: Plastering: HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.
- Passage / Decoration / Wall Decoration: Official PlansXpress Wall Decoration treatment is known, but this project DXF does not expose a Wall Decoration treatment marker; room labels exist but room polygons, wall height, and decoration openings are not all available for deterministic quantity calculation.
- Roof / Roofing / HBXL Baseline: Flat Roof Structure: HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.
- Roof / Roofing / HBXL Baseline: Flat Roof Waterproofing: HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.
- Roof / Roofing / HBXL Baseline: Roof Structure: HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.
- Roof / Roofing / HBXL Baseline: Roof Tiling: HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.
- Structural Zone / Masonry / Structure / HBXL Baseline: ICF Shell: HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.
- Structural Zone / Masonry / Structure / HBXL Baseline: Masonry Shell: HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.
- Structural Zone / Masonry / Structure / HBXL Baseline: SIPS Frame: HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.
- Structural Zone / Masonry / Structure / HBXL Baseline: Timber Frame: HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.
- Structural Zone / Structural / HBXL Baseline: Structural Openings: HBXL Smart Schedule build-phase baseline retained, but no safe DXF drawing-object/location join has been proven for this package yet.
- TV Room / Decoration / Wall Decoration: Official PlansXpress Wall Decoration treatment is known, but this project DXF does not expose a Wall Decoration treatment marker; room labels exist but room polygons, wall height, and decoration openings are not all available for deterministic quantity calculation.
- TV Room / Electrical / Review Required: Block87595: unknown electrical symbol
