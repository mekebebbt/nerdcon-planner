-- Pre-authorize eshawne@fintechnerdcon.com as an editor.
-- The profile is created automatically on their first magic-link sign-in.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, role, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    CASE
      WHEN lower(NEW.email) = 'micky@fintechnerdcon.com' THEN 'editor'
      WHEN lower(NEW.email) = 'eshawne@fintechnerdcon.com' THEN 'editor'
      WHEN lower(NEW.email) = 'simon@fintechnerdcon.com' THEN 'commenter'
      WHEN lower(NEW.email) = 'mekebeb@protonmail.com' THEN 'commenter'
      WHEN lower(NEW.email) = 'colton@fintechnerdcon.com' THEN 'commenter'
      WHEN lower(NEW.email) = 'julie.v.greenberg@gmail.com' THEN 'commenter'
      ELSE 'commenter'
    END,
    COALESCE(
      NEW.raw_user_meta_data ->> 'display_name',
      split_part(NEW.email, '@', 1)
    )
  );

  RETURN NEW;
END;
$function$;
