# Mistral spreadsheet

<img width="1412" height="876" alt="Screenshot 2026-10-07 at 10 49 38" src="https://github.com/user-attachments/assets/fdc93cb6-1015-431c-9b34-ac33a8d8d1f1" />

This is an attempt to use Mistral Vibe to vibe code a non-trivial program.

## The experiment

I used Mistral Vibe as of 6 Oct. 2026, created this repo and connected it, then gave instructions for building a simple spreadsheet program.
To make it work, I had to:
- send the first prompt through mistral vibe
- send a second prompt to ask that the code be committed to the connected repository, not simply sent as a message in the chat
- send another prompt to ask for a testing application, as the initial work only gave a library (even though I asked for an app)

Then I had to use Claude to fix a few things to make this workeable:
- allow me to create a server that runs the app as the first solution given by Mistral Vibe wasn't working
- create a test bed, with synthetic data, so I can start with a useable spreadsheet instead of an empty one
- add a little UI polish

## The results

I gave Claude the responsibility to test the program through the actual UI. Here's what was found:

What works

- Grid: 50 rows by 10 columns render, and scrolling reaches row 50.
- Values: numbers, text and true show as typed. Numbers are right-aligned and errors are red.
- Arithmetic and functions:
  - =(A1+B1)*2-3/1.5 evaluates correctly.
  - SUM and MAX work, including over ranges.
  - Lowercase =sum(a1:b1) works.
  - IF works and flips between "big" and "small" when its input changes.
- Errors:
  - #DIV/0! and #VALUE! appear where expected, including text + 1.
  - A #DIV/0! in a cell propagates to cells that depend on it and to SUM over a range containing it.
  - Mutual and self-referencing formulas show #CYCLE!.
  - Bad syntax (=1+) shows #VALUE! rather than crashing.
- Recompute: changing A1 updates all dependent cells, and the "Last Recomputed Cells" panel lists the right ones.
- Buttons and keys: Clear empties the selected cell, Reset Stats works, and Tab, Enter and the arrow keys navigate.

What doesn't work

1. Typing into a filled cell appends instead of replacing. Clicking a cell with 5 in it and typing 8 gives 58, and doing it again gave 2085. Cells need select-all on focus.
2. Visiting a formula cell destroys its formula. Focusing a formula cell and leaving it re-commits the displayed value. In my run =A1*2 became the constant 170, and changing A1 afterwards no longer updated it. This is the worst bug.
3. The formula bar is read-only and shows values.
   - It has no input handler, so typing there does nothing.
   - It shows the computed value, not the formula, and shows [object Object] for error cells such as #CYCLE!.
   - It goes stale after Clear.
   - Bugs 2 and 3 share a root cause: the app has no way to get a cell's raw input back from the library.
4. Stats panel gets polluted by simply navigating. Tabbing or Enter through an empty cell commits null to it, so cells like B2 show up as "recomputed" without being edited.
5. Enter moves right instead of down. It's also not a real commit-and-stay.
6. Empty-cell references display as blank, not 0. =E2 and =Z99, which point at empty cells, show nothing. This may be intended library behavior.
