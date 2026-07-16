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
    kind: 'project',
    label: 'Call of Cthulhu · 1921',
    title: 'The Blooming',
    cover: 'radial-gradient(ellipse at 30% 20%, #43512f, #212b1c 55%, #0f150b 100%)',
    spine: { texture: 'victorian', grad: 'linear-gradient(90deg,#3c2b12 0%,#1c1408 42%,#3c2b12 88%,#130d05 100%)',
             band: '#1c1408', glow: 'rgba(240,216,150,0.4)', title: '#f5e6b8',
             emblem: 'orchid', accent: '#f0d896', seal: 'assets/sandstone.png', height: 308 },
    flavor: 'Autumn 1921.  Miskatonic University reports unusual activity in nearby Dunwich.  Dare you venture into the hills to investigate the blooming of a rare orchid?',
    gallery: ['assets/orchidheader.png', 'assets/zebulon.png', 'assets/reginald.png'],
    sealImage: 'assets/waxseal.png',
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
    leftImage: 'assets/frigate.png',
    sealShape: 'badge',
    sealImage: 'assets/wave.png',
    headerColor: '#1c3f5c',
    titleFont: "'Pirata One', serif",
    bodyFont: "'IM Fell English', serif",
    pageLabel: 'The Ship’s Log',
    pageTitle: 'Chart a Course',
    ctaText: 'Weigh Anchor to Enter',
    description: 'A multi-game gaming community forming around the MMORPG Pantheon: Rise of the Fallen. Much is yet unwritten, but the banner is raised and the ranks are opening.',
    url: 'https://squallriders.919gaming.com/',
    host: 'squallriders.919gaming.com'
  },
  {
    kind: 'link',
    label: 'Fleet 919',
    title: 'Fleet 919',
    cover: 'radial-gradient(ellipse at 30% 20%, #2a3568, #141a38 55%, #05060f 100%)',
    spine: { texture: 'nebula', grad: 'linear-gradient(90deg,#1c2340 0%,#0e1226 42%,#1c2340 88%,#080a16 100%)',
             band: '#0e1226', glow: 'rgba(212,175,87,0.3)', title: '#e3cf94',
             accent: '#d4af57', seal: 'assets/fleet919.png' },
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
    kind: 'project',
    label: 'Dark Matter · The Margin Sector',
    title: 'Hard Times',
    cover: 'radial-gradient(ellipse at 30% 20%, #2a2f3a, #15181f 55%, #05060a 100%)',
    spine: { texture: 'hazard', grad: 'linear-gradient(90deg,#2a2f3a 0%,#15181f 42%,#2a2f3a 88%,#0d0f14 100%)',
             band: '#15181f', glow: 'rgba(255,176,32,0.3)', title: '#d9a45c',
             emblem: 'ring', mark: '⚠', accent: '#ffb020', height: 312 },
    sealShape: 'badge',
    sealImage: 'assets/hardtimes-logo.png',
    flavor: 'Ten years of civil war have hollowed out an empire, and out on the Margin, six prisoners share a cell block on an asteroid that isn\'t supposed to exist. Guards rotate out. None rotate back.',
    pageTexture: 'digital',
    titleFont: "'Big Shoulders Stencil', sans-serif",
    bodyFont: "'Share Tech Mono', monospace",
    pageLabel: 'The Case File',
    pageTitle: 'Six Prisoners, One Rock',
    ctaText: 'Enter the Black Site',
    description: 'A Dark Matter tabletop campaign set in the lawless Margin sector — equal parts Traveller-inspired frontier and black-site mystery. Follow the briefing, the case files, and the latest word from The Rock.',
    url: 'https://hardtimes.919gaming.com/',
    host: 'hardtimes.919gaming.com'
  }
];
/* Available spine textures: 'leather' (dark, matte, grained), 'victorian' (gilt frame + gloss),
   'whaler' (dark cloth weave, matte, muted), 'nebula' (starfield flecks, for space/sci-fi tomes),
   'hazard' (diagonal amber warning stripes, for gritty/industrial/prison tomes).
   New tomes can reuse one of these, or a new .tex-<name> preset can be added alongside them in index.html.
   Available emblems: 'ring' (monogram), 'orchid', 'whale' — or add a new case to <Emblem/> in icons.jsx.
   spine.seal: set to an image path (e.g. 'assets/fleet919.png') to use that image as the spine's
   bottom emblem instead of <Emblem/> — used for a wax seal or a community's own logo alike.
   kind: 'journal' (your links list), 'project' (description + "Break the Seal to Enter" wax-seal
   CTA — used for community sites that don't need a distinct badge), or 'link' (description + the
   book's own spine.seal image rendered as a clickable badge — used for linking straight to an
   existing external site/brand, e.g. Fleet 919). Add a new kind by branching in RightPage.jsx.

   Per-book page styling (all optional, sensible defaults if unset):
     pageTexture: 'aged' -> applies a stained/foxed, dark parchment background (see .tex-page-aged)
                  instead of the default clean parchment. 'digital' -> a dark HUD/tablet screen
                  (scanlines + grid + glowing amber headers, see .tex-page-digital) for tomes that
                  shouldn't look like paper at all. Add a new .tex-page-<name> preset for more.
     headerColor: color for chapter-label/chapter-title (existing).
     bodyColor:   color for flavor/desc/links text — sets the --ink CSS var in scope, so it flows
                  through to anything using var(--ink) without touching font-family.
     titleFont:   font-family for chapter-label/chapter-title.
     bodyFont:    font-family for flavor/desc text (not .links, which keeps its own Cinzel styling).
     sealSize:    diameter in px for the default circular wax seal (project kind, no sealShape
                  override). Defaults to 200. */
