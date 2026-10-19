-- Align existing English questions with the six five-question proficiency tiers.
UPDATE placement_questions
   SET level_number = LEAST(6, GREATEST(1, (order_index / 5) + 1));