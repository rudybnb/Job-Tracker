# Patrick Brook Wall Surface Reconciliation

Offline report only. Decoration assignment, pricing, DB/API/UI changes, commit, push, and deploy are intentionally excluded.

## Area Reconciliation

- Construction gross wall area: 349.082 m2
- Construction opening area: 45.363 m2
- Construction net wall area: 303.719 m2
- Decorated gross surface area: 478.178 m2
- Decorated net, openings deducted once: 432.815 m2
- Decorated net, openings deducted per decorated side: 417.262 m2
- External construction gross area: 219.986 m2
- Internal construction gross area: 129.096 m2
- External decorated gross surface area: 219.986 m2
- Internal decorated gross surface area: 258.192 m2

- 349.082 m2 is the construction wall area: sum of Length_of_main_wall x Height_of_main_wall once per PlansXpress estimating wall record.
- 303.719 m2 is the construction net area: 349.082 m2 minus 45.363 m2 of stored AREAOFOPENINGS, deducted once per wall record.
- 478.178 m2 is a surface count from the wall-side decoration flags: external wall records contribute one side, internal partition records contribute two sides.
- The difference is therefore caused by wall faces/sides. It is not caused by DXF centreline geometry, because both totals use stored estimator lengths and heights.
- Opening deductions explain the net totals: deducting openings once from decorated surface gross gives 432.815 m2; deducting each opening once per decorated side gives 417.262 m2.

## Side / Room Adjacency

- PlansXpress Area records inspected: 27
- Area entities with polygons: 27
- Area polygons usable as room geometry: 21
- DXF room polygons detected: 0
- Wall surfaces REVIEW REQUIRED before Area geometry: 10
- Wall surfaces resolved by Area geometry: 23
- Previously review-required surfaces resolved by Area geometry: 3
- Walls with any deterministic work-area side: 20
- Walls with deterministic room side: 16
- Wall surfaces allocated to rooms: 23
- Wall surfaces allocated to Exterior: 10
- Wall surfaces remaining REVIEW REQUIRED: 7
- Rule: Room-side allocation uses PlansXpress Area polygons first. An Area polygon is usable only when it contains exactly one known DXF room label. A wall side resolves to a room only when all three side-sample points fall inside usable Area polygons for one room. Remaining sides fall back to the stricter same-side, unobstructed label-seed rule. Nearest-label distance is not used. External-wall exterior faces are allocated to Exterior from the PlansXpress external-wall calculator plus ExternalSide field.

Usable PlansXpress room Area polygons:
- Bathroom: 4cqLM&Obl0eotJ12eqwsBQ, TZw17nn9qUa7ev#bqEQQYA
- Bedroom 2: S7V5yVnF2Uy8wloDG#8DJA, CEjtoBRF30mHeSMYZepK9Q
- Bedroom 3: #Mz9Kz3190uxPRU6StMcnA, VLBENGGrdk2AfXdQeUTwWA
- Kitchen: shBtOtfEv0KaJCR&u7KUoA, OJaxyGKeW0usUWNEiQMbAA
- Laundry: Y7ZvKjK#4kG0sNRE66ibMg, paNqkQ6MX0Kz2AWZ4Kaeog
- Lounge: C8n7x#g6GE#BvZ780ljBnQ, PA2LfTjSg0aUSSt3TSmRcg
- Main Bedroom: bvAb3LjcOkC1AAO41sisrQ, yu3XS98LeU#FMx4XdNr9Lg
- Passage: ui7H5Q9TFEyGxK2WH5s6sw, meGjFqtyCE6CtwiNc0#bAA, U5LpQh1bL0iDVS5T4afYrA, hpBBLsvJ60i1wJPeFfCxMg
- TV Room: Zsow3Nkj5k#ukKGoBefwpQ, iQ4tH&&abEu0yAW73NTApQ, L&U7Qq49pkCPOGR8Qon2Ww

Detected DXF room labels:
- Main Bedroom: polygon points 0, label (23180.374848, 44027.361672)
- Lounge: polygon points 0, label (21833.603705, 48774.84457)
- Kitchen: polygon points 0, label (19855.794328, 52521.271948)
- Laundry: polygon points 0, label (25009.509147, 52616.358937)
- Passage: polygon points 0, label (15373.411459, 46788.525169)
- Bedroom 2: polygon points 0, label (14908.911613, 43444.126279)
- Bedroom 3: polygon points 0, label (12327.197311, 52498.695751)
- Bathroom: polygon points 0, label (15514.893539, 53254.399598)
- TV Room: polygon points 0, label (29018.44601, 48490.999023)

## Wall Surface Schedule

| Wall Handle | Type | Length m | Height m | Gross m2 | Openings m2 | Net m2 | Side A Work Area | Side A Source | Side B Work Area | Side B Source | Calculator | Confidence |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |
| Nm9ZV#v6Pkq1ijbHem&#vA | Cavity external wall | 12.684 | 2.49 | 31.583 | 4.833 | 26.75 | REVIEW REQUIRED | Unresolved | Exterior | ExteriorSide | 2 Leaf External Wall.xls | REVIEW REQUIRED |
| zbpV1bqZXE2FExj&UdUfhw | Cavity external wall | 16.342 | 2.483 | 40.577 | 8.34 | 32.237 | REVIEW REQUIRED | Unresolved | Exterior | ExteriorSide | 2 Leaf External Wall.xls | REVIEW REQUIRED |
| yjZqqcpR70KBIQxgIdRukw | Cavity external wall | 16.684 | 2.383 | 39.758 | 8.46 | 31.298 | REVIEW REQUIRED | Unresolved | Exterior | ExteriorSide | 2 Leaf External Wall.xls | REVIEW REQUIRED |
| 0Xx1BOuQ20G6t53uehbbLg | Cavity external wall | 4.342 | 2.478 | 10.759 | 1.44 | 9.319 | TV Room | AreaPolygon | Exterior | ExteriorSide | 2 Leaf External Wall.xls | MATCH |
| zs3PK7WDwEmmutn0xnqAVw | Cavity external wall | 8.684 | 2.483 | 21.562 | 0 | 21.562 | TV Room | AreaPolygon | Exterior | ExteriorSide | 2 Leaf External Wall.xls | MATCH |
| YjqWhAhjuE6dv&lP78CHRA | Cavity external wall | 4.337 | 2.478 | 10.747 | 1.44 | 9.307 | TV Room | AreaPolygon | Exterior | ExteriorSide | 2 Leaf External Wall.xls | MATCH |
| xWnFk9dNcUacbLPD729AeA | Single leaf internal partition | 3.5 | 2.4 | 8.4 | 0.005 | 8.395 | Bedroom 3 | AreaPolygon | Passage | AreaPolygon | Single Leaf Internal Wall.xls | MATCH |
| P1fUNg96qkKhMXK8S0dQQQ | Single leaf internal partition | 6.1 | 2.4 | 14.64 | 1.986 | 12.654 | Bedroom 3 | AreaPolygon | REVIEW REQUIRED | Unresolved | Single Leaf Internal Wall.xls | REVIEW REQUIRED |
| ENrWt#xn&0iMkJTwvA5Dzw | Single leaf internal partition | 2.82 | 2.4 | 6.768 | 1.989 | 4.779 | Bathroom | AreaPolygon | Passage | AreaPolygon | Single Leaf Internal Wall.xls | MATCH |
| bON&d4O5dE#OFLbS00yV4w | Single leaf internal partition | 2.116 | 2.4 | 5.078 | 0.006 | 5.072 | Bathroom | AreaPolygon | Kitchen | AreaPolygon | Single Leaf Internal Wall.xls | MATCH |
| LlhXAR#GTECD6Sy#2g635w | Single leaf internal partition | 6.564 | 2.4 | 15.754 | 1.621 | 14.133 | Passage | AreaPolygon | Bedroom 2 | AreaPolygon | Single Leaf Internal Wall.xls | MATCH |
| 9#yQtR1DQUKdxpOFmfA8gA | Single leaf internal partition | 9.819 | 2.4 | 23.566 | 1.986 | 21.58 | Lounge | AreaPolygon | REVIEW REQUIRED | Unresolved | Single Leaf Internal Wall.xls | REVIEW REQUIRED |
| cS7JXPIApUirz7x2X11M3w | Single leaf internal partition | 6.651 | 2.4 | 15.962 | 1.986 | 13.976 | Lounge | AreaPolygon | Passage | AreaPolygon | Single Leaf Internal Wall.xls | MATCH |
| HPMgJevu3ky5P5HM8zgL1Q | Single leaf internal partition | 3.85 | 2.4 | 9.24 | 0.003 | 9.237 | Main Bedroom | AreaPolygon | Bedroom 2 | AreaPolygon | Single Leaf Internal Wall.xls | MATCH |
| 7yrirMLK2EGiQpd4Wwe1Xg | Single leaf internal partition | 9.685 | 2.4 | 23.244 | 3.976 | 19.268 | Lounge | AreaPolygon | REVIEW REQUIRED | Unresolved | Single Leaf Internal Wall.xls | REVIEW REQUIRED |
| JVspemtVM0KbHNg0kOy66Q | Single leaf internal partition | 2.685 | 2.4 | 6.444 | 1.995 | 4.449 | Laundry | AreaPolygon | Kitchen | AreaPolygon | Single Leaf Internal Wall.xls | MATCH |
| HLTEo9NbqUe&WHtUbkzBKg | Cavity external wall | 12.685 | 2.4 | 30.444 | 3.78 | 26.664 | Exterior | ExteriorSide | REVIEW REQUIRED | Unresolved | 2 Leaf External Wall.xls | REVIEW REQUIRED |
| icQ2lhMQ5k#IBQpUQDG9CA | Cavity external wall | 3.502 | 2.4 | 8.405 | 0.04 | 8.365 | Bedroom 2 | AreaPolygon | Exterior | ExteriorSide | 2 Leaf External Wall.xls | MATCH |
| RAZOn15B70yPR1cO7KfQ0w | Cavity external wall | 7.394 | 2.4 | 17.746 | 1.44 | 16.306 | Bedroom 2 | AreaPolygon | Exterior | ExteriorSide | 2 Leaf External Wall.xls | MATCH |
| QITHF7IQbUWbmDaK9kZZAA | Cavity external wall | 3.502 | 2.4 | 8.405 | 0.037 | 8.368 | Bedroom 2 | AreaPolygon | Exterior | ExteriorSide | 2 Leaf External Wall.xls | MATCH |

## Previously Review-Required Surface Outcomes

| Wall Handle | Side | Outcome | Work Area | Evidence Source |
| --- | --- | --- | --- | --- |
| Nm9ZV#v6Pkq1ijbHem&#vA | Side A | REVIEW REQUIRED | - | Unresolved |
| zbpV1bqZXE2FExj&UdUfhw | Side A | REVIEW REQUIRED | - | Unresolved |
| yjZqqcpR70KBIQxgIdRukw | Side A | REVIEW REQUIRED | - | Unresolved |
| P1fUNg96qkKhMXK8S0dQQQ | Side B | REVIEW REQUIRED | - | Unresolved |
| 9#yQtR1DQUKdxpOFmfA8gA | Side B | REVIEW REQUIRED | - | Unresolved |
| 7yrirMLK2EGiQpd4Wwe1Xg | Side B | REVIEW REQUIRED | - | Unresolved |
| HLTEo9NbqUe&WHtUbkzBKg | Side B | REVIEW REQUIRED | - | Unresolved |
| icQ2lhMQ5k#IBQpUQDG9CA | Side A | RESOLVED | Bedroom 2 | AreaPolygon |
| RAZOn15B70yPR1cO7KfQ0w | Side A | RESOLVED | Bedroom 2 | AreaPolygon |
| QITHF7IQbUWbmDaK9kZZAA | Side A | RESOLVED | Bedroom 2 | AreaPolygon |

## Complete Wall Proof

- PlansXpress Handle: xWnFk9dNcUacbLPD729AeA.
- Geometry: start (11447.721, 47925.086) mm to end (14947.721, 47925.086) mm.
- Estimator join: PXID 1, EstimateData ID 1-Main Structure, calculator Single Leaf Internal Wall.xls.
- Stored estimating length 3.5 m x height 2.4 m = gross construction area 8.4 m2.
- Openings: none; stored opening deduction 0.005 m2.
- Net construction area: 8.4 - 0.005 = 8.395 m2.
- Side A work area: Bedroom 3 (AreaPolygon); Side B work area: Passage (AreaPolygon).
- This wall contributes 8.4 m2 to the 349.082 m2 construction gross total and 8.395 m2 to the 303.719 m2 construction net total.
- Its decorated-surface gross contribution is 16.8 m2 (2 decorated sides), included in the 478.178 m2 decorated gross total.
- Aggregate check: decorated gross total 478.178 m2; decorated net totals 432.815 m2 / 417.262 m2 depending on whether openings are deducted once or per decorated side.
