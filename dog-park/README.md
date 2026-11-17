# Virtual Dog Park

A small browser-based pet game built for the AIE1101 assignment.

## Project description

Virtual Dog Park is a lightweight web game where you pick two dogs from a lobby of six, give each one a name, and then look after them. You can feed them or play with them to keep them happy, and you watch them grow from young puppies into adults over the days you care for them.

The whole game lives in a single `index.html` file (structure, styles, script and illustrations are all inline). A small Python helper, `app.py`, starts a local web server and opens the game in your browser for you.

## Features

- Six dogs in the lobby, each shown as a card with an illustration, size, personality and a short care guide.
- Pick exactly two dogs to raise.
- A naming step that prompts you for each dog's name.
- Empty names are rejected: if you leave a name blank, the game asks you to enter it again before continuing.
- Feed a dog or play with a dog to raise its happiness.
- Happiness is a 0–100 value that starts at 50 and falls naturally when you do nothing.
- A day counter and a growth stage that changes as the days pass.
- Progress is saved automatically in the browser, so it survives a refresh.
- A "Start over" button clears the saved pets and returns to the lobby.
- Keyboard support and accessible labels: buttons work with the keyboard, illustrations have text alternatives, and every name field has a label.

## How to preview index.html

The game is a static web page, so it should be opened through a local web server (not by double-clicking the file, which can block some browser features).

**Option A — Python launcher (easiest):**

1. Make sure Python 3 is installed.
2. Open a terminal in this folder.
3. Run:

   ```bash
   python app.py
   ```

4. Your default browser opens the game automatically. If it does not, copy the address printed in the terminal (something like `http://127.0.0.1:8765/index.html`) into your browser.
5. Keep the terminal window open while playing. Press Ctrl + C in the terminal to stop the server.

**Option B — VS Code Live Server:**

1. Install the "Live Server" extension in VS Code.
2. Open this folder in VS Code.
3. Right-click `index.html` in the file explorer.
4. Choose "Open with Live Server".
5. The game opens in your browser.

Either option serves the same `index.html`; no build step or package install is needed.

## Growth and happiness rules

**Happiness**

- Range: 0 to 100.
- Every dog starts at 50 happiness.
- Feeding adds 15 points.
- Playing adds 20 points.
- If you do nothing, happiness drops by 1 point every 10 seconds.
- Happiness is capped at 100 and never goes below 0.
- The face on each dog changes with its mood: happy (70+), okay (40–69), or low (below 40).

**Growth**

Growth is based on how many days have passed since you named and started raising the dogs. Day 1 is the first day.

| Stage | Days |
| --- | --- |
| Young (幼年) | Day 1–2 |
| Youth (青年) | Day 3–7 |
| Adult (成年) | Day 7 onward |

Where the ranges meet at day 7, the dog is treated as Adult. The stage is shown in the care screen and changes the dog's size and label.

## Where pet progress is stored

Your dogs' names, happiness values and start date are saved **locally in your browser** using `localStorage` (under the key `virtual-dog-park-v1`).

- The progress is stored in the browser on this device only.
- It is **not** stored in a GitHub account, and it is not uploaded anywhere.
- GitHub is used only to host the project files.
- Clearing your browser data, or using a different browser or device, starts a fresh game.

## Illustration and accessibility notes

- The dog illustrations are SVG drawings created for this project. They are project-created illustrations, **not real dog photographs**.
- Each illustration has a text alternative for screen readers.
- Each name input has an associated label.
- All buttons perform an action and can be reached with the keyboard.
- Text and messages are written in plain language to keep instructions clear.

## Manual testing checklist

Use this list to check the game yourself in a browser:

- [ ] The lobby shows six dog cards, each with an illustration, size, personality and care guide.
- [ ] Selecting one or two dogs highlights their cards; the count updates.
- [ ] A third selection is blocked and shows a message.
- [ ] "Next" stays disabled until exactly two dogs are selected.
- [ ] On the naming screen, leaving a name empty shows an error and keeps you on the screen.
- [ ] Entering both names takes you to the care screen with two dogs shown.
- [ ] The day counter and growth stage are displayed.
- [ ] Feeding raises a dog's happiness by 15; playing raises it by 20.
- [ ] Happiness falls over time when you leave the game idle.
- [ ] Refreshing the page keeps the names and happiness values.
- [ ] "Start over" clears progress and returns to the lobby.
- [ ] All buttons respond, name fields have visible labels, and illustrations have text alternatives.
