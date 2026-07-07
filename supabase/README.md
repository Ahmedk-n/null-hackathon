# Supabase setup
1. Apply the schema: paste `migrations/0001_init.sql` into the Supabase SQL editor and run it
   (or `supabase db push` with the CLI linked to project yiiuikrnuevutevujaxk).
2. Enable GitHub OAuth: Auth → Providers → GitHub. Create a GitHub OAuth app, paste client id/secret.
   Add redirect URLs: http://localhost:3000/auth/callback and your prod URL.
3. Email magic-link works out of the box.
The app runs in guest mode (localStorage) until the schema is applied and a user signs in.
