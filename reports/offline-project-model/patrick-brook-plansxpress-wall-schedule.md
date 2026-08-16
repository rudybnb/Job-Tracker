# Patrick Brook PlansXpress Wall Schedule

Read-only wall entity schedule from the local PlansXpress `.pxd` project file. Decoration is intentionally excluded.

## Source

- PXD: C:/Users/rudyb/Desktop/Patrick Brook.pxd
- Container: gzip XML
- PlansXpress version: 5.8
- Decompressed XML bytes: 7762121

## Reconciliation

- Status: MATCH
- EntityType=5000 wall entities: 20
- EstimateData wall records: 20
- Matched walls: 20
- Unmatched entity walls: 0
- Unmatched estimate walls: 0
- Raw entity centreline length total: 139.529 m
- Stored estimate length total: 143.946 m
- Stored minus raw length delta total: 4.417 m
- External stored length total: 90.156 m
- Internal stored length total: 53.79 m
- Gross area total: 349.082 m2
- Opening area total: 45.363 m2
- Net area total: 303.719 m2

- Top-level drawing wall entities are Entity records with EntityType=5000: 20.
- Stored estimating wall records under EstimateData.Estimated.Walls.Wall: 20.
- Matched walls by ExtendedEntityData PXID plus CADX_Spreadsheet estimating calculator: 20.
- Each Job Tracker wall ID remains linked to the original PlansXpress Handle, PXID, start point, and end point.
- Stored estimate length, height, opening area, gross area, and net area reconcile by summing the individual matched wall records.

## Wall Schedule

| Wall ID | PX Handle | PXID | Estimate ID | Type | Start mm | End mm | Raw Length m | Stored Length m | Height mm | Construction | Thickness ext/cav/int mm | Calculator | Opening IDs | Gross m2 | Net m2 | Location | Adjacent Work Area |
| --- | --- | ---: | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | ---: | ---: | --- | --- |
| PX-WALL-001 | Nm9ZV#v6Pkq1ijbHem&#vA | 1 | 1-House | Cavity external wall | (11549.721, 53925.086) | (11549.721, 41925.086) | 12 | 12.684 | 2400 | Brick and Block Cavity Wall - Raft Foundation | 102/140/100 | 2 Leaf External Wall.xls | PX-WALL-001-OPENING-001, PX-WALL-001-OPENING-002, PX-WALL-001-OPENING-003 | 31.583 | 26.75 | House | Not deterministically exposed |
| PX-WALL-002 | zbpV1bqZXE2FExj&UdUfhw | 2 | 2-House | Cavity external wall | (11549.721, 41925.086) | (27549.721, 41925.086) | 16 | 16.342 | 2400 | Brick and Block Cavity Wall - Raft Foundation | 102/140/100 | 2 Leaf External Wall.xls | PX-WALL-002-OPENING-001, PX-WALL-002-OPENING-002, PX-WALL-002-OPENING-003 | 40.577 | 32.237 | House | Not deterministically exposed |
| PX-WALL-003 | yjZqqcpR70KBIQxgIdRukw | 4 | 4-House | Cavity external wall | (27549.721, 53925.086) | (11209.721, 53925.086) | 16.34 | 16.684 | 2400 | Brick and Block Cavity Wall - Raft Foundation | 102/140/100 | 2 Leaf External Wall.xls | PX-WALL-003-OPENING-001, PX-WALL-003-OPENING-002, PX-WALL-003-OPENING-003, PX-WALL-003-OPENING-004 | 39.758 | 31.298 | House | Not deterministically exposed |
| PX-WALL-004 | 0Xx1BOuQ20G6t53uehbbLg | 5 | 5-House | Cavity external wall | (27891.721, 43894.403) | (31891.721, 43894.403) | 4 | 4.342 | 2400 | Brick and Block Cavity Wall - Raft Foundation | 102/140/100 | 2 Leaf External Wall.xls | PX-WALL-004-OPENING-001 | 10.759 | 9.319 | House | Not deterministically exposed |
| PX-WALL-005 | zs3PK7WDwEmmutn0xnqAVw | 6 | 6-House | Cavity external wall | (31891.721, 43894.403) | (31891.721, 51894.403) | 8 | 8.684 | 2400 | Brick and Block Cavity Wall - Raft Foundation | 102/140/100 | 2 Leaf External Wall.xls | - | 21.562 | 21.562 | House | Not deterministically exposed |
| PX-WALL-006 | YjqWhAhjuE6dv&lP78CHRA | 7 | 7-House | Cavity external wall | (31891.721, 51894.403) | (27896.721, 51894.403) | 3.995 | 4.337 | 2400 | Brick and Block Cavity Wall - Raft Foundation | 102/140/100 | 2 Leaf External Wall.xls | PX-WALL-006-OPENING-001 | 10.747 | 9.307 | House | Not deterministically exposed |
| PX-WALL-007 | xWnFk9dNcUacbLPD729AeA | 1 | 1-Main Structure | Single leaf internal partition | (11447.721, 47925.086) | (14947.721, 47925.086) | 3.5 | 3.5 | 2400 | Internal Metal Stud Wall - No Foundations | 100/0/0 | Single Leaf Internal Wall.xls | - | 8.4 | 8.395 | Main Structure | Not deterministically exposed |
| PX-WALL-008 | P1fUNg96qkKhMXK8S0dQQQ | 2 | 2-Main Structure | Single leaf internal partition | (14947.721, 47925.086) | (14947.721, 53925.086) | 6 | 6.1 | 2400 | Internal Metal Stud Wall - No Foundations | 100/0/0 | Single Leaf Internal Wall.xls | PX-WALL-008-OPENING-001 | 14.64 | 12.654 | Main Structure | Not deterministically exposed |
| PX-WALL-009 | ENrWt#xn&0iMkJTwvA5Dzw | 3 | 3-Main Structure | Single leaf internal partition | (15047.721, 51925.086) | (17767.721, 51910.086) | 2.72 | 2.82 | 2400 | Internal Metal Stud Wall - No Foundations | 100/0/0 | Single Leaf Internal Wall.xls | PX-WALL-009-OPENING-001 | 6.768 | 4.779 | Main Structure | Not deterministically exposed |
| PX-WALL-010 | bON&d4O5dE#OFLbS00yV4w | 4 | 4-Main Structure | Single leaf internal partition | (17767.721, 51910.086) | (17767.721, 53930.086) | 2.02 | 2.116 | 2400 | Internal Metal Stud Wall - No Foundations | 100/0/0 | Single Leaf Internal Wall.xls | - | 5.078 | 5.072 | Main Structure | Not deterministically exposed |
| PX-WALL-011 | LlhXAR#GTECD6Sy#2g635w | 5 | 5-Main Structure | Single leaf internal partition | (11549.721, 45159.297) | (18099.721, 45159.297) | 6.55 | 6.564 | 2400 | Internal Metal Stud Wall - No Foundations | 100/0/0 | Single Leaf Internal Wall.xls | PX-WALL-011-OPENING-001 | 15.754 | 14.133 | Main Structure | Not deterministically exposed |
| PX-WALL-012 | 9#yQtR1DQUKdxpOFmfA8gA | 6 | 6-Main Structure | Single leaf internal partition | (18099.721, 45159.297) | (27549.721, 47824.297) | 9.819 | 9.819 | 2400 | Internal Metal Stud Wall - No Foundations | 100/0/0 | Single Leaf Internal Wall.xls | PX-WALL-012-OPENING-001 | 23.566 | 21.58 | Main Structure | Not deterministically exposed |
| PX-WALL-013 | cS7JXPIApUirz7x2X11M3w | 7 | 7-Main Structure | Single leaf internal partition | (17867.77, 51809.533) | (17867.77, 45159.533) | 6.65 | 6.651 | 2400 | Internal Metal Stud Wall - No Foundations | 100/0/0 | Single Leaf Internal Wall.xls | PX-WALL-013-OPENING-001 | 15.962 | 13.976 | Main Structure | Not deterministically exposed |
| PX-WALL-014 | HPMgJevu3ky5P5HM8zgL1Q | 8 | 8-Main Structure | Single leaf internal partition | (20656.151, 45776.336) | (20656.151, 41926.336) | 3.85 | 3.85 | 2400 | Internal Metal Stud Wall - No Foundations | 100/0/0 | Single Leaf Internal Wall.xls | - | 9.24 | 9.237 | Main Structure | Not deterministically exposed |
| PX-WALL-015 | 7yrirMLK2EGiQpd4Wwe1Xg | 9 | 9-Main Structure | Single leaf internal partition | (27549.721, 51144.403) | (17864.721, 51144.403) | 9.685 | 9.685 | 2400 | Internal Metal Stud Wall - No Foundations | 100/0/0 | Single Leaf Internal Wall.xls | PX-WALL-015-OPENING-001, PX-WALL-015-OPENING-002 | 23.244 | 19.268 | Main Structure | Not deterministically exposed |
| PX-WALL-016 | JVspemtVM0KbHNg0kOy66Q | 10 | 10-Main Structure | Single leaf internal partition | (23553.413, 53925.086) | (23553.413, 51240.086) | 2.685 | 2.685 | 2400 | Internal Metal Stud Wall - No Foundations | 100/0/0 | Single Leaf Internal Wall.xls | PX-WALL-016-OPENING-001 | 6.444 | 4.449 | Main Structure | Not deterministically exposed |
| PX-WALL-017 | HLTEo9NbqUe&WHtUbkzBKg | 8 | 8-House | Cavity external wall | (27891.721, 54267.086) | (27891.721, 41582.086) | 12.685 | 12.685 | 2400 | Brick and Block Cavity Wall - Raft Foundation | 102/140/100 | 2 Leaf External Wall.xls | PX-WALL-017-OPENING-001 | 30.444 | 26.664 | House | Not deterministically exposed |
| PX-WALL-018 | icQ2lhMQ5k#IBQpUQDG9CA | 9 | 9-House | Cavity external wall | (13273.436, 41583.086) | (13273.436, 38423.086) | 3.16 | 3.502 | 2400 | Brick and Block Cavity Wall - Raft Foundation | 102/140/100 | 2 Leaf External Wall.xls | - | 8.405 | 8.365 | House | Not deterministically exposed |
| PX-WALL-019 | RAZOn15B70yPR1cO7KfQ0w | 10 | 10-House | Cavity external wall | (13273.436, 38423.086) | (19983.436, 38423.086) | 6.71 | 7.394 | 2400 | Brick and Block Cavity Wall - Raft Foundation | 102/140/100 | 2 Leaf External Wall.xls | PX-WALL-019-OPENING-001 | 17.746 | 16.306 | House | Not deterministically exposed |
| PX-WALL-020 | QITHF7IQbUWbmDaK9kZZAA | 11 | 11-House | Cavity external wall | (19983.436, 38423.086) | (19983.436, 41583.086) | 3.16 | 3.502 | 2400 | Brick and Block Cavity Wall - Raft Foundation | 102/140/100 | 2 Leaf External Wall.xls | - | 8.405 | 8.368 | House | Not deterministically exposed |

## Opening References

| Wall ID | Opening ID | Type | PX Handle | PXID | Template | Width mm | Height mm | Distance From Wall Start mm |
| --- | --- | --- | --- | ---: | --- | ---: | ---: | ---: |
| PX-WALL-001 | PX-WALL-001-OPENING-001 | Window | C1e#&4B&7EWTyJiBVNWhew | 2 | 212C 1200 x 1200mm Window | 1200 | 1200 | 3065 |
| PX-WALL-001 | PX-WALL-001-OPENING-002 | Door | fglPMBo5jEmP1AqkXFpGoQ | 11 | External Door to Cavity Wall | 930 | 2100 | 7450 |
| PX-WALL-001 | PX-WALL-001-OPENING-003 | Window | 1JmnXXWM#UK7#N1QdNGriA | 4 | 212C 1200 x 1200mm Window | 1200 | 1200 | 10340 |
| PX-WALL-002 | PX-WALL-002-OPENING-001 | Structural opening | tdLukGKnNU2zK7rasAZxbg | 1 | Large Opening (3.6 - 4.2m) | 2600 | 0 | 3378.71421611437 |
| PX-WALL-002 | PX-WALL-002-OPENING-002 | Window | RSOatIxjoUy8s#dFJlwI1g | 7 | 212C 1200 x 1200mm Window | 1200 | 1200 | 10175.7142161144 |
| PX-WALL-002 | PX-WALL-002-OPENING-003 | Window | WTFf6kkwO0Og7ZDjlaQBeQ | 6 | 212C 1200 x 1200mm Window | 1200 | 1200 | 14683.7142161144 |
| PX-WALL-003 | PX-WALL-003-OPENING-001 | Window | bnP8nsduoUqtI#ebLBw#oA | 1 | 110C 600 x 1050mm window | 600 | 1050 | 2040 |
| PX-WALL-003 | PX-WALL-003-OPENING-002 | Door | uzO9DDtZPESpGfN9KSP7zg | 12 | Bi-Fold Patio Door to Cavity Wall | 2700 | 2100 | 6596.30852838407 |
| PX-WALL-003 | PX-WALL-003-OPENING-003 | Window | QPznGmbpn0ONvY3yh#DG3A | 10 | 112C 600 X 1200mm Window | 600 | 1200 | 10727 |
| PX-WALL-003 | PX-WALL-003-OPENING-004 | Window | riZmXfUgFEGKzxMQQTxluw | 3 | 212C 1200 x 1200mm Window | 1200 | 1200 | 14287 |
| PX-WALL-004 | PX-WALL-004-OPENING-001 | Window | oI&dVo&UJ0#6F3ADeuUBoQ | 8 | 212C 1200 x 1200mm Window | 1200 | 1200 | 2745 |
| PX-WALL-006 | PX-WALL-006-OPENING-001 | Window | LOQuwAbMLkqZEA56eJ3h6A | 9 | 212C 1200 x 1200mm Window | 1200 | 1200 | 1148 |
| PX-WALL-008 | PX-WALL-008-OPENING-001 | Door | n0Tgmj3Rskm#pWXuVzSTtw | 2 | Internal Door to Solid Wall | 968 | 2050 | 1900 |
| PX-WALL-009 | PX-WALL-009-OPENING-001 | Door | i4iVrKlJukiNkE1gxVQzVA | 1 | Internal Door to Solid Wall | 968 | 2050 | 1825.55147058823 |
| PX-WALL-011 | PX-WALL-011-OPENING-001 | Door | 1GoIyly6nkaaTjXE3VaVFQ | 10 | Internal Door to Solid Wall | 790 | 2050 | 5725 |
| PX-WALL-012 | PX-WALL-012-OPENING-001 | Door | c5t2&&QK5kKArDPqJkU2ZA | 5 | Internal Door to Solid Wall | 968 | 2050 | 6554 |
| PX-WALL-013 | PX-WALL-013-OPENING-001 | Door | bTxWb9Z#Y0#HgFJuKII2IA | 3 | Internal Door to Solid Wall | 968 | 2050 | 3910.00152021011 |
| PX-WALL-015 | PX-WALL-015-OPENING-001 | Door | n63qAsypoUmEN6bPvga&VA | 7 | Internal Door to Solid Wall | 968 | 2050 | 3200 |
| PX-WALL-015 | PX-WALL-015-OPENING-002 | Door | aJmGEaYiw0u2O#QmzVy3Jw | 6 | Internal Door to Solid Wall | 968 | 2050 | 5100 |
| PX-WALL-016 | PX-WALL-016-OPENING-001 | Door | PKZPIrK#HU27jbbIQno9iw | 8 | Internal Door to Solid Wall | 968 | 2050 | 685 |
| PX-WALL-017 | PX-WALL-017-OPENING-001 | Door | I9gV#vcsiUu8xY&3Kg6FXg | 9 | French Door to Solid Wall | 1800 | 2100 | 4702.68302065502 |
| PX-WALL-019 | PX-WALL-019-OPENING-001 | Window | qRtGI#rDS0yaK6wNTWz0lQ | 5 | 212C 1200 x 1200mm Window | 1200 | 1200 | 3573 |
