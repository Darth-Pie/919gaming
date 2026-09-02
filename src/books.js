/* =========================================================================
   ADD A PROJECT: append an object to this array. That's the only edit needed.
     kind:        'project'  -> shows a description + "Enter" wax seal
                  'journal'  -> shows your links list (your personal area)
     spine:       leather gradient + accent colour + emblem for the shelf
   ========================================================================= */
export const books = [
  {
    kind: 'journal',
    label: 'About the Keeper',
    title: "The Keeper's Journal",
    cover: 'radial-gradient(ellipse at 30% 20%, #5a3d24, #3a2417 55%, #261609 100%)',
    spine: { texture: 'leather', grad: 'linear-gradient(90deg,#4a3220 0%,#2c1e13 42%,#4a3220 88%,#211408 100%)',
             band: '#1c1108', glow: 'rgba(156,90,58,0.3)', title: '#d8c7a8',
             emblem: 'ring', mark: 'K', accent: '#9c5a3a', height: 320 },
    // Left page: your bio.  Right page: your links.
    pageTexture: 'aged',
    flavor: 'Enter the dark mind of the Keeper, and find the keys to the realms beyond.',
    links: [
      { name: 'Discord', url: 'https://discord.gg/fleet919', icon: 'discord' },
      { name: 'Send a Raven (Email)', url: 'mailto:darthchurchill@gmail.com', icon: 'raven' }
    ]
  },
  {
    kind: 'sigil',
    label: 'Community Platform · Self-Hosted',
    title: 'mustr',
    cover: 'radial-gradient(ellipse at 30% 20%, #5a3da0, #2c1c5e 55%, #140d2a 100%)',
    spine: { texture: 'arcane', grad: 'linear-gradient(90deg,#3a2668 0%,#1e1440 42%,#3a2668 88%,#140d2a 100%)',
             band: '#160f2e', glow: 'rgba(150,110,240,0.32)', title: '#d9c8ff',
             emblem: 'ring', mark: 'M', accent: '#8b5cf6', height: 322 },
    flavor: 'Every fellowship needs a ledger — a place the muster is called and kept. Rosters and ranks, events and campaigns, medals earned and deeds recorded: mustr is the book that remembers who answered the call, and runs the realm around them.',
    pageTexture: 'arcane',
    pageLabel: 'Gather your crew',
    pageTitle: 'mustr',
    // Right page: scattered sparks assemble into the real mustr mark (see SigilCanvas.jsx),
    // then the CTA links out. sigilConfig is the Sigil Studio's exported tuning.
    sigilMark: 'assets/mustr-mark.png',
    sigilCaption: 'A community, summoned.',
    ctaText: 'Muster your crew',
    sigilConfig: { speed: 1.6, bloom: 'flash', thickness: 3.4, skeletonAfter: 0, glints: 1, sparks: 11, nodeScale: 0.9, halo: 0.8 },
    url: 'https://mustr.gg/',
    host: 'mustr.gg'
  },
  {
    kind: 'project',
    label: 'Call of Cthulhu · 1921',
    title: 'The Blooming',
    cover: 'radial-gradient(ellipse at 30% 20%, #43512f, #212b1c 55%, #0f150b 100%)',
    spine: { texture: 'victorian', grad: 'linear-gradient(90deg,#3c2b12 0%,#1c1408 42%,#3c2b12 88%,#130d05 100%)',
             band: '#1c1408', glow: 'rgba(240,216,150,0.4)', title: '#f5e6b8',
             emblem: 'orchid', accent: '#f0d896', seal: 'assets/sandstone.webp', height: 308 },
    flavor: 'Autumn 1921.  Miskatonic University reports unusual activity in nearby Dunwich.  Dare you venture into the hills to investigate the blooming of a rare orchid?',
    gallery: ['assets/orchidheader.webp', 'assets/zebulon.webp', 'assets/reginald.webp'],
    sealImage: 'assets/sandstone.webp',
    sealSize: 160,
    description: 'A Call of Cthulhu one-shot steeped in H.P. Lovecraft’s cosmic horror. Investigators are drawn to the blooming of an impossibly rare orchid, and to the truth waiting patiently behind it.',
    url: 'https://thebloom.919gaming.com/',
    host: 'thebloom.919gaming.com'
  },
  {
    kind: 'project',
    label: 'Pantheon: Rise of the Fallen',
    title: 'Squall Riders',
    cover: 'radial-gradient(ellipse at 30% 20%, #31465a, #1a2836 55%, #0c1520 100%)',
    spine: { texture: 'whaler', grad: 'linear-gradient(90deg,#26374a 0%,#141f2c 42%,#20303f 88%,#0a121c 100%)',
             band: '#0a121c', glow: 'rgba(120,150,180,0.22)', title: '#a8bccc',
             emblem: 'whale', accent: '#8fa8bd', height: 316 },
    flavor: 'A storm gathers on the horizon of a fallen world, and riders are answering its call. The muster has only just begun.',
    leftImage: 'assets/frigate.webp',
    sealShape: 'badge',
    sealImage: 'assets/wave.webp',
    headerColor: '#1c3f5c',
    titleFont: "'Pirata One', serif",
    bodyFont: "'IM Fell English', serif",
    pageLabel: 'The Ship’s Log',
    pageTitle: 'Chart a Course',
    ctaText: 'Weigh Anchor to Enter',
    description: 'A multi-game gaming community forming around the MMORPG Pantheon: Rise of the Fallen. Much is yet unwritten, but the banner is raised and the ranks are opening.',
    url: 'https://squallriders.com/',
    host: 'squallriders.com'
  },
  {
    kind: 'link',
    label: 'Fleet 919',
    title: 'Fleet 919',
    cover: 'radial-gradient(ellipse at 30% 20%, #2a3568, #141a38 55%, #05060f 100%)',
    spine: { texture: 'nebula', grad: 'linear-gradient(90deg,#1c2340 0%,#0e1226 42%,#1c2340 88%,#080a16 100%)',
             band: '#0e1226', glow: 'rgba(212,175,87,0.3)', title: '#e3cf94',
             accent: '#d4af57', seal: 'assets/fleet919.webp' },
    flavor: 'A fleet has been charted beyond the edge of the map, and 919 has raised its flag among the stars. Set your course, and the fleet will find you.',
    headerColor: '#2f3845',
    bodyColor: '#2f3845',
    titleFont: "'Orbitron', sans-serif",
    bodyFont: "'Rajdhani', sans-serif",
    description: "Fleet 919 is 919 Gaming's home base for coordinating play across games and platforms — musters, voice channels, and the crew keeping the lights on between campaigns.",
    url: 'https://f919.org',
    host: 'f919.org'
  },
  {
    // Was the Hard Times tome. Hard Times is one campaign inside A.N.C.H.O.R.
    // now rather than a site of its own, so the shelf carries the library
    // instead of a single book out of it. hardtimes.919gaming.com still
    // serves that campaign's front page and is linked from inside.
    kind: 'project',
    // Short on purpose: every other tome's label sits on one line, and this
    // one wrapped.
    label: 'The Campaign Archive',
    title: 'A.N.C.H.O.R.',
    // The archive's own palette: teal chrome over near-black, with the amber
    // compass dial as its seal -- which is exactly how the site itself reads.
    // That dial is A.N.C.H.O.R.'s own mark; it is also the site favicon.
    cover: 'radial-gradient(ellipse at 30% 20%, #10323a, #0a1b21 55%, #03080b 100%)',
    spine: { texture: 'nebula', grad: 'linear-gradient(90deg,#12343c 0%,#081c22 42%,#12343c 88%,#03080b 100%)',
             band: '#081c22', glow: 'rgba(57,212,200,0.32)', title: '#9fe8e0',
             emblem: 'ring', mark: 'A', accent: '#39d4c8', height: 312 },
    sealShape: 'badge',
    sealImage: 'assets/anchor-compass.webp',
    flavor: 'Every person met, every room entered, every debt still owed — logged, cross-referenced, and kept. The table forgets by the following Tuesday. The archive does not.',
    pageTexture: 'digital',
    titleFont: "'Big Shoulders Stencil', sans-serif",
    bodyFont: "'Share Tech Mono', monospace",
    pageLabel: 'Archive Online',
    pageTitle: 'Every Campaign on File',
    ctaText: 'Open the Archive',
    description: 'A.N.C.H.O.R. — Automated Network for Cosmic History & Organized Research — is the archive behind the table. Crew, personnel, locations, ships, factions and the loose ends nobody has tied off yet, written up session by session and linked to each other. Hard Times, a Dark Matter campaign out on the Margin, is the first campaign on file.',
    url: 'https://anchor.919gaming.com/',
    host: 'anchor.919gaming.com'
  }
];
/* Available spine textures: 'leather' (dark, matte, grained), 'victorian' (gilt frame + gloss),
   'whaler' (dark cloth weave, matte, muted), 'nebula' (starfield flecks, for space/sci-fi tomes),
   'hazard' (diagonal amber warning stripes, for gritty/industrial/prison tomes),
   'arcane' (amethyst gilt frame + corner jewel, for the mustr flagship / enchanted tomes).
   New tomes can reuse one of these, or a new .tex-<name> preset can be added alongside them in index.html.
   Available emblems: 'ring' (monogram), 'orchid', 'whale' — or add a new case to <Emblem/> in icons.jsx.
   spine.seal: set to an image path (e.g. 'assets/fleet919.webp') to use that image as the spine's
   bottom emblem instead of <Emblem/> — used for a wax seal or a community's own logo alike.
   kind: 'journal' (your links list), 'project' (description + "Break the Seal to Enter" wax-seal
   CTA — used for community sites that don't need a distinct badge), 'link' (description + the
   book's own spine.seal image rendered as a clickable badge — used for linking straight to an
   existing external site/brand, e.g. Fleet 919), or 'sigil' (an animated constellation that
   assembles into the book's own logo mark before the CTA — see SigilCanvas.jsx; the mustr tome
   uses it with sigilMark/sigilCaption/ctaText, and an optional sigilConfig for tuning). Add a new
   kind by branching in RightPage.jsx.

   Per-book page styling (all optional, sensible defaults if unset):
     pageTexture: 'aged' -> applies a stained/foxed, dark parchment background (see .tex-page-aged)
                  instead of the default clean parchment. 'digital' -> a dark HUD/tablet screen
                  (scanlines + grid + glowing amber headers, see .tex-page-digital) for tomes that
                  shouldn't look like paper at all. 'arcane' -> enchanted violet vellum with
                  lavender-gold runic headers (see .tex-page-arcane). Add a new .tex-page-<name>
                  preset for more.
     headerColor: color for chapter-label/chapter-title (existing).
     bodyColor:   color for flavor/desc/links text — sets the --ink CSS var in scope, so it flows
                  through to anything using var(--ink) without touching font-family.
     titleFont:   font-family for chapter-label/chapter-title.
     bodyFont:    font-family for flavor/desc text (not .links, which keeps its own Cinzel styling).
     sealSize:    diameter in px for the default circular wax seal (project kind, no sealShape
                  override). Defaults to 200. */
