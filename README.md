# Imposter

A pass-and-play party game for one phone. Everyone is shown the same secret
word — except the randomly chosen **imposters** (1–4, your pick), who are told
only *"You are the imposter"*. No category, no hints, and imposters don't
learn who the other imposters are.

## How to play

1. Add at least 3 player names (up to 20), pick a word list and how many
   imposters (imposters must stay a minority: 2 need 5 players, 3 need 7,
   4 need 9), and tap **Start game**.
2. Pass the phone around: each player privately reveals their card, then hides
   it and passes on. The imposter's card looks identical from a distance, so
   nobody can be spotted at a glance.
3. Going around the circle, each player says **one word** that describes the
   secret word. The imposters have to bluff.
4. Vote on who the imposters are, then tap **Reveal**.

## Running locally

No build step, no dependencies — it's a static page. From the repo root:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

Any static file server works (`npx serve`, nginx, GitHub Pages, …).

## Where the words and players come from

- **Words**: `words.js` holds a curated flat list of ~390 easy, concrete
  English dictionary words (spoon-level). The list is flat on purpose — no
  category structure exists that could leak a hint to the imposter. A word is
  not repeated until the whole list has been used (tracked in localStorage).
- **Players**: typed in on the setup screen and saved to localStorage, so the
  same group doesn't have to retype names next game.

A round in progress survives an accidental refresh — the app offers to resume
where it left off.
