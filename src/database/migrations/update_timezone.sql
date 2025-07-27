-- Update all session times from EST to EET
UPDATE Session SET time = REPLACE(time, 'EST', 'EET') WHERE time LIKE '%EST%'; 