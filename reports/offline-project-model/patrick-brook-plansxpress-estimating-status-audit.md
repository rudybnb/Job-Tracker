# Patrick Brook PlansXpress Estimating Status Audit

Read-only audit. PlansXpress/EstimatorXpress remain the estimating system; Job Tracker only consumes deterministic HBXL evidence and applies operational logic.

## Rules Found

- ESTIMATED: Entity has ExtendedEntityData PXID and CADX_Spreadsheet that joins to a record in EstimateData.Estimated for its entity category. Operational rule: Can contribute quantities/resources/buying/cost, subject to normal Job Tracker operational rules.
- NON_ESTIMATED_VISUAL_ONLY: Entity is listed in EstimateData.NonEstimated, or is a top-level drawing/annotation/simple visual entity with no PXID/CADX_Spreadsheet estimating relationship. Operational rule: Retain as drawing/3D/reference context only. Do not create buying quantities, project cost, or mismatch flags.
- UNKNOWN_REVIEW: Entity has estimating-like fields but no deterministic join to EstimateData.Estimated or EstimateData.NonEstimated, or its entity type/category is not mapped. Operational rule: Make no assumptions; require review before quantities/resources/buying/cost.

## EstimateData Evidence

- NonEstimated collections present: yes
- Estimated record counts: Areas 27, Doors 11, Objects 76, Openings 1, Roofs 3, Walls 20, Windows 10
- NonEstimated record counts: Walls 0, Doors 0, Windows 0, Openings 0, Stairs 0, Profiles 0, DoubleLinears 0, Rooflights 0, Objects 0, Areas 0, Treatments 0, Rooms 0

## Patrick Brook Entity Counts

- Top-level drawing entities: 196
- ESTIMATED: 126
- NON_ESTIMATED_VISUAL_ONLY: 70
- UNKNOWN_REVIEW: 0

| Entity Type | Status | Count |
| --- | --- | ---: |
| 3001 | NON_ESTIMATED_VISUAL_ONLY | 1 |
| 3003 | NON_ESTIMATED_VISUAL_ONLY | 31 |
| 3009 | ESTIMATED | 76 |
| 3014 | NON_ESTIMATED_VISUAL_ONLY | 36 |
| 3015 | NON_ESTIMATED_VISUAL_ONLY | 2 |
| 3055 | ESTIMATED | 3 |
| 5000 | ESTIMATED | 20 |
| 6000 | ESTIMATED | 27 |

## Representative Examples

| Example | Status | Handle | Entity Type | PXID | Spreadsheet | Template | Rule |
| --- | --- | --- | --- | --- | --- | --- | --- |
| estimatedExternalWall | ESTIMATED | Nm9ZV#v6Pkq1ijbHem&#vA | 5000 | 1 | 2 Leaf External Wall.xls | Choose Wall Specification | Joined to EstimateData.Estimated.Walls by PXID 1 and CADX_Spreadsheet 2 Leaf External Wall.xls. |
| estimatedInternalWall | ESTIMATED | xWnFk9dNcUacbLPD729AeA | 5000 | 1 | Single Leaf Internal Wall.xls | Choose Wall Specification | Joined to EstimateData.Estimated.Walls by PXID 1 and CADX_Spreadsheet Single Leaf Internal Wall.xls. |
| estimatedElectricalSymbol | ESTIMATED | Xls9MmDVmEa442vi5aiGNw | 3009 | 1 | Bathroom Extractor Fan | Extractor Fan | Joined to EstimateData.Estimated.Objects by PXID 1 and CADX_Spreadsheet Bathroom Extractor Fan. |
| nonEstimatedPlanSymbol | NON_ESTIMATED_VISUAL_ONLY | P8VlwPuiZkGXoPJqd0gQTw | 3003 | - | - | - | Top-level drawing/annotation/simple visual entity has no PXID or CADX_Spreadsheet estimating relationship. |
| nonEstimated3dSymbol | - | - | - | - | - | - | No representative item found in Patrick Brook. |
| unknownReview | - | - | - | - | - | - | No representative item found in Patrick Brook. |

## Library Evidence

- Installed symbol root: C:\ProgramData\HBXL\PlansXpress5\Symbols
- Estimated symbol path references embedded in Patrick Brook include:
- C:\PROGRAMDATA\HBXL\PLANSXPRESS5\SYMBOLS\\ELECTRIC\ESTIMATED ELECTRICAL SYMBOLS\DOUBLE LIGHT SWITCH ONE WAY.PXD
- C:\PROGRAMDATA\HBXL\PLANSXPRESS5\SYMBOLS\\ELECTRIC\ESTIMATED ELECTRICAL SYMBOLS\ELECTRIC HOB.PXD
- C:\PROGRAMDATA\HBXL\PLANSXPRESS5\SYMBOLS\\ELECTRIC\ESTIMATED ELECTRICAL SYMBOLS\LIGHT FITTING.PXD
- C:\PROGRAMDATA\HBXL\PLANSXPRESS5\SYMBOLS\\ELECTRIC\ESTIMATED ELECTRICAL SYMBOLS\MAINS DOWNLIGHT FIRE RATED.PXD
- C:\PROGRAMDATA\HBXL\PLANSXPRESS5\SYMBOLS\\ELECTRIC\ESTIMATED ELECTRICAL SYMBOLS\MAINS VOLTAGE DOWNLIGHT.PXD
- C:\PROGRAMDATA\HBXL\PLANSXPRESS5\SYMBOLS\\ELECTRIC\ESTIMATED ELECTRICAL SYMBOLS\OVEN CIRCUIT.PXD
- C:\PROGRAMDATA\HBXL\PLANSXPRESS5\SYMBOLS\\ELECTRIC\ESTIMATED ELECTRICAL SYMBOLS\PULL LIGHT SWITCH.PXD
- C:\PROGRAMDATA\HBXL\PLANSXPRESS5\SYMBOLS\\ELECTRIC\ESTIMATED ELECTRICAL SYMBOLS\SHOWER CIRCUIT.PXD
- C:\PROGRAMDATA\HBXL\PLANSXPRESS5\SYMBOLS\\ELECTRIC\ESTIMATED ELECTRICAL SYMBOLS\SINGLE LIGHT SWITCH ONE WAY.PXD
- C:\PROGRAMDATA\HBXL\PLANSXPRESS5\SYMBOLS\\ELECTRIC\ESTIMATED ELECTRICAL SYMBOLS\SINGLE LIGHT SWITCH TWO WAY.PXD
- C:\PROGRAMDATA\HBXL\PLANSXPRESS5\SYMBOLS\\ELECTRIC\ESTIMATED ELECTRICAL SYMBOLS\STRIP LIGHT.PXD
- C:\PROGRAMDATA\HBXL\PLANSXPRESS5\SYMBOLS\\ELECTRIC\ESTIMATED ELECTRICAL SYMBOLS\WC LIGHT FITTING.PXD
- C:\PROGRAMDATA\HBXL\PLANSXPRESS5\SYMBOLS\\PLUMBING\BOILERS\GAS COMBI\GAS COMBI 390 X 295.PXD
- C:\PROGRAMDATA\HBXL\PLANSXPRESS5\SYMBOLS\\PLUMBING\RADIATORS\K2 DOUBLE PANEL\K2 DOUBLE PANEL 1100 MM.PXD
- C:\PROGRAMDATA\HBXL\PLANSXPRESS5\SYMBOLS\\PLUMBING\RADIATORS\TOWEL RAIL\TOWEL WARMER CURVED 600 MM.PXD
- C:\PROGRAMDATA\HBXL\PLANSXPRESS5\SYMBOLS\ELECTRIC\ESTIMATED ELECTRICAL SYMBOLS\DOUBLE SOCKET USB.PXD
- C:\PROGRAMDATA\HBXL\PLANSXPRESS5\SYMBOLS\ELECTRIC\ESTIMATED ELECTRICAL SYMBOLS\DOUBLE SOCKET.PXD
- C:\PROGRAMDATA\HBXL\PLANSXPRESS5\SYMBOLS\ELECTRIC\ESTIMATED ELECTRICAL SYMBOLS\EXTRACTOR FAN.PXD
- C:\PROGRAMDATA\HBXL\PLANSXPRESS5\SYMBOLS\ELECTRIC\ESTIMATED ELECTRICAL SYMBOLS\SHAVER SOCKET.PXD
- C:\PROGRAMDATA\HBXL\PLANSXPRESS5\SYMBOLS\ELECTRIC\ESTIMATED ELECTRICAL SYMBOLS\SINGLE SOCKET OUTSIDE.PXD
- Visual-only library examples present in installed symbols:
- C:\ProgramData\HBXL\PlansXpress5\Symbols\Drawing Symbols\Room Labels.pxd
- C:\ProgramData\HBXL\PlansXpress5\Symbols\Drawing Symbols\Electrical Symbol Key.pxd
- C:\ProgramData\HBXL\PlansXpress5\Symbols\Drawing Symbols\External ground level.pxd

## Existing / Proposed / Demolition

- Deterministic per-entity status available: no
- Conclusion: No deterministic per-entity EXISTING / PROPOSED / DEMOLITION status field was found. Terms such as existing walls appear as estimator calculator inputs or layer names, not a reliable object lifecycle status.
- Evidence terms found:
- Ceiling Renovation
- Centres_of_battens_if_required_to_existing_walls
- Demolition
- Existing thickness of plaster on ceiling
- Existing thickness of plaster on walls
- Existing_thickness_of_plaster_on_ceiling
- Existing_thickness_of_plaster_on_walls
- Length of abutment to existing wall
- Length_of_abutment_to_existing_wall
- PlansXpress Internal Renovation - Ceilings
- Refit existing architraves
- Refit existing skirtings
- Refit_existing_architraves
- Refit_existing_skirtings
- Renovation
- Renovation To Existing
- Structural Opening to Existing Wall
- to existing walls
- TOTAL length of abutment to existing walls
- TOTAL length of lean to flashings to existing walls
- TOTAL_length_of_abutment_to_existing_walls
- TOTAL_LENGTH_OF_ALL_ABUTMENT_TO_EXISTING_WALLS
- TOTAL_LENGTH_OF_ALL_LEAN_TO_FLASHINGS_TO_EXISTING_WALLS
- TOTAL_LENGTH_OF_FLAT_ROOF_ABUTMENT_EDGE_TO_EXISTING_WALLS
- TOTAL_length_of_lean_to_flashings_to_existing_walls

## Unresolved Cases

No UNKNOWN_REVIEW entities in Patrick Brook under the current deterministic rules.


## Business Rule Confirmation

- ESTIMATED can contribute quantities/resources/buying/cost.
- NON_ESTIMATED_VISUAL_ONLY remains drawing/3D/reference context and must not create buying quantities, project cost, or mismatch flags.
- UNKNOWN_REVIEW makes no assumptions.
- Smart Schedule absence is not used as the classifier when stronger PlansXpress evidence exists.
