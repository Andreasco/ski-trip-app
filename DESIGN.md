---
name: La Discesa 2027
description: A painted piste map of one ski trip, skied from summit to bar.
colors:
  snow: "#f7f9fb"
  ice: "#dce8f2"
  sky: "#a9c6df"
  sky-zenith: "#4f82b5"
  shadow: "#5c7fad"
  deep: "#2b4c7e"
  deeper: "#1b3257"
  ink: "#10192b"
  muted-ink: "#3c4a60"
  label-ink: "#30496f"
  ticked-ink: "#4d5a70"
  white: "#ffffff"
  red: "#c8202f"
  blue: "#1f5fbf"
  green: "#1f8a4d"
  ungraded: "#8ea9bf"
  post: "#6b4a2f"
  post-dark: "#3f2a19"
  forest-slate: "#2b444a"
  lamp: "#f2b84b"
typography:
  display:
    fontFamily: "Bowlby One, Barlow, sans-serif"
    fontSize: "clamp(2.1rem, 9.2vw, 4rem)"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Bowlby One, Barlow, sans-serif"
    fontSize: "clamp(1.9rem, 7.4vw, 3.6rem)"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "-0.01em"
  place:
    fontFamily: "Bowlby One, Barlow, sans-serif"
    fontSize: "clamp(1.9rem, 8.4vw, 3.4rem)"
    fontWeight: 400
    lineHeight: 1.05
  figure:
    fontFamily: "Bowlby One, Barlow, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 400
    lineHeight: 1.2
  closing:
    fontFamily: "Bowlby One, Barlow, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "-0.01em"
  sign:
    fontFamily: "Bowlby One, Barlow, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 400
    lineHeight: 1.05
  title:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1.45rem"
    fontWeight: 800
    lineHeight: 1.15
  lead:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1.3rem"
    fontWeight: 800
    lineHeight: 1.25
  verdict:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 800
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  button:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 800
    lineHeight: 1.15
  label:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
  fine:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
  small:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
  tag:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
  hand:
    fontFamily: "Shantell Sans, Barlow, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.35
rounded:
  mark: "2px"
  post: "3px"
  control: "4px"
  seat: "10px"
  gauge: "9px"
  pill: "23px"
  car-tail: "26px"
  car-roof: "56px"
spacing:
  gap-tight: "6px"
  gap: "8px"
  inset: "12px"
  gutter-right: "16px"
  gutter-right-wide: "32px"
  gutter-left: "26px"
  gutter-left-wide: "44px"
  section-top: "56px"
  section-bottom: "64px"
components:
  button-primary:
    backgroundColor: "{colors.deep}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: ".7rem 1.2rem"
    height: "52px"
  button-primary-hover:
    backgroundColor: "{colors.deeper}"
  button-go:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: ".7rem 1.2rem"
    height: "52px"
  button-go-hover:
    backgroundColor: "{colors.deeper}"
  button-go-on-dark:
    backgroundColor: "{colors.snow}"
    textColor: "{colors.ink}"
  button-go-on-dark-hover:
    backgroundColor: "{colors.ice}"
  button-go-board:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    padding: ".7rem 1.2rem"
    height: "54px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.deep}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: ".7rem 1.2rem"
    height: "52px"
  button-quiet-hover:
    backgroundColor: "{colors.ice}"
  direction-sign:
    backgroundColor: "{colors.deep}"
    textColor: "{colors.white}"
    typography: "{typography.sign}"
    padding: "5px 36px 5px 12px"
    height: "50px"
  direction-sign-hover:
    backgroundColor: "{colors.deeper}"
  cartouche:
    backgroundColor: "{colors.snow}"
    textColor: "{colors.ink}"
    padding: "11px 14px 10px"
  skipass:
    backgroundColor: "{colors.snow}"
    textColor: "{colors.ink}"
    padding: "22px 16px 12px"
  pill:
    backgroundColor: "{colors.snow}"
    textColor: "{colors.deep}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: ".4rem 1rem"
    height: "46px"
  pill-hover:
    backgroundColor: "{colors.white}"
  pill-pressed:
    backgroundColor: "{colors.deep}"
    textColor: "{colors.white}"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: ".4rem .7rem"
    height: "50px"
  bottom-nav:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    height: "52px"
  bottom-nav-current:
    backgroundColor: "{colors.snow}"
    textColor: "{colors.ink}"
  seat:
    backgroundColor: "{colors.snow}"
    textColor: "{colors.ink}"
    rounded: "{rounded.seat}"
    padding: "12px 8px"
    height: "86px"
  seat-aboard:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
  car-frame:
    backgroundColor: "{colors.deep}"
    rounded: "{rounded.car-roof}"
    padding: "92px 34px 48px"
  live-total:
    backgroundColor: "{colors.snow}"
    textColor: "{colors.ink}"
    typography: "{typography.figure}"
    padding: "8px 12px"
  saved-quote:
    backgroundColor: "{colors.snow}"
    textColor: "{colors.ink}"
    padding: "12px"
  proposal-row:
    backgroundColor: "{colors.snow}"
    textColor: "{colors.ink}"
    padding: "12px"
  ledger-total:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.figure}"
    padding: "14px 12px"
---

# Design System: La Discesa 2027

## Overview

**Creative North Star: "The Painted Descent"**

The whole product reads as one hand-painted piste map in the Berann tradition. A gouache panorama, painted live in the browser from real elevation data, gives the mountain its authority, and everything else behaves like an object found on a real slope: a paper title cartouche, wooden direction signs, trail discs, a map legend. The visitor moves downhill from summit to bar, with a red line recording the way.

The palette is cold and matter-of-fact, so the piste colours carry the only saturated signal. Type is loud on places and totals, plain on data, and casual only where the organiser speaks. Density stays low and phone-first, with big targets, one column and honest figures at a size a skier can read outdoors.

Motion belongs to the paint and to one gesture. The panorama lays its strokes down on load over about 90 frames, then rests. Stamping the skipass is the single authored moment of the interface: the stamp lands, the turnstile opens, and the page settles in. The rail follows the scroll, signs nudge along their arrow on hover, and the 3D flight only starts on request. With reduced motion every painting lands finished, the flight jumps to its last frame, and transitions are removed.

**Key Characteristics:**
- Panoramas come from code and real terrain, with a labelled fallback relief when the tiles fail. The bar scene is an authored SVG repainted with the same brush.
- A cold ramp from snow to ink, plus red, blue, green and black as piste marks.
- Physical components with material grain rather than generic cards.
- Three typefaces with strict jobs: sign painter, data, hand note.
- Flat tonal bands, with a single floating sheet.
- Rasters in `icons/` carry their origin embedded: `og.jpg` is a capture of the page's own gate, the PNG icons come from `icon.svg`.

## Colors

A cold mountain ramp from snow to ink, with piste marks as the only saturated colour and wood as the only warm material. The bar scene's lamp light is the one exception to both.

### Primary
- **Deep Slope Blue** (#2b4c7e): headings, default buttons, direction boards, the Conto band, pressed pills, the car frame, hand notes on light grounds, the 2027 board in past trips. Also the theme colour.
- **Night Slope Blue** (#1b3257): hover on deep surfaces and on the Go action, the gauge track, the bar section and its night sky.

### Secondary
- **Red Piste** (#c8202f): intermediate grade on discs and piste lines, and the way down on the rail and the red piste in the bar scene. Nothing else.

### Tertiary
- **Blue Piste** (#1f5fbf): easy grade only, on discs and piste lines.
- **Green Piste** (#1f8a4d): the gentlest grade, on a destination's disc.
- **Ungraded** (#8ea9bf): runs with no grade in the map data, on piste lines and on their disc in the key. Pale on purpose, so it never reads as a grade.
- **Post Wood** (#6b4a2f) and **Dark Wood** (#3f2a19): the signpost and the cabin in the bar scene.
- **Forest Slate** (#2b444a): midtone of the painted forest. It lives in the painter and the flight tint, never in page chrome.
- **Lamp** (#f2b84b): the windows and glow of the bar scene, and nowhere else.

### Neutral
- **Snow** (#f7f9fb): page ground, paper, past-trip tags, seats, ledger rows, the current nav item, the Go action on dark bands, and the colour the paintings fade into.
- **Ice** (#dce8f2): alternating band, arrow buttons, quiet-button hover, Go hover on dark bands.
- **Sky** (#a9c6df): painted horizon, canvas placeholder, gauge band, ledger and tally hairlines, the car's windscreen.
- **Sky Zenith** (#4f82b5): top of the painted sky and of the flight's sky.
- **Shadow Blue** (#5c7fad): the shaded snow midtone, and the row rules on deep bands.
- **Ink** (#10192b): text, black piste grade, paper rules, map frames, ledger total, footer, bottom nav, the Go action (`--go` is an alias of this value), the dark cut board, the seat aboard, the gauge marker, and focus and invalid marks on light grounds.
- **Muted Ink** (#3c4a60): fine print, fact labels and secondary notes on light grounds.
- **Label Ink** (#30496f): source tags.
- **Ticked Ink** (#4d5a70): completed checklist items, with a line-through.
- **White** (#ffffff): text on deep and ink, input ground, disc rings, focus and invalid marks on dark grounds.

### Named Rules
**The Piste Code Rule.** Blue, green, red and black appear as saturated marks only to grade a piste or a destination, with a legend in the chapter that draws them. Red also draws the way down, on the rail and the red piste in the bar scene. It never marks an action, a current or selected state, focus or an error; those use ink, deep or snow.

**The Cold Ground Rule.** Grounds and panels come from the snow-to-ink ramp. Warm neutrals are reserved for wood, so a brown surface is always a physical object in the scene.

## Typography

**Display Font:** Bowlby One (with Barlow, sans-serif)
**Body Font:** Barlow 400, 600, 800 (with system-ui, sans-serif)
**Label/Mono Font:** Shantell Sans 500 for hand notes (with Barlow, sans-serif)

**Character:** A fat sign-painter's face against a sober Alpine road-sign sans, interrupted by a friend's handwriting. All three are self-hosted and swap in, with tabular figures on by default.

### Hierarchy
- **Display** (400, clamp(2.1rem, 9.2vw, 4rem), 1.04): the hero title in the cartouche.
- **Headline** (400, clamp(1.9rem, 7.4vw, 3.6rem), 1.04): chapter headings, balanced wrap.
- **Place** (400, clamp(1.9rem, 8.4vw, 3.4rem), 1.05): destination names under their plate.
- **Figure** (400, 1.3 to 1.5rem, 1.1 to 1.2): live total, saved-quote total, ledger total, past-trip years, rank positions, objection titles.
- **Closing** (400, 1.6rem, 1.04): the footer heading.
- **Sign** (400, 1.1rem, 1.05): destination name on a board.
- **Title** (Barlow 800, 1.45rem, 1.15): subsections inside a chapter.
- **Lead** (Barlow 800, 1.3rem, 1.25): a destination's one-line pitch.
- **Verdict** (Barlow 800, 1.2rem): the budget verdict. Comparison figures share the size.
- **Body** (Barlow 400, 1.125rem, 1.5): running text, capped at 62ch.
- **Button** (Barlow 800, 1.0625rem, 1.15): buttons.
- **Label** (Barlow 600, 1rem): pills, navigation, legend. Field labels step up to 800.
- **Fine** (Barlow 400, 0.9375rem): fine print, the hero offer, plate notes.
- **Small** (Barlow 400, 0.875rem): fact labels and board data.
- **Tag** (Barlow 600, 0.8125rem): source tags, in label ink.
- **Hand** (Shantell Sans 500, 1 to 1.25rem, 1.3 to 1.35): the organiser's asides.

### Named Rules
**The Sign Painter Rule.** Bowlby One names places, chapters and totals, in one or two short lines. Running text and explanations stay in Barlow.

**The Hand Note Rule.** Shantell Sans is only the organiser talking, and it never carries a number. Figures stay in Barlow or Bowlby One, because they must read as fact.

## Layout

A single phone-first column. The hero fills the screen (100svh), with the cartouche pinned to the top and the post to the bottom, so the mountain shows between them. Painted plates run full bleed (68svh, 74vh from 760px, capped at 760px and 820px), and each is followed by its text at up to 44rem. Other chapters are tonal bands of snow, ice or deep, padded 56px top and 64px bottom, with content capped at 62rem.

Internal rhythm is small and steady: 6 to 8px between related controls, 12 to 18px inside groups, larger jumps between subsections. The single width breakpoint at 760px widens the gutters, adds a three-column layout to past trips and objections, moves the budget form to two columns, and turns the bottom nav into a centred 26rem bar. Under 700px of viewport height the hero tightens so the summit stays clear.

**The Rail Gutter Rule.** The left gutter is always wider than the right (26px and 16px, 44px and 32px from 760px), because text must never run under the rail.

## Elevation & Depth

Flat by default. Depth comes from the painted scene, from tonal bands and from material grain painted at runtime onto boards, post and paper. Each grain tile paints every stroke at all wrapped offsets, so it repeats without a seam.

Chapters meet on a torn brush edge. A 640 by 26px mask painted at runtime (`--edge`, also wrapped across its width) cuts a strip of the chapter's own colour (`--chapter`) that rises 25px over the chapter above. The first section has none.

### Shadow Vocabulary
- **Sheet float** (`box-shadow: 0 10px 28px rgb(16 25 43 / .28)`): lifts a paper sheet off the painted sky: the cartouche, or the skipass that stands in for it until the turnstile opens.

### Named Rules
**The One Sheet Rule.** Only one sheet casts a shadow at a time, because only paper lies over the painting: the skipass at the gate, then the cartouche. Other objects sit in the scene or on a tonal band.

## Shapes

Physical objects keep their physical outline. Boards are square-ended and cut to a 24px arrow, the post is a 12px upright with barely eased 3px top corners, and paper is square with a 4px double rule. Interactive controls share a slight 4px corner. Pills are fully rounded and reserved for choosing a destination to view. The car in the voting chapter has its own silhouette (56px roof, 26px tail) under its painting, with 10px seats. The gauge marker and the focus ring ease to 2px. Discs are perfect circles.

**The Cut Board Rule.** Signs and paper sheets are never rounded, and a board's direction is expressed by its cut. Car seats are the one exception, cushions that take the paper grain inside the car's own silhouette.

## Components

### Buttons
Blunt and thumb-sized.
- **Shape:** slight corner (4px), 2px matching border, 52px minimum height.
- **Primary:** deep blue with white text. Secondary actions like flying over a destination.
- **Go:** ink with white text, night blue on hover. On deep and night bands it flips to snow with ink text, ice on hover. The one action that moves a person toward the choice.
- **Quiet:** transparent with deep text and border. The no-shame pass and similar alternatives, side by side with Go.
- **Hover / Focus:** background shift in .18s, press drops 1px, 3px ink focus ring at 2px offset, white on dark bands. Disabled actions fade to .7.

### Chips
- **Style:** destination pills with snow ground, deep text and 2px border, fully rounded (23px), 46px high.
- **State:** `aria-pressed` fills deep with white text, hover lifts to white.

### Cards / Containers
There is no generic card. Content sits on bands, on a plate, or in a purpose-built object.
- **Cartouche:** snow with painted paper fibre, 4px double ink rule, the only shadow. Holds title, hand note and offer. Maximum 34rem.
- **Ledger:** snow rows on the deep band, 1px sky hairlines, right-aligned bold figures, source tags beneath each label, closing on an ink total row in Bowlby One.
- **Facts:** two-column definition grid between 2px ink rules. The last fact holds the owner's two ratings, at equal weight.
- **Venues:** after the facts, a heading, a plain list where each venue's name is its source link, and one sentence on how the evening works.
- **Past Trips:** done years are paper tags with the 4px double ink rule; the open year is a deep board with grain, cut to the same 24px arrow as the signs.

### Inputs / Fields
- **Style:** white ground, 2px ink border, 4px corner, 50px high, Barlow 600 at 1.125rem. Labels are bold and always visible.
- **Radio boards:** on deep bands, radios become 48px labelled tiles with a 2px white border that fill white when checked, with a white focus ring.
- **Error:** ink border and 3px dashed ink outline, white on deep bands, plus a sentence saying the total keeps the last valid value.

### Navigation
A four-link ink bar fixed at the bottom, 52px high with safe-area padding. It slides in on the shared easing once the hero is 65% gone, and the current chapter fills snow with ink text. It is full width on phones and a centred 26rem bar from 760px.

### Direction Post
The hero's choice mechanism: a wooden upright and stacked destination boards, closing with the Go action as a dark cut board: ink with board grain, no border, 54px high, the same 24px arrow cut and the same inset white focus ring as the signs. Each board holds trail disc, name in Bowlby One and two lines of data, painted with board grain and cut to an arrow. Hover darkens it and slides it 6px along its arrow. The arrow cut also clips anything drawn outside the box, so a board needs a focus treatment that stays inside its outline.

### Photo Prints
Photos of past trips, in a row to swipe under each trip's title. Each is a print on paper with a 7px margin and a 1px sky edge, tilted under a degree, at its own proportions, so no face is cropped. No shadow: the One Sheet Rule holds. A row loads whole as it nears the screen, on an ice ground until then.

### Skipass Gate
What a visitor meets before anything else: the painted mountain, a paper skipass hanging from a deep lanyard, and a turnstile planted in the snow. Everything else stays hidden until the skipass is stamped.
- **Skipass:** snow with paper grain and the 4px double ink rule, at most 24rem wide, in the same corner as the cartouche from 760px. It holds the name when the link gives one, the code field and a note on who gives it out when it does not, a decorative ink barcode and the Go action.
- **Turnstile:** two wooden posts with ink readers and two arms in ink and sky bands, painted at runtime with a rough brush, meeting in the middle.
- **Stamp:** "Valido" in Bowlby One, deep with a double rule, rotated 9 degrees, with its ink multiplied onto the paper and broken up by a painted speckle. It is never red: the Piste Code Rule holds.
- **Hand note:** a personal link also shows that friend's own line. It goes when the skipass is stamped, because the page repeats it.
- **The gesture:** the stamp slams down fast, the arms swing away over 3s, after 3.5s in which the stamp and the wish have their moment, the skipass rises off the screen, and the cartouche and post settle in. Under reduced motion the page simply opens.
- **Errors:** a sentence naming the problem and the way out, with the field's dashed ink mark. A code from a personal link leaves the address bar before anything is drawn.

### Trail Disc and Piste Key
A 1.15em inline SVG circle with a 2.5 white ring, so black stays legible on deep boards. It marks a destination in every context where one is named: signs, plates, budget, ranking, comparison, route. The piste key repeats discs with Facile, Media, Difficile and Senza grado in each chapter that draws pistes. The hero and the later plates rely on the key in the Mete chapter, about two screens below the hero: the audience is advanced skiers who read these colours natively, and the mountain stays clear.

### Piste Rail
A fixed red wandering line in the left gutter, 3px with a round cap, drawn by scroll progress with a snow-filled marker at its tip. It runs the visible height above the bottom nav, in even bends, and its marker lands on the red piste painted in the bar scene.

### Painted Plate
A full-bleed canvas of a destination at gouache grain: sky by dry brush, terrain strokes following the slope, trees, piste lines with slight wobble, labelled peaks and villages with ink leader lines and a snow halo. It fades into snow at the bottom. If tiles fail, it uses an invented relief and says so on a snow note.

Piste runs are continuous ribbons with a pale edge. Trees are two-dab brush marks, the nearest ground dissolves into mist, and the treeline is set per destination. Boards, post and paper carry runtime painted grain.

### Piste Chart
The offline map: graded lines at 2.6px on a white ground inside a 3px ink frame, with labels in Barlow 600 and a snow halo. This is a plain working drawing, built for offline legibility and not a style for maps in general.

### Bar Scene
The closing image, painted from an authored drawing with a jagged night range. The hut and skis are too small for the panorama brush, so they get a finer brush with a soft restamp over it. The piste stays crisper, because the rail lands on it. The brush grows with the scene's width, so a wide screen keeps the same painted grain as a phone.

### Car Frame
Four seats inside a car seen from above, painted at runtime with the panorama brush from an authored drawing: body, windscreen, rear window, mirrors and wheels. Two columns of 10px seats in snow with paper grain sit on top, each with its status beneath. A seat turns ink with dark board grain and white text once its person is aboard. Until the painting lands, or if it fails, the car is a plain deep rounded block with its seats. The painting then settles in over .4s, like the bar scene, and lands at once under reduced motion.

### Pros Board
A square deep blue board right after a destination's pitch, with snow text at weight 700 and a native list. The caveats come last in the card, as a plain note at the same reading size: nothing is hidden, the pros simply speak first.

### Live Total
A paper strip with a 4px double ink rule, sticky through the budget block and no further. It holds the destination and days at 0.9375rem, the total in Bowlby One at 1.5rem, and the words "a testa".

### Quote Calculator
The answer comes first: destination rows, one control holding disc, name, published figure per head with the kilometres of piste it buys, and lodging, then the ledger with its "Voce / A testa" header and the verdict. The number fields stay folded in a native details under "Cambia le voci", grouped by who pays (the group, split among everyone, per head) in fieldsets with a Bowlby One legend at 1.2rem. Each group is a two-column grid at every width, with a 12px gap, labels at 0.9375rem and inputs aligned to the bottom so uneven labels keep them level.

### Lodging Row
A paper row with a 4px double ink rule, grouped under its destination's disc. It adds the zone, who found it, a source link only for https addresses, the lodging's own total price on the right, and the whole trip's cost per person in a bold line. Every euro in bold states its base. The form to add one stays folded under the list. Deleting asks for confirmation first, in the browser's own dialog. Folded blocks are a native details whose summary is a 52px outlined bar with an inline chevron. The one that sets the published figures carries an inline deep star and the words "Alloggio di riferimento". Only the organizer can set it; the author and the organizer can delete.

### Saved Quote Row
A plain snow row on the deep band, 12px inset, quieter than a lodging because it is a version of the trip and not an ingredient of it. Name, stay and note on the left, total per head in Bowlby One at 1.4rem on the right, and a row of 46px small buttons beneath.

### Vote Tally
Hidden until the first vote. Destinations in score order, each with disc, name and bold points over a sky hairline. Beneath it, a plain list states each person's ranking in words, or that they pass.

### Proposal Form and List
A form capped at 34rem: a bold visible label, a textarea and a default deep button. Saved proposals are plain snow rows, 12px inset, with no rule or grain, so they stay quieter than a saved quote. The organizer also sees two 46px small buttons to accept or discard, the author one to delete, and everyone sees the status in words.

### Budget Gauge
An 18px night-blue track, the past-trip range as a sky band, and an ink 8px marker with white border that glides on the shared easing. A sentence below always states the verdict, so the gauge is never the only signal.

### Ranking Row
A 2px deep-framed row with position in Bowlby One, disc, name, and two 48px arrow buttons in ice with inline SVG chevrons. Focus follows the moved item.

**The Glove Rule.** Standalone controls never stand below 46px, and most stand at 48 to 52px, because the reference is a phone on a cold mountain.

## Do's and Don'ts

### Do:
- **Do** paint imagery with the existing brush, from real elevation data wherever a real place is shown, and label illustrations as not to scale.
- **Do** place a piste key or a plain legend in every chapter that grades pistes, with the hero relying on the Mete chapter's key as noted above.
- **Do** keep red to red piste discs, piste lines and the rail, with actions in ink, deep or snow and one Go action per decision.
- **Do** draw marks and icons as inline SVG, like the trail discs and rank chevrons.
- **Do** paint boards, post and paper with the runtime grain so they read as material, keeping the flat colour behind them as fallback.
- **Do** tag each estimate with its source right beneath the figure, at 0.8125rem and weight 600.
- **Do** land paintings finished, with no stroke animation, under reduced motion.
- **Do** give the quiet pass the same height as the Go action beside it.

### Don't:
- **Don't** lead a surface with the category default of snow photo, centred headline, orange button and three cards.
- **Don't** use piste blue or black trail marks as decoration or as generic links.
- **Don't** add a second shadow: one sheet at a time lies over the painting.
- **Don't** put gradients on controls or panels. They belong to the painted sky and to the fade from a painting into snow.
- **Don't** round signs or paper sheets, or use pills for anything but choosing a destination to view.
- **Don't** use red for an action, a current or selected state, focus or an error.
- **Don't** set running text in Bowlby One, or figures in Shantell Sans.
- **Don't** introduce brown, tan or other warm neutrals outside wood objects in the scene.
