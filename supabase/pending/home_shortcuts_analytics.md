# Home shortcuts analytics: proposal (not implemented)

Status: proposal only. No table, migration or client event exists yet. The
user decided on 2026-10-24 not to create `home_shortcut_opens` in this phase.

## What we want to know

1. How often people open the "Want to read / play / watch" shortcuts.
2. Which category they open.
3. Whether they then start something from the waiting list (waiting list to
   in progress).

## What already exists and why it is not enough

- `activation_events` (`VylloAnalytics.milestone`) keeps only the first time
  per account and event (`unique (user_id, event)`). It answers "has this
  account ever used a shortcut", not "how often".
- `activity_log` already gets a row when an item changes status
  (`field = 'status'`, `note` = the new status). It does not store the
  previous status, so "waiting list to in progress" cannot be read from one
  row.

## Proposed events

### 1. `home_shortcut_opens` (new table)

Same pattern as `app_opens` and `search_misses`: at most one row per account,
day, category and Home layout. Never the item or any title.

| column     | type        | notes                                         |
|------------|-------------|-----------------------------------------------|
| id         | bigint      | identity                                      |
| created_at | timestamptz | default now()                                 |
| user_id    | uuid        | references auth.users, on delete cascade      |
| day        | date        | local day, like app_opens                     |
| category   | text        | check in ('book', 'game', 'film')             |
| layout     | text        | check in ('resume', 'choose_next')            |
| unique (user_id, day, category, layout)                                    |

RLS: insert own only, like the other analytics tables. The client sends it
from the Home shortcut tap (fire-and-forget, queued offline like the others),
deduplicated in memory per day.

### 2. Waiting list to in progress

Two options, cheapest first:

- **No new event (recommended first):** join `home_shortcut_opens` with
  `activity_log` rows `field = 'status' and note = 'in_progress'` for an item
  of the same category within 24 h of the open. It approximates the
  conversion; an item that was "completed" before and is restarted would also
  count, which is rare.
- **Exact:** a milestone-style row `started_from_waiting_list` with the
  category, sent by the client when it saves a status change whose previous
  status was waiting list. Daily-deduplicated like (1).

### Queries to add to `supabase/queries/funnel.sql` when implemented

- Opens per day and category, split by layout.
- Share of accounts that opened a shortcut in their first 7 days.
- Conversion: opens followed by a start in the same category within 24 h.

All queries must exclude `public.analytics_excluded_users`.

## Already shipped with the new Home (no migration)

`add_opened` (`activation_events.detail`, free text, no check constraint)
gets two new origins next to `onboarding`, `empty_home`, `button`, `link`:

- `home_next`: the "What's next?" buttons on a Home with only completed items.
- `library_empty`: the add button on an empty waiting list in the Library.

It is still the first origin per account only. `funnel.sql` section 12 groups
by the origin without a fixed list, so the new values show up as new rows.
