-- A learner of English sees the app in English: only a learner of isiZulu
-- chooses isiZulu menus and buttons. Setup and the language routes now keep to
-- that rule (src/shared/learnerInterfaceLanguage.ts); this brings older rows,
-- saved before the rule, into line, on the setup row and on the account.
-- Idempotent: a second run finds nothing to change.
UPDATE learner_settings
   SET interface_language = 'english', updated_at = now()
 WHERE target_language = 'english'
   AND interface_language <> 'english';

UPDATE users u
   SET interface_language = 'english'
  FROM learner_settings s
 WHERE s.user_id = u.id
   AND u.role = 'learner'
   AND s.target_language = 'english'
   AND u.interface_language IS DISTINCT FROM 'english';
