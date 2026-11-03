# Connecting Supabase

1. Create a project on supabase.com, in an EU region. Keep the Data API on, with the `public` schema exposed.
2. In Authentication, turn off new sign-ups. The app does not use accounts.
3. In the SQL editor, run `schema.sql`.
4. Run `node scripts/new-codes.js <published address>`. It writes `discesa-codes.private.txt` in the project root, ignored by git, and prints only its path. Never upload the project folder by hand: only git keeps that file off the site. Run the SQL in that file, in the SQL editor.
5. In `js/store.js`, set `url` and `publishableKey` from Project Settings, API. Never use the secret or `service_role` key.
6. Fill `private/content.json` and `private/photos/`, both ignored by git, then run `node scripts/load-private.js`. Names, personal lines, past trips and photos must only ever live there and in the database, never in the public files.
7. Publish the site, then send each person their own message from the private file.

The Security Advisor will warn about "RLS enabled, no policy" and "anon can execute SECURITY DEFINER". Both are the design: do not add policies to silence them.

## Changing content

- To add or edit: change `private/content.json` or `private/photos/`, then run `node scripts/load-private.js`.
- To remove: taking something out of `content.json` does not remove it from the database. In the SQL editor, run `delete from photos where id = '...';` or `delete from past_trips where year = ...;`. Do this at once when someone withdraws consent for a photo.

## Upgrading

When a change needs the database, do it in this order, so nobody meets an empty site: run `schema.sql`, run `node scripts/load-private.js`, then push.

## First check, with the publishable key

Each of these should be refused, because nothing is readable without a code:

- `GET /rest/v1/people` and `GET /rest/v1/houses`: permission denied.
- `POST /rest/v1/rpc/hash_code`: permission denied.
- `POST /rest/v1/rpc/login` with a wrong code: 400 with message `bad_code`.

Then, from the published site and not from a terminal, so real codes stay out of shell history: stamp a skipass, vote, save and delete a quote, close a proposal, add a lodging. As a friend, check that no star button shows.

## Pauses

On the Free plan the project pauses after about a week of low activity. Restore it from the dashboard. Meanwhile the app shows the last data it downloaded and cannot save.

If you change a code, run the script with `--rotate`, run its SQL again and send the new messages.
