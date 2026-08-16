# Patrick Brook PlansXpress Project Audit

Read-only audit of the local PlansXpress `.pxd` project file against the exported HBXL Smart Schedule.

## Source

- PXD: C:/Users/rudyb/Desktop/Patrick Brook.pxd
- Container: gzip XML
- PlansXpress version: 5.8
- Decompressed XML bytes: 7762121
- Smart Schedule: test-fixtures/patrick-brook/Job 51 Patrick Brook Smart Schedule Export.csv

## Estimate Data Counts

- Walls: 20
- Doors: 11
- Windows: 10
- Objects: 76
- Areas: 27
- Treatments: 0
- Rooms: 0

## Wall Decoration Aggregate

- Decorated wall records: 20
- Stored wall locations: House, Main Structure
- Gross decorated wall area: 478.178 m2
- Net area, openings deducted once: 432.815 m2
- Net area, openings deducted per decorated side: 417.262 m2

| ID | Location | Specification | Length m | Height m | Openings m2 | Sides | Gross m2 | Net m2, openings once | Net m2, openings per side |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1-House | House | 2 Leaf External Wall.xls | 12.684 | 2.49 | 4.833 | 1 | 31.583 | 26.75 | 26.75 |
| 2-House | House | 2 Leaf External Wall.xls | 16.342 | 2.483 | 8.34 | 1 | 40.577 | 32.237 | 32.237 |
| 4-House | House | 2 Leaf External Wall.xls | 16.684 | 2.383 | 8.46 | 1 | 39.758 | 31.298 | 31.298 |
| 5-House | House | 2 Leaf External Wall.xls | 4.342 | 2.478 | 1.44 | 1 | 10.759 | 9.319 | 9.319 |
| 6-House | House | 2 Leaf External Wall.xls | 8.684 | 2.483 | 0 | 1 | 21.562 | 21.562 | 21.562 |
| 7-House | House | 2 Leaf External Wall.xls | 4.337 | 2.478 | 1.44 | 1 | 10.747 | 9.307 | 9.307 |
| 1-Main Structure | Main Structure | Single Leaf Internal Wall.xls | 3.5 | 2.4 | 0.005 | 2 | 16.8 | 16.795 | 16.79 |
| 2-Main Structure | Main Structure | Single Leaf Internal Wall.xls | 6.1 | 2.4 | 1.986 | 2 | 29.28 | 27.294 | 25.308 |
| 3-Main Structure | Main Structure | Single Leaf Internal Wall.xls | 2.82 | 2.4 | 1.989 | 2 | 13.536 | 11.547 | 9.558 |
| 4-Main Structure | Main Structure | Single Leaf Internal Wall.xls | 2.116 | 2.4 | 0.006 | 2 | 10.157 | 10.151 | 10.145 |
| 5-Main Structure | Main Structure | Single Leaf Internal Wall.xls | 6.564 | 2.4 | 1.621 | 2 | 31.507 | 29.886 | 28.265 |
| 6-Main Structure | Main Structure | Single Leaf Internal Wall.xls | 9.819 | 2.4 | 1.986 | 2 | 47.131 | 45.145 | 43.159 |
| 7-Main Structure | Main Structure | Single Leaf Internal Wall.xls | 6.651 | 2.4 | 1.986 | 2 | 31.925 | 29.939 | 27.953 |
| 8-Main Structure | Main Structure | Single Leaf Internal Wall.xls | 3.85 | 2.4 | 0.003 | 2 | 18.48 | 18.477 | 18.474 |
| 9-Main Structure | Main Structure | Single Leaf Internal Wall.xls | 9.685 | 2.4 | 3.976 | 2 | 46.488 | 42.512 | 38.536 |
| 10-Main Structure | Main Structure | Single Leaf Internal Wall.xls | 2.685 | 2.4 | 1.995 | 2 | 12.888 | 10.893 | 8.898 |
| 8-House | House | 2 Leaf External Wall.xls | 12.685 | 2.4 | 3.78 | 1 | 30.444 | 26.664 | 26.664 |
| 9-House | House | 2 Leaf External Wall.xls | 3.502 | 2.4 | 0.04 | 1 | 8.405 | 8.365 | 8.365 |
| 10-House | House | 2 Leaf External Wall.xls | 7.394 | 2.4 | 1.44 | 1 | 17.746 | 16.306 | 16.306 |
| 11-House | House | 2 Leaf External Wall.xls | 3.502 | 2.4 | 0.037 | 1 | 8.405 | 8.368 | 8.368 |

## Ceiling Decoration Aggregate

- Decorated ceiling records: 9
- Decorated ceiling area: 240.81 m2

| ID | Location | Specification | Area m2 | Perimeter m |
| --- | --- | --- | ---: | ---: |
| 48-Ceiling | Ceiling | PlansXpress Internal Renovation - Ceilings.xls | 31.84 | 23.965 |
| 49-Ceiling | Ceiling | PlansXpress Internal Renovation - Ceilings.xls | 10.669 | 13.322 |
| 50-Ceiling | Ceiling | PlansXpress Internal Renovation - Ceilings.xls | 14.818 | 16.482 |
| 51-Ceiling | Ceiling | PlansXpress Internal Renovation - Ceilings.xls | 5.41 | 9.425 |
| 52-Ceiling | Ceiling | PlansXpress Internal Renovation - Ceilings.xls | 20.421 | 18.801 |
| 53-Ceiling | Ceiling | PlansXpress Internal Renovation - Ceilings.xls | 27.7 | 25.905 |
| 54-Ceiling | Ceiling | PlansXpress Internal Renovation - Ceilings.xls | 50.849 | 40.136 |
| 55-Ceiling | Ceiling | PlansXpress Internal Renovation - Ceilings.xls | 45.879 | 29.763 |
| 56-Ceiling | Ceiling | PlansXpress Internal Renovation - Ceilings.xls | 33.224 | 23.74 |

## Smart Schedule Comparison

- Internal Decoration rows: 11
- Internal Decoration rows with positive quantity: 5
- Direct Wall Decoration m2 quantity rows: 0

| CSV Row | Kind | Resource Type | Product Code | Description | Quantity | Unit |
| ---: | --- | --- | --- | --- | ---: | --- |
| 159 | Labour | Sundry Labour | - | Not Required (Unit) | 0 | Unit |
| 160 | Labour | Decorator | - | Decorator (Hours) | 181 | Hours |
| 161 | Material | Decoration | HB00528 | Dado Paper 5m Roll (Allowance £5 Each) (Each) | 0 | Each |
| 162 | Material | Decoration | HB00118 | Quick Drying Floor Varnish Clear Gloss 2.5 Litre (Each) | 0 | Each |
| 163 | Material | Decoration | HB00114 | Trade Emulsion Paint Brilliant White 5 Litre (Each) | 9 | Each |
| 164 | Material | Decoration | HB00115 | Trade Emulsion Paint Magnolia 5 Litre (Each) | 16 | Each |
| 165 | Material | Decoration | HB00116 | Trade Gloss Paint Brilliant White 5 Litre (Each) | 2 | Each |
| 166 | Material | Decoration | HB00113 | Undercoat White 5 Litre (Each) | 4 | Each |
| 167 | Material | Decoration | HB00527 | Wallpaper 5.3m² Roll (Allowance £10 Each) (Each) | 0 | Each |
| 168 | Material | Decoration | HB00529 | Wallpaper Paste (16 Roll) (Each) | 0 | Each |
| 169 | Material | Sundry Material | - | Not Required (Unit) | 0 | Unit |

## Conclusion

PlansXpress project XML stores aggregate decorated wall and decorated ceiling geometry, but wall locations are broad project zones rather than room IDs. The Smart Schedule contains decoration labour/material resources, not a direct Wall Decoration m2 quantity row. Room-level Wall Decoration remains REVIEW REQUIRED.
