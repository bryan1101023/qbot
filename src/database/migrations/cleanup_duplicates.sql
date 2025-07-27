-- Delete duplicate unclaimed sessions while keeping claimed ones
DELETE FROM Session 
WHERE id IN (
    SELECT s1.id
    FROM Session s1
    JOIN Session s2 ON s1.time = s2.time AND s1.date = s2.date AND s1.id != s2.id
    WHERE s1.status = 'available' AND s2.status = 'claimed'
); 