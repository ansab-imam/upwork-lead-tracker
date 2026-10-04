# Setting up your own copy of Lead Tracker

Follow these steps in order. They take about 15 minutes. You'll need free accounts on
[GitHub](https://github.com), [Supabase](https://supabase.com) and [Vercel](https://vercel.com).

## 1. Create your database (Supabase)

1. In Supabase, click **New project**. Pick a name, a database password (save it somewhere) and a region.
2. When the project is ready, open **SQL Editor** → **New query**.
3. Open the file [`supabase/setup.sql`](supabase/setup.sql) from this project, copy **all** of it, paste it in, and click **Run**.
   You should see "Success. No rows returned". This creates every table, the security rules and the backup tools.
   It's safe to run again if you're unsure whether it worked.

## 2. Add the user-management helper (Supabase)

This lets admins add and remove users from the **Users** page.

1. Install the Supabase CLI: <https://supabase.com/docs/guides/cli/getting-started>
2. In a terminal, inside this project folder, run:

   ```
   supabase login
   supabase functions deploy admin-users --project-ref YOUR-PROJECT-REF --use-api
   ```

   `YOUR-PROJECT-REF` is the code in your Supabase project's web address:
   `https://supabase.com/dashboard/project/`**`abcdefghijklmnop`**

## 3. Create your first login (Supabase)

1. In Supabase, go to **Authentication** → **Users** → **Add user** → **Create new user**.
2. Enter your email and a password, and tick **Auto Confirm User**.

The **first person to sign in to Lead Tracker automatically becomes an admin.** After that,
add everyone else from Lead Tracker's **Users** page.

## 4. Put the website online (Vercel)

1. In Vercel, click **Add New** → **Project** and import your GitHub copy of this project.
2. Before clicking Deploy, open **Environment Variables** and add these two
   (find them in Supabase → **Project Settings** → **API**):

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your **Project URL**, e.g. `https://abcdefghijklmnop.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | your **anon / public** key |

   ⚠️ Without these, the website shows a blank page.
   Never use the **service_role** key here.

3. Click **Deploy**. If you add or change the variables later, go to **Deployments** → **⋯** → **Redeploy**.

## 5. Sign in and bring in data

1. Open your new website and sign in with the login from step 3. You'll be an admin.
2. To try it with example data: open **Proposal Details** → **Import** and choose [`sample-data/sample-proposals.csv`](sample-data/sample-proposals.csv).
3. To load your own data from a backup file: go to **Backup & Restore** → **Choose backup file…**, type `RESTORE` and confirm, then reload the page.

**Note about users in a backup:** passwords can't be stored in a backup file, so the people in the
backup aren't recreated as logins. Add them again on the **Users** page.

## Something not working?

- **"This Lead Tracker database isn't set up yet"** → step 1 wasn't completed. Run `supabase/setup.sql` again.
- **Can't see Backup & Restore or Users** → you're not an admin. If someone else signed in first, they are the admin.
- **Blank white page** → the Vercel environment variables from step 4 are missing. Add them and redeploy.
- **Adding users fails** → step 2 wasn't completed.
