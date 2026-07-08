-- Profiles table for build-view auth roles
-- Run this in the Supabase SQL Editor BEFORE enabling RLS on sessions/speakers/stages

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'commenter' CHECK (role IN ('editor', 'commenter')),
  display_name text,
  created_at timestamptz DEFAULT now()
);

-- Seed roles (run after both users have signed in at least once via magic link)
-- Replace the UUIDs below with actual auth.users IDs after first login,
-- OR use the trigger below to auto-create profiles on signup.

-- Auto-create a profile row when a new user signs up via Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    CASE
      WHEN NEW.email = 'micky@fintechnerdcon.com' THEN 'editor'
      WHEN NEW.email = 'simon@fintechnerdcon.com' THEN 'commenter'
      WHEN NEW.email = 'mekebeb@protonmail.com' THEN 'commenter'
      ELSE 'commenter'
    END,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS on profiles: anyone authenticated can read profiles, only the user can update their own
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by authenticated users" ON profiles
  FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);
