-- READ-ONLY counts of existing rows that would make 20261025010000_rls_v2_schema.sql abort (it validates every CHECK).
-- Not run against prod by this rehearsal; run only with Usman's approval, before step 1.
select 'students_name_len' c, count(*) from public.students where not (char_length(name) between 1 and 120)
union all select 'students_email_len', count(*) from public.students where char_length(email) > 254
union all select 'signatures_image_png', count(*) from public.signatures where not (char_length("signatureImageUrl") <= 700000 and "signatureImageUrl" like 'data:image/png;base64,%')
union all select 'signatures_name_len', count(*) from public.signatures where not (char_length(btrim("signatoryName")) between 1 and 80)
union all select 'signatures_note_len', count(*) from public.signatures where not ("signatoryNote" is null or char_length(btrim("signatoryNote")) between 1 and 1000)
union all select 'signatures_position_xy', count(*) from public.signatures where not coalesce(jsonb_typeof(position->'x')='number' and jsonb_typeof(position->'y')='number' and (position->>'x')::numeric between 0 and 100 and (position->>'y')::numeric between 0 and 100, false)
union all select 'feedback_name_len', count(*) from public.feedback where not (char_length(btrim(name)) between 1 and 80)
union all select 'feedback_email_format', count(*) from public.feedback where not (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
union all select 'feedback_message_len', count(*) from public.feedback where not (char_length(btrim(message)) between 1 and 2000)
union all select 'feedback_type_valid', count(*) from public.feedback where type not in ('comment','review','inquiry')
union all select 'feedback_rating_range', count(*) from public.feedback where not (rating is null or rating between 1 and 5)
union all select 'feedback_rating_only_for_reviews', count(*) from public.feedback where not (type = 'review' or rating is null)
union all select 'thank_you_cards_dup_signature', count(*) - count(distinct "signatureId") from public.thank_you_cards;
