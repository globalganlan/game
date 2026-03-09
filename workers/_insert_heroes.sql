INSERT OR IGNORE INTO hero_instances (instanceId, playerId, heroId, level, exp, ascension, equippedItems, obtainedAt, stars)
VALUES
('PQA_001_3_test', 'PQA_001', 3, 60, 0, 5, '{}', '2026-03-10T00:00:00Z', 6),
('PQA_001_4_test', 'PQA_001', 4, 60, 0, 5, '{}', '2026-03-10T00:00:00Z', 6),
('PQA_001_5_test', 'PQA_001', 5, 60, 0, 5, '{}', '2026-03-10T00:00:00Z', 6),
('PQA_001_7_test', 'PQA_001', 7, 60, 0, 5, '{}', '2026-03-10T00:00:00Z', 6),
('PQA_001_8_test', 'PQA_001', 8, 60, 0, 5, '{}', '2026-03-10T00:00:00Z', 6),
('PQA_001_10_test', 'PQA_001', 10, 60, 0, 5, '{}', '2026-03-10T00:00:00Z', 6),
('PQA_001_11_test', 'PQA_001', 11, 60, 0, 5, '{}', '2026-03-10T00:00:00Z', 6),
('PQA_001_12_test', 'PQA_001', 12, 60, 0, 5, '{}', '2026-03-10T00:00:00Z', 6),
('PQA_001_13_test', 'PQA_001', 13, 60, 0, 5, '{}', '2026-03-10T00:00:00Z', 6);

UPDATE hero_instances SET level = 60, stars = 6, ascension = 5 WHERE playerId = 'PQA_001';
