This is a large request. Here's the plan — I'll confirm a couple of details before building.

## 1. New static pages + footer
- Create routes `/privacy`, `/terms`, `/contact` with the requested sections, dark theme, mobile-responsive.
- Add a shared `Footer` component (rendered in `__root.tsx`) with links to Privacy, Terms, Contact.
- Add a small safety notice on the home/intro screen: "Never share personal information with strangers."

## 2. Coin system (backend)

New tables (RLS enabled, tied to `auth.users`):
- `wallets` — `user_id (unique)`, `balance int default 0`
- `coin_transactions` — audit log: `user_id`, `delta`, `reason` (`spend_lobby`, `ad_reward`, `purchase`, `signup_bonus`, `refund`), `metadata jsonb`, `created_at`
- `ad_rewards` — `user_id`, `created_at` (for cooldown / daily-limit enforcement)
- Add `lobby text default 'any'` (values: `any`, `girls`, `boys`) to `queue` and `match_sessions`

Server functions (in `src/lib/coins.functions.ts`):
- `getWallet()` — returns current balance, creates wallet on first call
- `spendCoins({ amount, reason, metadata })` — atomic deduct via Postgres function `spend_coins(uid, amount, reason, meta)` that errors if balance < amount
- `claimAdReward()` — server-enforced 30s cooldown + 20/day cap, awards 5 coins
- `purchaseCoins({ packageId })` — placeholder that credits coins immediately and logs as `purchase` (real payment integration deferred — see Q1 below)
- New signups get a 50-coin welcome bonus via the `handle_new_user` trigger.

Matchmaking changes (in `matchmaking.functions.ts`):
- `joinQueueFn` accepts a `lobby` parameter; charges 24 coins atomically before insert when lobby ≠ `any`.
- Matching only pairs users in the same `lobby`.
- For girls/boys lobbies, also require the user's profile `gender` to match the lobby (so a "Girls Only" lobby contains only women).
- If user leaves before matching, coins are refunded; once matched, coins are consumed.

## 3. Coin system (UI)
- `CoinBalance` component in the header (animated count-up, coin SVG icon).
- New "Choose Lobby" screen before queueing: Free / Girls (24) / Boys (24) cards with cost + confirmation dialog ("Spend 24 coins?").
- New `/shop` route: 4 coin packages (100 / 250 / 500 / 1000), premium card design, "Buy" button.
- "Watch Ad for Coins" button on home + shop: opens a modal with a 15-second simulated rewarded-ad timer; on completion calls `claimAdReward`. (Real ad SDK can be wired later — see Q2.)
- Toast notifications: "24 coins spent", "Not enough coins" (with link to shop), "You earned 5 coins", "Purchase successful".
- Architecture note: `spendCoins(reason, amount)` is generic so future features (priority match, boosts, badges, unlimited skips) just call it with a different reason.

## Questions before I build

**Q1 — Shop payments:** Real payment processing is a separate, multi-step integration. For now should I:
- (a) Build the shop UI with non-functional "Buy" buttons that instantly credit coins (good for testing the full flow, easy to swap in Stripe/Paddle later), or
- (b) Stop and set up real Stripe/Paddle payments first?

**Q2 — Rewarded ads:** A real rewarded-ad SDK (AdSense/AdMob) requires account approval and isn't available in-sandbox. I'll implement a 15-second simulated ad placeholder with the full reward + cooldown + daily-cap backend, ready to swap in a real provider later. OK?

**Q3 — Gender lobbies:** Should "Girls Only" require the entering user's profile gender = female (and same for Boys)? Or anyone can pay 24 coins to enter any lobby? I recommend the first (it's what users expect).

Reply with answers (e.g. "Q1=a, Q2=ok, Q3=enforce") and I'll build everything in one go.